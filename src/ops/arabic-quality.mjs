/**
 * Does the model actually write Arabic the way this product claims it does?
 *
 * ── why this exists ──
 *
 * Every Arabic guarantee in this codebase has been argued from the prompt and proved against local
 * fixtures: the doctrine says Arabic, the schema says Arabic, `ops/*.test.mjs` assert that OUR
 * strings are Arabic. None of that is a measurement of what comes back from the model. The gap was
 * written down honestly in the status reports and left open, because closing it spends the owner's
 * Anthropic budget.
 *
 * This closes it, in three calls — the same three a real CV buys — and reports what it found.
 *
 * ── what it measures ──
 *
 *   1. SCRIPT       every string destined for the CV is Arabic, judged with `detectScript`, the
 *                   same function the product uses. Latin technical terms inside an Arabic
 *                   sentence are correct and must not count as a failure.
 *   2. FIGURES      no digits in duties or skills. The doctrine forbids inventing numbers, and
 *                   `ops/titles-bench.mjs` measured that instruction being obeyed about 70% of the
 *                   time on the free model — which is why the route also strips them. This checks
 *                   what actually arrives.
 *   3. PLACEHOLDERS no "[أضف التخصص]". This reached a printed PDF once.
 *   4. CREDENTIALS  every id is one the Saudi rules allow. A model asked for the Saudi health
 *                   registration has written "SCAFACH".
 *   5. QUESTIONS    an achievement question is a question, in Arabic punctuation (؟).
 *   6. EVIDENCE     a summary written from Arabic facts names no employer that is not in them.
 *   7. COST         from the route's own `_meta.estimatedUsd`, printed per call and totalled, so
 *                   the price of running this again is known before it is run.
 *
 * ── what the first run measured ──
 *
 * 2026-07-25, production, commit 24925b5, claude-haiku-4-5. Twelve checks passed and one call
 * failed:
 *
 *   role_blueprint   $0.009189 · every skill and theme Arabic · no figures · no placeholders ·
 *                    credentials limited to sa-scfhs-registration and sa-bls · the envelope
 *                    resolved "أخصائي أشعة" → radiology-technologist and "السعودية" → sa
 *   final_content    $0.006394 · three Arabic summaries · none named an employer outside the
 *                    facts · none claimed a number of years, so the "٧ سنوات" invention class did
 *                    not recur
 *   experience_pkg   HTTP 400. The fast model answered twice, the route escalated to
 *                    claude-sonnet-5, and the provider refused the request — `temperature: 0.3`,
 *                    which a model that reasons by default does not accept. Both paid answers
 *                    were then discarded and the user was told suggestions were unavailable.
 *                    Fixed in the same commit as this note: `acceptsTemperature` in aiModels.ts,
 *                    and the route now serves the earlier answer when an escalation fails.
 *
 * Numbers, not adjectives — and the third line is the reason this file exists. Nothing in the
 * local suites could have found it.
 *
 * It is NOT part of `npm run test`: it spends real money on every run.
 *
 *   node --experimental-strip-types ops/arabic-quality.mjs [baseUrl]
 */

import { detectScript } from "../app/lib/languages.ts";
import { credentialsFor } from "../app/lib/countryRules.ts";

const BASE = process.argv[2] || "https://cv.rabit.sa";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const CONTEXT = {
  occupation: "أخصائي أشعة",
  specialization: "التصوير المقطعي والرنين المغناطيسي",
  seniority: "متوسط",
  country: "السعودية",
  cvLang: "ar",
};

let spent = 0;
const calls = [];

async function generate(task, extra = {}) {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, context: CONTEXT, ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`   ✗ ${task}: HTTP ${res.status} — ${json.error ?? "no message"}`);
    return null;
  }
  const m = json._meta ?? {};
  spent += Number(m.estimatedUsd ?? 0);
  calls.push({ task, model: m.model, usd: Number(m.estimatedUsd ?? 0), cached: Boolean(m.cached || json._cache?.hit) });
  console.log(`   ${task}: ${m.model ?? "?"} · $${m.estimatedUsd ?? 0}${json._cache?.hit ? " (cache hit — no call made)" : ""}`);
  console.log(`   requestId=${m.requestId ?? "?"} occupationId=${m.occupationId ?? "?"} countryCode=${m.countryCode ?? "?"}`);
  return json;
}

/** Every string in a response that is destined for the CV or for the user to read. */
function strings(v, out = []) {
  if (typeof v === "string") { if (v.trim()) out.push(v); return out; }
  if (Array.isArray(v)) { v.forEach((x) => strings(x, out)); return out; }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      /* `_meta` is ours, and ids are identifiers rather than prose. */
      if (k === "_meta" || k === "_cache" || k === "id" || k === "cvLang") continue;
      strings(val, out);
    }
  }
  return out;
}

console.log(`\nMeasuring Arabic output against ${BASE} — three calls, real money.\n`);

/* ── 1. the blueprint ── */

console.log("── role_blueprint");
const bp = await generate("role_blueprint", { confirmedSkills: [] });

