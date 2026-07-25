/**
 * Does the model actually understand the 111 occupations this product sells pages for?
 *
 * `ops/model-bench.mjs` answers "which model" using three cases. This answers a different and
 * larger question: given the catalogue we publish — 50 English occupations and 61 Arabic ones,
 * from Software Engineer to أخصائي أشعة to كاشير — how often does the chosen model produce a
 * usable, honest first draft, and which titles does it fail?
 *
 * That matters because the SEO surface promises coverage. A page exists for every one of these
 * titles, and each of those pages invites someone into the builder. If the drafter is strong on
 * software engineering and weak on the trades, the product is quietly worse for exactly the
 * users who most need the blank page filled in.
 *
 * ── WHAT THIS MEASURES, AND WHAT IT DOES NOT ──
 *
 * The RAW MODEL, not the product. It calls the provider directly, so nothing here has passed
 * through `filterFresh`, `cleanItems`, `scrubSuggestion` or `stripPlaceholders` — the four
 * things the route applies before a suggestion is ever shown.
 *
 * That distinction changes how two of the numbers should be read, and reading them wrong is a
 * mistake already made once with this file's own output:
 *
 *   `distinct`     Largely ABSORBED by the product. `filterFresh` already compares incoming
 *                  suggestions against each other with `saysTheSame`, so near-duplicates are
 *                  dropped before display. A low rate here means the model WASTES lines, not
 *                  that users see repeats — the real symptom is being offered six suggestions
 *                  after asking for eight.
 *   `no-numbers`   Also absorbed: the route strips figures. A hit means "this line would have
 *                  been rewritten", not "a fabricated number reached a CV".
 *
 * The other checks are not absorbed and DO reach the user: a timeout is a dead end, unparseable
 * JSON renders an empty section, and a CV in the wrong language is shipped as-is.
 *
 * ── WHAT IS SCORED, AND WHY EACH ONE ──
 *
 * Every check below is the product's own rule, using the product's own helper where one exists
 * (`hasMetric`, `hasDigits`, `extractJsonValue` — imported, not reimplemented, so the bench
 * cannot drift from the route it is measuring):
 *
 *   json          The route parses strict JSON. A model that writes prose here fails closed and
 *                 the user sees an empty section, so this is pass/fail before anything else.
 *   duties        6–10. Fewer than six is not a draft; the route caps at ten.
 *   skills        6 or more, because the skills step renders them as grouped chips.
 *   language      The CV's language, not the prompt's. This is the failure that shipped: an
 *                 Arabic-speaking applicant asking for an English CV and getting Arabic duties.
 *                 Scored in both directions.
 *   no-numbers    DRAFTING_DOCTRINE forbids inventing figures. The user gave a job title and
 *                 nothing else, so ANY metric in a duty is fabricated — "reduced wait times by
 *                 30%" is a lie with a number in it, which is worse than a vague sentence.
 *                 Uses `hasMetric`, which is deliberately blunt: it flags "ISO 9001" and
 *                 "CT 128-slice" too. That is not noise in this bench — it is the product's
 *                 own rule, so a failure here means "the route would have stripped this line",
 *                 which is exactly what is worth knowing.
 *   no-brackets   No "[insert X]" placeholders. The route strips them; a model that needs
 *                 stripping is a model doing the wrong thing.
 *   no-echo       A duty that is just the job title back is filler that costs a call.
 *   distinct      Ten ways of saying the same duty is one duty and nine wasted lines.
 *
 * ── COST ──
 *
 * One call per title. The full run is 111 calls on a free NVIDIA model. `--limit` and `--lang`
 * exist so a smaller sample can be taken first.
 *
 *   node --experimental-strip-types ops/titles-bench.mjs                  # all 111
 *   node --experimental-strip-types ops/titles-bench.mjs --lang=ar        # the 61 Arabic
 *   node --experimental-strip-types ops/titles-bench.mjs --limit=12       # a sample
 *   OUT=bench.md node ... ops/titles-bench.mjs                            # also write markdown
 *
 * Needs NVIDIA_API_KEY. Prints a table and, with OUT set, writes the same as markdown.
 */

import { appendFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { DRAFT_PROMPT, DRAFT_SCHEMA, draftUserMessage } from "../app/lib/prompts.ts";
import { hasMetric, extractJsonValue } from "../app/lib/suggestShapes.ts";
import { JOBS } from "../app/lib/jobs.ts";
import { JOBS_AR } from "../app/lib/jobs-ar.ts";

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : dflt;
};

const LANG = arg("lang", "both");
const LIMIT = Number(arg("limit", "0")) || 0;
/** Four at a time: enough to finish 111 titles in a few minutes, gentle enough not to 429. */
const CONCURRENCY = Number(arg("concurrency", "4"));

/**
 * Which provider is under test.
 *
 * Both get the SAME system prompt, the SAME user message and the SAME scoring, because the
 * question is which one drafts a Saudi CV better — not which one is easier to prompt. The only
 * differences are the ones the APIs force: NVIDIA takes `response_format: json_object` and a
 * shape sentence appended to the user turn, Anthropic takes a real JSON schema.
 */
const PROVIDER = (arg("provider", process.env.AI_PROVIDER || "nvidia")).toLowerCase();
const ANTHROPIC = PROVIDER === "anthropic";

const KEY = ANTHROPIC ? process.env.ANTHROPIC_API_KEY : process.env.NVIDIA_API_KEY;
const BASE = "https://integrate.api.nvidia.com/v1";
const MODEL = ANTHROPIC
  ? (process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || "claude-opus-5")
  : (process.env.NVIDIA_MODEL || process.env.AI_MODEL || "meta/llama-4-maverick-17b-128e-instruct");

if (!KEY) {
  console.error(`${ANTHROPIC ? "ANTHROPIC_API_KEY" : "NVIDIA_API_KEY"} is not set — this bench calls the real model and cannot run without it.`);
  process.exit(1);
}

/* ─────────────────────────── the catalogue ─────────────────────────── */

/**
 * Every title, with the language its CV should come back in.
 *
 * The Arabic list carries `titleEn`, which is deliberately NOT used here: the point is to ask
 * in Arabic and require Arabic out, because that is what an Arabic page's visitor will do.
 */
function catalogue() {
  const en = JOBS.map((j) => ({
    id: `en/${j.slug}`, title: j.title, industry: j.category,
    lang: "en", langWord: "English",
  }));
  const ar = JOBS_AR.map((j) => ({
    id: `ar/${j.slug}`, title: j.title, industry: j.category,
    lang: "ar", langWord: "Arabic",
  }));
  let list = LANG === "en" ? en : LANG === "ar" ? ar : [...ar, ...en];
  if (LIMIT) {
    // Take a spread rather than the first N, so a sample is not all one category — the lists are
    // grouped by category, and the first twelve English titles are all Technology.
    const step = Math.max(1, Math.floor(list.length / LIMIT));
    list = list.filter((_, i) => i % step === 0).slice(0, LIMIT);
  }
  return list;
}

/* ─────────────────────────── the call ─────────────────────────── */

/**
 * 20 s, down from 90 s.
 *
 * The first full run set this at 90 s and spent roughly 25 of its 33 minutes waiting on 17
 * hung requests. It also proved the ceiling was pointless: across 94 successful calls the
 * slowest returned in 3.6 s, and not one returned between 4 s and 90 s. A hang is a hang.
 * Lowering it loses no information and makes the run four times faster.
 */
const TIMEOUT_MS = 20_000;

/**
 * How many times a hung request is re-sent, mirroring `TASKS.duties_draft.timeoutRetries`.
 *
 * This is here to MEASURE the product's retry policy rather than to make the bench look good.
 * The first run left 17 of 111 titles hung at the ceiling, which is what justified retrying at
 * all; the honest way to check that decision is to re-send and count how many recover. So the
 * report distinguishes three outcomes, not two: succeeded first time, RECOVERED ON RETRY, and
 * hung on every attempt.
 *
 * `--retries=0` reproduces the original single-attempt measurement.
 */
const TIMEOUT_RETRIES = Number(arg("retries", "2"));

