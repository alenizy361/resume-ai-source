import { NextRequest, NextResponse } from "next/server";
import { batchRequest, plan, targets, type PackTarget } from "@/app/lib/prewarm";
import { writePack, packCacheConfigured } from "@/app/lib/packCache";
import { modelConfig } from "@/app/lib/aiModels";
import { PRIVATE_NO_STORE } from "@/app/lib/privateCache";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Pre-warm the shared occupation packs through the Batch API.
 *
 * ── the shape of this endpoint, and why it has four verbs instead of one ──
 *
 * The Batch API is asynchronous by design — that is what buys the 50% discount — so "warm the cache"
 * cannot be one request. It is: decide, submit, wait, collect. Each of those wants to be separately
 * callable, because the expensive one is irreversible and the slow one can take an hour.
 *
 *   GET ?plan=1              free. Prints the matrix and the bill. Spends nothing.
 *   GET ?submit=1&confirm=1  SPENDS. Submits the batch and returns its id.
 *   GET ?status=<batchId>    free. Where the batch is up to.
 *   GET ?collect=<batchId>   free of model cost. Writes the finished packs into Redis.
 *
 * `?submit=1` alone is a dry run. The money is only spent when `confirm=1` is also present, because a
 * one-character typo in a URL should not be able to place an order.
 *
 * ── gated like the health endpoint, and 404 to everyone else ──
 *
 * `HEALTH_TOKEN`, and 404 rather than 401 for a wrong token: a 401 confirms the endpoint exists, which
 * is the one fact worth withholding from someone probing an admin path that can spend money.
 */

function authorised(req: NextRequest): boolean {
  const expected = process.env.HEALTH_TOKEN;
  const given = req.headers.get("x-health-token") || req.nextUrl.searchParams.get("token");
  return Boolean(expected) && given === expected;
}

const deny = () => NextResponse.json({ error: "Not found" }, { status: 404 });
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": PRIVATE_NO_STORE } });

const API = "https://api.anthropic.com/v1/messages/batches";