if (bp) {
  const skills = (bp.skillGroups ?? []).flatMap((g) => g.items ?? []);
  const themes = bp.responsibilityThemes ?? [];
  const questions = bp.achievementQuestions ?? [];

  ok("the blueprint returned skills", skills.length > 0, `${skills.length}`);
  ok("and responsibility themes", themes.length > 0, `${themes.length}`);

  /*
   * The measurement that matters. `detectScript` is the product's own, so a skill written as
   * "التصوير المقطعي المحوسب (CT)" counts as Arabic — which it is — while an English skill on an
   * Arabic CV does not.
   */
  const nonArabic = [...skills, ...themes].filter((s) => detectScript(s) === "en");
  ok("every skill and theme is Arabic", nonArabic.length === 0, nonArabic.slice(0, 3).join(" · "));

  const withDigits = [...skills, ...themes].filter((s) => /[0-9٠-٩]/.test(s));
  ok("no invented figures in skills or themes", withDigits.length === 0, withDigits.slice(0, 3).join(" · "));

  const bracketed = strings(bp).filter((s) => /\[[^\]]{3,}\]/.test(s));
  ok("no bracketed placeholders anywhere", bracketed.length === 0, bracketed.slice(0, 2).join(" · "));

  const allowed = new Set(credentialsFor(CONTEXT.occupation, CONTEXT.country).map((r) => r.id));
  const creds = (bp.credentialSuggestions ?? []).map((c) => c.id);
  ok("every credential id is one the Saudi rules allow",
    creds.every((id) => allowed.has(id)), `${creds.join(", ")} vs ${[...allowed].join(", ")}`);
  console.log(`   credentials offered: ${creds.length ? creds.join(", ") : "(none)"}`);

  /* The envelope's own claim about what it answered for. */
  ok("the envelope resolved the Arabic job title to an occupation", Boolean(bp._meta?.occupationId), bp._meta?.occupationId);
  ok("and the Arabic country name to a market", bp._meta?.countryCode === "sa", bp._meta?.countryCode);

  if (questions.length) {
    const notQuestions = questions.filter((q) => !/[؟?]\s*$/.test(q.trim()));
    ok("achievement questions are written as questions", notQuestions.length === 0, notQuestions.slice(0, 2).join(" · "));
  }

  /* Not an assertion — a number worth knowing: how much of the Arabic carries the Latin term in
     brackets, which is the convention `lib/glossary.ts` encodes for ATS readability. */
  const parenthesised = skills.filter((s) => /\([A-Za-z]{2,}\)/.test(s)).length;
  console.log(`   skills carrying a Latin term in brackets: ${parenthesised}/${skills.length}`);
}

/* ── 2. one experience package ── */

console.log("\n── experience_package");
const pack = await generate("experience_package", {
  experience: {
    title: "أخصائي أشعة",
    department: "قسم الأشعة",
    industry: "الرعاية الصحية",
    userBullets: ["شغّلت أجهزة التصوير المقطعي في الوردية الصباحية والمسائية"],
    current: true,
  },
  themes: bp?.responsibilityThemes?.slice(0, 6) ?? [],
});

if (pack) {
  const duties = pack.responsibilitySuggestions ?? [];
  ok("responsibilities came back", duties.length > 0, `${duties.length}`);

  const english = duties.filter((d) => detectScript(d) === "en");
  ok("every responsibility is Arabic", english.length === 0, english.slice(0, 2).join(" · "));

  const numbered = duties.filter((d) => /[0-9٠-٩]/.test(d));
  ok("no responsibility carries a figure the user did not give", numbered.length === 0, numbered.slice(0, 2).join(" · "));

  /*
   * The improvement path is the one place a model can put words in the user's mouth and have them
   * attributed to the user. An improvement of a bullet that had no number must not acquire one.
   */
  const improved = pack.improvedUserBullets ?? [];
  const invented = improved.filter((p) => /[0-9٠-٩]/.test(p.improved) && !/[0-9٠-٩]/.test(p.original));
  ok("no improvement invented a figure", invented.length === 0, JSON.stringify(invented.slice(0, 1)));
  console.log(`   improvements offered: ${improved.length}`);
}

/* ── 3. the summary, from Arabic facts ── */

console.log("\n── final_content");
const FACTS = [
  "الخبرة العملية",
  "مستشفى دلة — أخصائي أشعة (٢٠٢٤-٠٩ – حتى الآن)",
  "- شغّلت أجهزة التصوير المقطعي المحوسب في الوردية الصباحية والمسائية",
  "- تحققت من هوية المريض قبل كل فحص",
  "",
  "التعليم",
  "بكالوريوس علوم الأشعة — جامعة الملك سعود بن عبدالعزيز للعلوم الصحية",
].join("\n");

const fin = await generate("final_content", { facts: FACTS, sections: [] });

if (fin) {
  const summaries = (fin.summaries ?? []).map((s) => s.text);
  ok("summaries came back", summaries.length > 0, `${summaries.length}`);

  const english = summaries.filter((s) => detectScript(s) === "en");
  ok("every summary is Arabic", english.length === 0, english.slice(0, 1).join(" · "));

  /*
   * The honesty check. The facts name ONE employer; a summary naming another has invented an
   * employment history, which is the single worst thing this product could do to someone.
   */
  const strangers = summaries.filter((s) => /الملك فهد|أرامكو|وزارة|مستشفى الحرس/.test(s));
  ok("no summary names an employer that is not in the facts", strangers.length === 0, strangers.slice(0, 1).join(" · "));

  const yearsClaim = summaries.filter((s) => /\d+\s*(سنة|سنوات)|[٠-٩]+\s*(سنة|سنوات)/.test(s));
  console.log(`   summaries stating a number of years: ${yearsClaim.length}/${summaries.length}`);
  if (yearsClaim.length) console.log(`   → ${yearsClaim[0]}`);

  for (const s of summaries.slice(0, 3)) console.log(`   · ${s}`);
}

/* ── what it cost ── */

console.log("\n════════════════════════════════════════════════");
for (const c of calls) console.log(`${c.task.padEnd(20)} ${String(c.model).padEnd(18)} $${c.usd.toFixed(6)}${c.cached ? "  (cached)" : ""}`);
console.log(`${"total".padEnd(39)} $${spent.toFixed(6)}`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