async function draft(job) {
  let attempts = 0;
  const t0 = Date.now();
  for (;;) {
    attempts++;
    const out = await once(job);
    // Only a hang is retried here — a 4xx or 5xx is reported as it came, exactly as the
    // product does, so the bench cannot flatter the provider by hiding real refusals.
    if (out.error !== "timeout" || attempts > TIMEOUT_RETRIES) {
      return { ...out, attempts, ms: Date.now() - t0 };
    }
  }
}

async function once(job) {
  return ANTHROPIC ? onceAnthropic(job) : onceNvidia(job);
}

/**
 * Anthropic, with the shape enforced by a real schema instead of a sentence.
 *
 * `DRAFT_SCHEMA` is the same object `/api/interview` passes, so a response that parses here
 * would parse there. No web search: the product's Anthropic draft path DOES offer search, so
 * this understates what Claude would produce in the product — but search costs seconds and
 * money per title, and the comparison being made is of drafting quality on a bare job title,
 * which is what the NVIDIA side gets too. Turning it on for 111 titles is a separate question.
 *
 * `maxRetries: 0` because this file owns its own retry policy and measures it.
 */
async function onceAnthropic(job) {
  const t0 = Date.now();
  const client = new Anthropic({ apiKey: KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: DRAFT_PROMPT,
      output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      messages: [{ role: "user", content: draftUserMessage({
        role: job.title, industry: job.industry, langWord: job.langWord,
      }) }],
    });
    const ms = Date.now() - t0;
    if (res.stop_reason === "refusal") return { ms, error: "refusal" };
    const block = res.content.find((b) => b.type === "text");
    return { ms, text: block && block.type === "text" ? block.text : "" };
  } catch (e) {
    const ms = Date.now() - t0;
    // The SDK raises its own timeout as APIConnectionTimeoutError; normalise so the retry
    // logic and the report do not have to know which provider produced the hang.
    const name = e?.constructor?.name ?? "";
    if (/Timeout/i.test(name) || e?.name === "AbortError") return { ms, error: "timeout" };
    const status = e?.status;
    return { ms, error: status ? `http-${status}` : "network", detail: String(e?.message ?? e).slice(0, 120) };
  }
}

async function onceNvidia(job) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DRAFT_PROMPT },
          {
            role: "user",
            content: `${draftUserMessage({
              role: job.title, industry: job.industry, langWord: job.langWord,
            })}\n\nReturn STRICT JSON ONLY: {"duties":["…"],"skills":["…"]} — 6 to 10 duties, 6 to 12 skills.`,
          },
        ],
      }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ms, error: `http-${res.status}`, detail: body.slice(0, 120) };
    }
    const data = await res.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content ?? "";
    return { ms, text };
  } catch (e) {
    return { ms: Date.now() - t0, error: e.name === "AbortError" ? "timeout" : "network", detail: String(e).slice(0, 100) };
  } finally { clearTimeout(timer); }
}

/* ─────────────────────────── the scoring ─────────────────────────── */