function anthropicHeaders(key: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return deny();

  const q = req.nextUrl.searchParams;
  const key = process.env.ANTHROPIC_API_KEY?.trim();

  /* Parameters, so the matrix is a decision at call time rather than a constant nobody revisits. */
  const seniorities = q.get("levels")?.split(",").map((s) => s.trim()).filter(Boolean);
  const countries = q.get("countries")?.split(",").map((s) => s.trim()).filter(Boolean);
  const opts = { ...(seniorities?.length ? { seniorities } : {}), ...(countries?.length ? { countries } : {}) };

  /* ── plan: free, and the only way to learn the bill before paying it ── */
  if (q.get("plan") === "1") {
    const list = targets(opts);
    return json({
      ...plan(opts),
      sample: list.slice(0, 3).map((t) => ({ customId: t.customId, key: t.key })),
      next: "Add &submit=1&confirm=1 to spend it. Without confirm=1, submit is a dry run.",
    });
  }

  /* ── submit: the one action that costs money ── */
  if (q.get("submit") === "1") {
    if (!key) return json({ error: "No Anthropic key on this deployment." }, 503);
    const list = targets(opts);
    const p = plan(opts);

    if (q.get("confirm") !== "1") {
      return json({
        dryRun: true, ...p,
        firstRequest: batchRequest(list[0]),
        note: "Nothing was submitted. Add &confirm=1 to spend the amount above.",
      });
    }

    /*
     * One batch, up to the API's per-batch ceiling. 444 requests is comfortably inside it, and
     * chunking is deliberately absent rather than written-and-untested: if the catalogue grows past
     * the limit this returns the provider's own error, which is a better outcome than silent
     * splitting logic nobody has exercised.
     */
    const res = await fetch(API, {
      method: "POST",
      headers: anthropicHeaders(key),
      body: JSON.stringify({ requests: list.map(batchRequest) }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[prewarm] submit ${res.status}: ${body.slice(0, 300)}`);
      return json({ error: `Provider refused the batch (${res.status}).`, detail: body.slice(0, 300) }, 502);
    }
    const data = JSON.parse(body) as { id?: string; processing_status?: string };
    console.log(`[prewarm] submitted batch ${data.id} — ${list.length} packs, ~$${p.estimatedUsdBatch}`);
    return json({
      submitted: true, batchId: data.id, packs: list.length,
      estimatedUsdBatch: p.estimatedUsdBatch,
      next: `Poll ?status=${data.id}, then ?collect=${data.id} when it has ended.`,
    });
  }

  /* ── status: free ── */
  const statusId = q.get("status");
  if (statusId) {
    if (!key) return json({ error: "No Anthropic key on this deployment." }, 503);
    const res = await fetch(`${API}/${encodeURIComponent(statusId)}`, { headers: anthropicHeaders(key) });
    const body = await res.text();
    if (!res.ok) return json({ error: `${res.status}`, detail: body.slice(0, 300) }, 502);
    const d = JSON.parse(body) as { processing_status?: string; request_counts?: unknown; results_url?: string | null };
    return json({
      batchId: statusId,
      processingStatus: d.processing_status,
      counts: d.request_counts,
      ready: d.processing_status === "ended" && Boolean(d.results_url),
      next: d.processing_status === "ended" ? `?collect=${statusId}` : "Not finished — poll again.",
    });
  }

  /* ── collect: read the results and write them into the shared cache ── */
  const collectId = q.get("collect");
  if (collectId) {
    if (!key) return json({ error: "No Anthropic key on this deployment." }, 503);
    if (!packCacheConfigured()) return json({ error: "The pack cache is not configured — nowhere to write." }, 503);

    const meta = await fetch(`${API}/${encodeURIComponent(collectId)}`, { headers: anthropicHeaders(key) });
    if (!meta.ok) return json({ error: `status ${meta.status}` }, 502);
    const { results_url: url, processing_status: st } =
      await meta.json() as { results_url?: string | null; processing_status?: string };
    if (st !== "ended" || !url) return json({ error: `Batch is ${st}, not ended.` }, 409);

    const res = await fetch(url, { headers: anthropicHeaders(key) });
    if (!res.ok) return json({ error: `results ${res.status}` }, 502);
    const text = await res.text();

    /* `custom_id` → target, so a result can be written under the key the route will read. Rebuilt from
       the same `targets()` call rather than parsed out of the id: the id is an identifier, not a
       schema, and reconstructing a key from it would be a second source of truth. */
    const byId = new Map<string, PackTarget>(targets(opts).map((t) => [t.customId, t]));
    const model = modelConfig().fastModel;

    let written = 0, failed = 0, unmatched = 0, unparseable = 0;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row: {
        custom_id?: string;
        result?: { type?: string; message?: { content?: Array<{ text?: string }> } };
      };
      try { row = JSON.parse(line); } catch { unparseable++; continue; }

      const target = row.custom_id ? byId.get(row.custom_id) : undefined;
      if (!target) { unmatched++; continue; }
      if (row.result?.type !== "succeeded") { failed++; continue; }

      const body = row.result.message?.content?.[0]?.text ?? "";
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { unparseable++; continue; }

      const stored = await writePack(target.key, {
        result: parsed as Record<string, unknown>,
        model,
        createdAt: Date.now(),
        usageCount: 0,
        /*
         * "generated", not "ok". These packs have not been read by anyone, and marking a batch of 444
         * unreviewed answers as reviewed would destroy the only signal that distinguishes them.
         */
        qualityStatus: "generated",
      });
      if (stored) written++; else failed++;
    }

    console.log(`[prewarm] collected ${collectId}: ${written} written, ${failed} failed, ${unmatched} unmatched`);
    return json({
      collected: true, batchId: collectId,
      written, failed, unmatched, unparseable,
      note: unmatched > 0
        ? "Unmatched results mean the matrix at collect time differs from the one at submit time — "
          + "pass the same &levels/&countries you submitted with."
        : "Every result mapped to a target.",
    });
  }

  return json({
    usage: {
      plan: "?plan=1 — free, prints the matrix and the bill",
      submit: "?submit=1 (dry run) then &confirm=1 — SPENDS",
      status: "?status=<batchId>",
      collect: "?collect=<batchId> — writes the packs into Redis",
    },
    parameters: {
      levels: "comma-separated, default Entry,Mid,Senior,Lead",
      countries: "comma-separated, default Saudi Arabia",
    },
  });
}
