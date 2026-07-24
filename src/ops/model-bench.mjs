/**
 * Which free NVIDIA model should this product run on?
 *
 * The catalogue is answered by the API, not by a blog post: GET /v1/models is
 * the only list that is true today. Every candidate is then given the product's
 * OWN drafting prompt — imported from app/lib/prompts.ts, not copied — because a
 * benchmark that scores a copy of the prompt measures the copy.
 *
 * The task is the one that actually matters: given nothing but a job title in
 * Arabic, write the duties and skills the user will edit. That is where a weak
 * model shows itself — it invents numbers, echoes the title back, answers in the
 * wrong language, or cannot produce JSON at all.
 *
 *   node --experimental-strip-types src/ops/model-bench.mjs            # bench the shortlist
 *   node --experimental-strip-types src/ops/model-bench.mjs --list     # just print the catalogue
 *   MODELS="a/b,c/d" node ... model-bench.mjs                          # bench exactly these
 *
 * Needs NVIDIA_API_KEY. Spends one call per model per case.
 */

import { DRAFT_PROMPT, DRAFT_SCHEMA, draftUserMessage } from "../app/lib/prompts.ts";

const KEY = process.env.NVIDIA_API_KEY;
const BASE = "https://integrate.api.nvidia.com/v1";

/** Only NVIDIA models need the NVIDIA key — an Anthropic-only run must not demand it. */
function requireNvidiaKey() {
  if (KEY) return;
  console.error("NVIDIA_API_KEY is not set — cannot reach the NVIDIA catalogue.");
  process.exit(1);
}

/**
 * The cases a resume builder must not fail.
 *
 * The third is the one most users here actually are: they speak Arabic, they
 * name their job in Arabic, and they want an English CV because that is what
 * the employer's ATS reads. A model can pass the pure-Arabic and pure-English
 * cases and still fail this one by answering in the language it was asked in
 * rather than the language it was told to write.
 */
const CASES = [
  {
    id: "cashier-ar",
    label: "كاشير — مدخل عربي، سيرة عربية",
    opts: { role: "كاشير", industry: "تجزئة", langWord: "Arabic" },
  },
  {
    id: "radiographer-ar",
    label: "أخصائي أشعة — مدخل عربي، سيرة عربية",
    opts: { role: "أخصائي أشعة", years: 4, industry: "الرعاية الصحية", langWord: "Arabic" },
  },
  {
    id: "accountant-ar-to-en",
    label: "محاسب — مدخل عربي، سيرة إنجليزية",
    opts: { role: "محاسب", years: 7, industry: "المقاولات", langWord: "English" },
  },
  {
    id: "sales-en",
    label: "Sales Manager — مدخل إنجليزي، سيرة إنجليزية",
    opts: { role: "Sales Manager", years: 5, industry: "FMCG distribution", langWord: "English" },
  },
];

const ARABIC = /[؀-ۿ]/;
/** A metric of any kind. Drafted duties may not contain one — those are the user's facts. */
const METRIC = /\d|[٠-٩]|%|٪|\bpercent\b|\bمئة\b/i;
const PLACEHOLDER = /\[[^\]]*(أضف|add|your|رقم)[^\]]*\]/i;