const ARABIC = /[؀-ۿ]/;
const BRACKET = /\[[^\]]{2,}\]|_{3,}|\{\{|xx+\s*(years|سنة|سنوات)/i;

/**
 * Two duties that say the same thing.
 *
 * Deliberately crude — three or more shared content words of five letters or more. A precise
 * semantic comparison is a different project, and the failure being looked for here is a model
 * padding to ten lines by rewording line three, which is not subtle.
 */
function nearDuplicate(a, b) {
  const words = (s) => new Set(String(s).toLowerCase().match(/[\p{L}]{5,}/gu) ?? []);
  const A = words(a), B = words(b);
  if (A.size < 3 || B.size < 3) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared >= 3;
}

function score(job, out) {
  const checks = {};
  const notes = [];

  if (out.error) {
    return { checks: { json: false }, notes: [`${out.error}${out.detail ? `: ${out.detail}` : ""}`], duties: 0, skills: 0 };
  }

  const parsed = extractJsonValue(out.text);
  const duties = Array.isArray(parsed?.duties) ? parsed.duties.filter((x) => typeof x === "string" && x.trim()) : null;
  const skills = Array.isArray(parsed?.skills) ? parsed.skills.filter((x) => typeof x === "string" && x.trim()) : null;

  checks.json = Boolean(duties && skills);
  if (!checks.json) {
    notes.push(`unparseable: ${String(out.text).slice(0, 70).replace(/\s+/g, " ")}`);
    return { checks, notes, duties: 0, skills: 0 };
  }

  checks.duties = duties.length >= 6 && duties.length <= 10;
  if (!checks.duties) notes.push(`${duties.length} duties`);

  checks.skills = skills.length >= 6;
  if (!checks.skills) notes.push(`${skills.length} skills`);

  const all = [...duties, ...skills].join("\n");

  if (job.lang === "ar") {
    // Arabic asked for, Arabic required. A stray English tool name is fine; English SENTENCES
    // are the failure — so the test is "does every duty contain Arabic".
    const latinOnly = duties.filter((d) => !ARABIC.test(d));
    checks.language = latinOnly.length === 0;
    if (!checks.language) notes.push(`${latinOnly.length} duties not in Arabic: "${latinOnly[0].slice(0, 40)}"`);
  } else {
    const arabicIn = duties.filter((d) => ARABIC.test(d));
    checks.language = arabicIn.length === 0;
    if (!checks.language) notes.push(`Arabic on an English CV: "${arabicIn[0].slice(0, 40)}"`);
  }

  /*
   * The no-fabrication rule, applied where it bites hardest.
   *
   * The only input was a job title. So every figure in a duty was invented by the model, and
   * `hasMetric` is the product's own definition of what counts as one.
   */
  const withNumbers = duties.filter((d) => hasMetric(d));
  checks["no-numbers"] = withNumbers.length === 0;
  if (!checks["no-numbers"]) notes.push(`invented figure: "${withNumbers[0].slice(0, 50)}"`);

  checks["no-brackets"] = !BRACKET.test(all);
  if (!checks["no-brackets"]) notes.push(`placeholder: "${(all.match(BRACKET) ?? [""])[0].slice(0, 30)}"`);

  const echo = duties.filter((d) => d.trim().toLowerCase() === job.title.trim().toLowerCase());
  checks["no-echo"] = echo.length === 0;
  if (!checks["no-echo"]) notes.push("a duty is just the job title");

  let dupes = 0;
  for (let i = 0; i < duties.length; i++) {
    for (let k = i + 1; k < duties.length; k++) if (nearDuplicate(duties[i], duties[k])) dupes++;
  }
  checks.distinct = dupes === 0;
  if (!checks.distinct) notes.push(`${dupes} near-duplicate duty pair(s)`);

  return { checks, notes, duties: duties.length, skills: skills.length, sample: duties[0] };
}

/* ─────────────────────────── the run ─────────────────────────── */

const CHECK_NAMES = ["json", "duties", "skills", "language", "no-numbers", "no-brackets", "no-echo", "distinct"];

async function pool(items, n, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }));
  return out;
}

const jobs = catalogue();
console.log(`provider: ${PROVIDER} · model: ${MODEL}`);
console.log(`titles: ${jobs.length} (${jobs.filter((j) => j.lang === "ar").length} ar, ${jobs.filter((j) => j.lang === "en").length} en) · ${CONCURRENCY} at a time\n`);

/*
 * Every result is written the moment it exists, not at the end.
 *
 * 111 calls against a slow provider is a long job, and a job that is killed at its timeout
 * after collecting a hundred usable results and reporting none of them has wasted every one of
 * those calls. The same mistake cost this project a full route-suite run earlier: the summary
 * lived in a buffer and the buffer died with the process.
 *
 * So `OUT` is opened now and appended to per title. A timeout then costs the aggregate table
 * and nothing else, and the aggregate can be recomputed from the lines.
 */
if (process.env.OUT) {
  writeFileSync(process.env.OUT,
    `# Titles bench — ${PROVIDER} · ${MODEL}\n\n${jobs.length} titles · started before any aggregate existed, so a killed run still leaves the rows below.\n\n`
    + `| # | title | ms | duties | skills | failed | detail |\n|---|---|---|---|---|---|---|\n`);
}

