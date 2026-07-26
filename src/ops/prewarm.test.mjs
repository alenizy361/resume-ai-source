/**
 * A pre-warmed pack must land on the key the live route will look up.
 *
 * ── why this test is the whole justification for the spend ──
 *
 * Pre-warming costs real money once. If the key it writes differs by one character from the key
 * `/api/generate` computes on a real request, every warmed entry is invisible, every user still waits
 * four seconds, and the invoice is pure waste — with no error anywhere to notice it by.
 *
 * So the first assertion reconstructs the key THE ROUTE'S WAY, from the route's own inputs, and
 * compares it to the one `prewarm` produced. It is the same discipline as the OCR probe sharing
 * `transcribe()` with the route: a copy of the logic tests the copy.
 *
 *   node --experimental-strip-types ops/prewarm.test.mjs
 */

import { batchRequest, plan, targets, SENIORITIES } from "../app/lib/prewarm.ts";
import { normalizeContext, packKey } from "../app/lib/aiCache.ts";
import { modelConfig, MAX_OUTPUT } from "../app/lib/aiModels.ts";
import { JOBS } from "../app/lib/jobs.ts";
import { JOBS_AR } from "../app/lib/jobs-ar.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const list = targets();

/* ─────────── 1. the key matches what the route computes ─────────── */

console.log("\n── a warmed key is the key the route reads ──");

{
  const cfg = modelConfig();
  /*
   * How `/api/generate` builds it, from that route verbatim:
   *   const ctx = normalizeContext(body.context ?? {});
   *   packKey({ ...ctx, modelVersion: cfg.version })
   *
   * The body a real request carries for a catalogue occupation is the occupation slug, the level from
   * the form, the country from the form, and the CV language. Rebuilt here so a drift between the two
   * call sites fails rather than wasting an invoice.
   */
  const mismatches = [];
  for (const t of list.slice(0, 40)) {
    const asRoute = packKey({
      ...normalizeContext({
        occupation: t.occupation, specialization: "",
        seniority: t.seniority, country: t.country, cvLang: t.cvLang,
      }),
      modelVersion: cfg.version,
    });
    if (asRoute !== t.key) mismatches.push(`${t.customId}: ${t.key} vs ${asRoute}`);
  }
  ok("every sampled key equals the route's own computation", mismatches.length === 0,
    mismatches.slice(0, 3).join(" · "));

  /* And the same context in the OTHER language must be a different key, or Arabic users would be
     served the English pack. */
  const en = packKey({ ...normalizeContext({ occupation: "software-engineer", seniority: "Mid", country: "Saudi Arabia", cvLang: "en" }), modelVersion: cfg.version });
  const ar = packKey({ ...normalizeContext({ occupation: "software-engineer", seniority: "Mid", country: "Saudi Arabia", cvLang: "ar" }), modelVersion: cfg.version });
  ok("language is part of the key", en !== ar);
}

/* ─────────── 2. the matrix does not collapse ─────────── */

console.log("\n── every target is its own pack ──");

{
  const keys = new Set(list.map((t) => t.key));
  ok("no two targets share a key", keys.size === list.length, `${keys.size} keys for ${list.length} targets`);

  const ids = new Set(list.map((t) => t.customId));
  ok("no two targets share a custom_id", ids.size === list.length, `${ids.size} ids`);
  /* Anthropic restricts custom_id to [a-zA-Z0-9_-]. An Arabic slug or a space would be rejected for
     the WHOLE batch, after submission. */
  ok("every custom_id is within the permitted charset",
    list.every((t) => /^[a-zA-Z0-9_-]+$/.test(t.customId)),
    list.find((t) => !/^[a-zA-Z0-9_-]+$/.test(t.customId))?.customId ?? "");
  ok("and within the length limit", list.every((t) => t.customId.length <= 64));

  /* Seniority genuinely changes the answer, so it must change the key. Warming one level and calling
     the catalogue "done" is the mistake this dimension exists to prevent. */
  const oneOcc = list.filter((t) => t.occupation === list[0].occupation && t.cvLang === list[0].cvLang);
  ok("each occupation is warmed at every level", oneOcc.length === SENIORITIES.length, `${oneOcc.length}`);
  ok("and each level is a distinct key", new Set(oneOcc.map((t) => t.key)).size === SENIORITIES.length);
}

/* ─────────── 3. a slug is only warmed in a language its catalogue carries ─────────── */

console.log("\n── no pack is warmed in a language no page leads to ──");

{
  const enSlugs = new Set(JOBS.map((j) => j.slug));
  const arSlugs = new Set(JOBS_AR.map((j) => j.slug));
  const stray = list.filter((t) => (t.cvLang === "en" ? !enSlugs.has(t.occupation) : !arSlugs.has(t.occupation)));
  ok("every target's slug exists in that language's catalogue", stray.length === 0,
    stray.slice(0, 3).map((t) => t.customId).join(" · "));
  ok("both catalogues are represented",
    list.some((t) => t.cvLang === "en") && list.some((t) => t.cvLang === "ar"));
}

/* ─────────── 4. the request matches what the live route sends ─────────── */

console.log("\n── the batch request is the route's request ──");

{
  const r = batchRequest(list[0]);
  const p = r.params;
  ok("it carries a custom_id", typeof r.custom_id === "string" && r.custom_id.length > 0);
  ok("the output cap is the task's own", p.max_tokens === MAX_OUTPUT.role_blueprint);
  ok("it sends both cached system blocks",
    Array.isArray(p.system) && p.system.length === 2
    && p.system.every((b) => b.cache_control?.type === "ephemeral"));
  /* Structured outputs are on by default in production; a batch that omitted them would produce
     packs of a different shape from the live ones. */
  ok("it carries the same output_config as the live route", Boolean(p.output_config));
  ok("it uses the fast model, not the reasoning tier", p.model === modelConfig().fastModel);
  ok("the message is the blueprint prompt, carrying the occupation",
    typeof p.messages?.[0]?.content === "string" && p.messages[0].content.includes(list[0].occupation));
}

/* ─────────── 5. the plan states its own bill honestly ─────────── */

console.log("\n── the plan quotes before it spends ──");

{
  const p = plan();
  ok("it counts the whole catalogue", p.occupations === JOBS.length + JOBS_AR.length);
  ok("packs is occupations × levels × countries",
    p.packs === p.occupations * p.seniorities * p.countries, `${p.packs}`);
  ok("distinct keys equals packs", p.distinctKeys === p.packs);
  ok("batch is exactly half of standard",
    Math.abs(p.estimatedUsdBatch * 2 - p.estimatedUsdStandard) < 0.01,
    `${p.estimatedUsdBatch} × 2 vs ${p.estimatedUsdStandard}`);
  /*
   * The number I originally quoted the owner was $0.72, from 113 occupations × 2 languages. Both
   * halves were wrong: the catalogue is 111 entries TOTAL, not 113 per language, and the key includes
   * seniority — a dimension that estimate ignored entirely. Asserted so the real figure cannot quietly
   * drift back toward the comfortable one.
   */
  ok("the estimate accounts for the seniority dimension", p.estimatedUsdBatch > 1,
    `$${p.estimatedUsdBatch} — an estimate under $1 means seniority was dropped again`);
  ok("and a single-level plan is a quarter of it", (() => {
    const one = plan({ seniorities: ["Mid"] });
    return Math.abs(one.estimatedUsdBatch * 4 - p.estimatedUsdBatch) < 0.01;
  })());
  console.log(`\n   ${p.packs} packs · $${p.estimatedUsdBatch} batch · $${p.estimatedUsdStandard} standard\n`);
}

console.log(`${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