async function listModels() {
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`GET /models ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.data ?? []).map((m) => String(m.id)).sort();
}

/**
 * Chat models only. Embedding, reranking, vision, speech, and safety models are
 * in the same catalogue and cannot do this task at all — benchmarking them would
 * just be a slow way of printing errors.
 */
function isChatCandidate(id) {
  const bad = /embed|rerank|guard|safety|ocr|speech|asr|tts|riva|vision|vila|clip|nemoretriever|parakeet|codestral|paraphrase|florence|sana|flux|stable-?diffusion|maisi|molmo|deplot|nvclip/i;
  return !bad.test(id);
}

/**
 * A Claude id routes to Anthropic. Same prompt, same cases, same scoring — the
 * only way a comparison between providers means anything is if the only thing
 * that differs is the model.
 */
async function draftAnthropic(model, opts, timeoutMs = 120_000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, ms: 0, err: "ANTHROPIC_API_KEY not set" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: DRAFT_PROMPT,
        messages: [{ role: "user", content: draftUserMessage(opts) }],
        // Structured output: the schema is enforced, so a parse failure here
        // would be the provider's bug rather than the prompt's.
        output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, ms, err: `HTTP ${res.status} ${(await res.text()).slice(0, 160)}` };
    const data = await res.json();
    const raw = (data?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return { ok: true, ms, raw, in: data?.usage?.input_tokens ?? 0, out: data?.usage?.output_tokens ?? 0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e?.name === "AbortError" ? "timeout" : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function draft(model, opts, timeoutMs = 90_000) {
  if (/^claude/i.test(model)) return draftAnthropic(model, opts);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        top_p: 0.9,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DRAFT_PROMPT },
          {
            role: "user",
            content: `${draftUserMessage(opts)}\n\nRespond with STRICT JSON ONLY: {"duties":["..."],"skills":["..."]}`,
          },
        ],
      }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, ms, err: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
    const data = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "");
    const usage = data?.usage ?? {};
    return { ok: true, ms, raw, in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e?.name === "AbortError" ? "timeout" : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(raw) {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  try { return JSON.parse(a !== -1 && b > a ? cleaned.slice(a, b + 1) : cleaned); } catch { return null; }
}

/**
 * Score one draft. Every check is something a real user would notice, and the
 * fabrication check is weighted hardest because it is the product's promise.
 */
function score(parsed, wantArabic) {
  const duties = Array.isArray(parsed?.duties) ? parsed.duties.map(String) : [];
  const skills = Array.isArray(parsed?.skills) ? parsed.skills.map(String) : [];
  const notes = [];
  let pts = 0;

  if (duties.length >= 4 && duties.length <= 8) { pts += 20; }
  else notes.push(`duties=${duties.length}`);

  if (skills.length >= 5) pts += 15;
  else notes.push(`skills=${skills.length}`);

  const all = [...duties, ...skills];
  const fabricated = duties.filter((d) => METRIC.test(d));
  if (fabricated.length === 0) pts += 30;
  else notes.push(`INVENTED METRICS ×${fabricated.length}`);

  if (!all.some((l) => PLACEHOLDER.test(l))) pts += 10;
  else notes.push("placeholder leaked");

  const arabicDuties = duties.filter((d) => ARABIC.test(d)).length;
  const langOk = wantArabic ? arabicDuties >= duties.length * 0.8
                            : arabicDuties <= duties.length * 0.2;
  if (langOk) pts += 15;
  else notes.push(wantArabic ? "answered in English" : "answered in Arabic");

  // Length is a proxy for "written" vs "echoed": a 3-word duty is the title again.
  const avg = duties.length ? duties.reduce((s, d) => s + d.split(/\s+/).length, 0) / duties.length : 0;
  if (avg >= 6) pts += 10;
  else notes.push(`thin lines (avg ${avg.toFixed(1)} words)`);

  return { pts, duties, skills, notes };
}

const args = process.argv.slice(2);
const requestedEarly = (process.env.MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
// Only ask NVIDIA for its catalogue when we actually need it to choose.
const needCatalogue = !requestedEarly.length || args.includes("--list");
if (needCatalogue || requestedEarly.some((m) => !/^claude/i.test(m))) requireNvidiaKey();
const catalogue = needCatalogue ? await listModels() : [];

if (args.includes("--list")) {
  console.log(`${catalogue.length} models in the catalogue:\n`);
  for (const id of catalogue) console.log(`  ${isChatCandidate(id) ? "chat" : "    "}  ${id}`);
  process.exit(0);
}

// An explicit list wins; otherwise take the chat models the catalogue advertises.
const models = requestedEarly.length ? requestedEarly : catalogue.filter(isChatCandidate);

if (catalogue.length) {
  console.log(`catalogue: ${catalogue.length} models, ${catalogue.filter(isChatCandidate).length} chat-capable`);
}
console.log(`benchmarking ${models.length}: ${models.join(", ")}\n`);

const results = [];
for (const model of models) {
  let total = 0, failed = 0, ms = 0, tin = 0, tout = 0;
  const detail = [];
  for (const c of CASES) {
    // NVIDIA's free tier allows 40 requests a minute. Forty calls fired as fast
    // as they return would measure the rate limiter, not the models — the same
    // mistake the cost run made against this product's own limiter.
    await new Promise((r) => setTimeout(r, 1500));
    const r = await draft(model, c.opts);
    ms += r.ms;
    if (!r.ok) { failed++; detail.push({ case: c.id, err: r.err }); continue; }
    tin += r.in; tout += r.out;
    const parsed = parseJson(r.raw);
    if (!parsed) { failed++; detail.push({ case: c.id, err: "unparseable JSON" }); continue; }
    const s = score(parsed, c.opts.langWord === "Arabic");
    total += s.pts;
    detail.push({ case: c.id, pts: s.pts, notes: s.notes, duties: s.duties, skills: s.skills });
  }
  const max = CASES.length * 100;
  results.push({ model, total, max, failed, ms, tin, tout, detail });
  const bar = "█".repeat(Math.round((total / max) * 20)).padEnd(20, "·");
  console.log(`${String(total).padStart(3)}/${max}  ${bar}  ${(ms / CASES.length / 1000).toFixed(1)}s  ${failed ? `${failed} failed  ` : ""}${model}`);
}

results.sort((a, b) => b.total - a.total || a.ms - b.ms);

console.log("\n════════ RANKING ════════");
for (const [i, r] of results.entries()) {
  console.log(`${i + 1}. ${r.model} — ${r.total}/${r.max}, ${(r.ms / CASES.length / 1000).toFixed(1)}s/call, ${r.tin}in/${r.tout}out`);
}

const win = results[0];
if (win) {
  console.log(`\n════════ WHAT THE WINNER ACTUALLY WROTE — ${win.model} ════════`);
  for (const d of win.detail) {
    const c = CASES.find((x) => x.id === d.case);
    console.log(`\n── ${c.label} — ${d.pts ?? "FAILED"}/100 ${d.notes?.length ? `(${d.notes.join(", ")})` : ""}`);
    if (d.err) { console.log(`   ${d.err}`); continue; }
    for (const line of d.duties) console.log(`   • ${line}`);
    console.log(`   المهارات: ${d.skills.join("، ")}`);
  }
}

console.log(`\nAI_MODEL=${win?.model ?? "(none)"}`);