const results = await pool(jobs, CONCURRENCY, async (job, i) => {
  const out = await draft(job);
  const s = score(job, out);
  const failed = CHECK_NAMES.filter((c) => s.checks[c] === false);
  const mark = failed.length === 0 ? "✅" : failed.includes("json") ? "🛑" : "⚠️ ";
  console.log(
    `${mark} ${String(i + 1).padStart(3)}/${jobs.length} ${job.id.padEnd(34)} ` +
    `${String(out.ms).padStart(6)}ms  ${s.duties}d/${s.skills}s  ` +
    (failed.length ? `FAIL ${failed.join(",")} — ${s.notes[0] ?? ""}` : ""),
  );
  if (process.env.OUT) {
    try {
      appendFileSync(process.env.OUT,
        `| ${i + 1} | ${job.id} | ${out.ms} | ${s.duties} | ${s.skills} | ${failed.join(", ") || "—"} | `
        + `${(s.notes[0] ?? "").replace(/\|/g, "/").slice(0, 90)} |\n`);
    } catch { /* a full disk must not lose the calls already made */ }
  }
  return { job, out, s, failed };
});

/* ─────────────────────────── the report ─────────────────────────── */

const clean = results.filter((r) => r.failed.length === 0);
const broken = results.filter((r) => r.failed.includes("json"));
const perCheck = CHECK_NAMES.map((c) => {
  const ran = results.filter((r) => r.s.checks[c] !== undefined);
  const passed = ran.filter((r) => r.s.checks[c]);
  return { c, passed: passed.length, ran: ran.length };
});
const times = results.map((r) => r.out.ms).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)] ?? 0;
const p95 = times[Math.floor(times.length * 0.95)] ?? 0;

const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };

say();
say(`── ${clean.length}/${results.length} titles produced a clean, honest draft ──`);
say();
say("| check | pass | rate |");
say("|---|---|---|");
for (const p of perCheck) {
  say(`| ${p.c} | ${p.passed}/${p.ran} | ${p.ran ? Math.round((p.passed / p.ran) * 100) : 0}% |`);
}
say();
say(`latency: median ${median}ms · p95 ${p95}ms · slowest ${times.at(-1)}ms`);

/*
 * The retry policy, measured rather than assumed.
 *
 * `recovered` is the number of titles that hung at least once and then answered — the whole
 * justification for `timeoutRetries` in `lib/aiTasks.ts`. If it is near zero, that policy is
 * wrong and should be reverted; if it is most of the hangs, the product just got 15% of its
 * catalogue back.
 */
{
  const retried = results.filter((r) => (r.out.attempts ?? 1) > 1);
  const recovered = retried.filter((r) => !r.out.error);
  say();
  say(`timeout retries (${TIMEOUT_RETRIES} allowed): ${retried.length} titles hung at least once, `
    + `${recovered.length} then answered, ${retried.length - recovered.length} never did`);
  if (recovered.length) say(`recovered: ${recovered.map((r) => r.job.id).join(", ")}`);
}
if (broken.length) say(`\nunparseable (${broken.length}): ${broken.map((r) => r.job.id).join(", ")}`);

for (const lang of ["ar", "en"]) {
  const set = results.filter((r) => r.job.lang === lang);
  if (!set.length) continue;
  const good = set.filter((r) => r.failed.length === 0).length;
  say(`\n${lang}: ${good}/${set.length} clean (${Math.round((good / set.length) * 100)}%)`);
}

const worst = results.filter((r) => r.failed.length > 0);
if (worst.length) {
  say(`\n── every title with a finding (${worst.length}) ──`);
  say();
  say("| title | failed | detail |");
  say("|---|---|---|");
  for (const r of worst) {
    say(`| ${r.job.id} | ${r.failed.join(", ")} | ${(r.s.notes[0] ?? "").replace(/\|/g, "/").slice(0, 90)} |`);
  }
}

if (process.env.OUT) {
  // The per-title rows are already there; this appends the aggregate under them.
  appendFileSync(process.env.OUT, `\n${lines.join("\n")}\n`);
  console.log(`\nwrote ${process.env.OUT}`);
}

/*
 * Exit code is a measurement, not a gate.
 *
 * This run tells us how good the model is across the catalogue; it is not a build check, and
 * failing CI because a model phrased one duty badly would train everyone to ignore it. Only a
 * total inability to reach the provider is an error.
 */
process.exit(results.every((r) => r.out.error) ? 1 : 0);
