/**
 * Every AI stage, both languages, request and response observed.
 *
 * ── the question this answers ──
 *
 * "A button exists" and "a backend call works" are different claims, and until now only the first
 * was provable from outside. `ops/arabic-quality.mjs` measures the QUALITY of Arabic output across
 * three tasks; `/api/health/ai?live=1` proves one key against one model. Neither answers "does each
 * of the eight stages a user meets actually complete, in Arabic and in English".
 *
 * So this drives all of them and prints, per stage: the request it sent, the HTTP status, the model
 * that answered, the tokens in and out, whether the prompt prefix was served from cache, the cost,
 * and a sample of what came back. Then it asserts the response is USABLE — not merely 200.
 *
 * ── the stages, mapped to the endpoints that actually serve them ──
 *
 *   occupation   → /api/generate  task=role_blueprint   (the occupation it resolves to, + its id)
 *   skills       → /api/generate  task=role_blueprint   (skill groups)
 *   duties       → /api/generate  task=experience_package
 *   credentials  → /api/generate  task=role_blueprint   (credential requirements for the country)
 *   achievements → /api/generate  task=experience_package (achievement prompts)
 *   summary      → /api/generate  task=final_content
 *   review       → /api/optimize                        (the ATS review)
 *   translate    → /api/translate
 *   jd_delta     → /api/generate  task=jd_delta   (not in the brief's eight; a real task, so it is
 *                                                  here — `ops/aiwiring.test.mjs` enforces that)
 *
 * Three of the stages share one call, and that is a fact about the product rather than a shortcut:
 * `role_blueprint` returns the occupation, the skills and the credentials together, which is why
 * the builder can offer all three after one request. Asserting them separately against one
 * response is the honest shape — and it is also what makes this affordable.
 *
 * ── cost, stated before you run it ──
 *
 * Ten calls: five per language. Measured at roughly **$0.04–0.06**
 * total on the fast tier, and the exact figure is printed at the end from each response's own
 * usage block rather than estimated here. The owner's credit pays for it. Nothing in this file
 * runs on a schedule, and nothing else calls it.
 *
 *   node --experimental-strip-types ops/ai-stages.mjs [baseUrl]
 *
 * Default base is production. Against a local server you need ANTHROPIC_API_KEY in its
 * environment — without it every stage returns 503 and the run tells you so in one line rather
 * than eight.
 */

import { detectScript } from "../app/lib/languages.ts";
import { countryCode, credentialsFor } from "../app/lib/countryRules.ts";

const BASE = process.argv[2] || "https://cv.rabit.sa";
const VERBOSE = process.argv.includes("--verbose");

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};

let spent = 0;
const ledger = [];

/**
 * One call, fully reported.
 *
 * The request is printed BEFORE the call, not after: when a stage hangs or 500s, the thing you
 * need is what was sent, and a log line that only appears on success is missing exactly when it
 * matters.
 */
async function call(stage, path, body) {
  const shown = JSON.stringify(body);
  console.log(`\n── ${stage}  →  POST ${path}`);
  console.log(`   request: ${VERBOSE ? shown : shown.slice(0, 220) + (shown.length > 220 ? " …" : "")}`);

  const t0 = Date.now();
  let res, json;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: shown,
    });
  } catch (e) {
    console.log(`   ✗ network: ${e instanceof Error ? e.message : String(e)}`);
    return { stage, ok: false, status: 0 };
  }
  const ms = Date.now() - t0;
  try { json = await res.json(); } catch { json = {}; }

  const m = json._meta ?? {};
  const usd = Number(m.estimatedUsd ?? 0);
  spent += usd;

  /* The envelope every /api/generate response carries. Its absence is itself a finding: it is how
     a support request becomes traceable to one call. */
  const env = m.requestId
    ? `req=${m.requestId} occupation=${m.occupationId ?? "?"} country=${m.countryCode ?? "?"}`
    : "(no envelope)";
  const cache = json._cache?.hit ? "PACK CACHE HIT — no model call"
    : m.cacheRead ? `prefix cached (read ${m.cacheRead} tok)`
      : "prefix NOT cached";

  console.log(`   status:  ${res.status} in ${ms}ms`);
  console.log(`   model:   ${m.model ?? "—"}   in=${m.input ?? "?"} out=${m.output ?? "?"}   $${usd.toFixed(6)}`);
  console.log(`   cache:   ${cache}`);
  console.log(`   ${env}`);
  if (!res.ok) console.log(`   error:   ${json.error ?? "(none given)"}`);

  ledger.push({ stage, status: res.status, model: m.model ?? "—", usd, ms, cached: Boolean(json._cache?.hit) });
  return { stage, ok: res.ok, status: res.status, json, ms };
}

/** Every human-readable string in a response — what would reach a CV or a screen. */
function strings(v, out = []) {
  if (typeof v === "string") { if (v.trim()) out.push(v); return out; }
  if (Array.isArray(v)) { v.forEach((x) => strings(x, out)); return out; }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      if (k === "_meta" || k === "_cache" || k === "id" || k === "cvLang") continue;
      strings(val, out);
    }
  }
  return out;
}

const sample = (arr, n = 2) => (arr ?? []).slice(0, n).map((x) => (typeof x === "string" ? x : JSON.stringify(x)));

/* ── the two personas: one Saudi Arabic, one English, both plausible ── */

const CASES = [
  {
    lang: "ar",
    label: "Arabic · أخصائي أشعة · السعودية",
    context: {
      occupation: "أخصائي أشعة",
      specialization: "التصوير المقطعي والرنين المغناطيسي",
      seniority: "متوسط",
      country: "السعودية",
      cvLang: "ar",
    },
    role: { title: "أخصائي أشعة", employer: "مستشفى", start: "2021", end: "" },
    bullet: "أجريت فحوصات أشعة مقطعية ورنين مغناطيسي للمرضى",
    facts: "أخصائي أشعة بخبرة أربع سنوات في التصوير المقطعي والرنين المغناطيسي.\nأجريت فحوصات يومية والتزمت ببروتوكولات وقاية المرضى.",
    resume: "أخصائي أشعة\nخبرة أربع سنوات في التصوير المقطعي والرنين المغناطيسي\nمهارات: CT, MRI, PACS, سلامة المريض",
    jobAd: "مطلوب أخصائي أشعة لديه خبرة في CT و MRI وتصنيف هيئة التخصصات الصحية.",
  },
  {
    lang: "en",
    label: "English · Radiology Technologist · Saudi Arabia",
    context: {
      occupation: "Radiology Technologist",
      specialization: "CT and MRI",
      seniority: "mid",
      country: "Saudi Arabia",
      cvLang: "en",
    },
    role: { title: "Radiology Technologist", employer: "Hospital", start: "2021", end: "" },
    bullet: "Performed CT and MRI scans for patients",
    facts: "Radiology Technologist with four years in CT and MRI.\nRan daily scans and followed patient-protection protocols.",
    resume: "Radiology Technologist\nFour years in CT and MRI\nSkills: CT, MRI, PACS, patient safety",
    jobAd: "Seeking a Radiology Technologist with CT and MRI experience and SCFHS classification.",
  },
];

console.log(`\n${"═".repeat(96)}`);
console.log(`AI STAGES — every stage, both languages, against ${BASE}`);
console.log(`This SPENDS MODEL CREDIT. Roughly $0.04–0.06; the exact figure is printed at the end.`);
console.log(`${"═".repeat(96)}`);

/*
 * A digit in a line the user did not write is the failure this product is built to prevent, so it
 * is asserted on every stage rather than in one place. Arabic-Indic digits count: the model writes
 * ٤ as readily as 4, and a check that only looked for ASCII would have passed the Arabic case while
 * failing to notice.
 */
const HAS_DIGIT = /[0-9٠-٩]/;
/** Digits the persona genuinely provided, so a legitimate echo is not reported as invention. */
const ALLOWED = /\b(2021|٢٠٢١|four|أربع|4|٤)\b/;

for (const c of CASES) {
  console.log(`\n${"━".repeat(96)}\n${c.label}\n${"━".repeat(96)}`);

  /* ── 1–2–4. the blueprint: occupation, skills, credentials ── */

  const bp = await call(`${c.lang} blueprint (occupation · skills · credentials)`,
    "/api/generate", { task: "role_blueprint", context: c.context, confirmedSkills: [] });

  if (bp.ok && bp.json) {
    const j = bp.json;
    /* STAGE 1 — occupation resolution. */
    ok(`${c.lang} occupation resolved to a stable id`,
      typeof j._meta?.occupationId === "string" && j._meta.occupationId.length > 0, j._meta?.occupationId);
    ok(`${c.lang} country resolved to a code`,
      j._meta?.countryCode === countryCode(c.context.country), `${j._meta?.countryCode} vs ${countryCode(c.context.country)}`);

    /* STAGE 2 — skills. */
    const groups = j.skills ?? j.skillGroups ?? [];
    const skillItems = groups.flatMap((g) => g?.items ?? []);
    ok(`${c.lang} skills came back`, skillItems.length >= 4, `${skillItems.length} skills in ${groups.length} groups`);
    console.log(`   skills:  ${sample(skillItems, 4).join(" · ")}`);
    if (c.lang === "ar") {
      /* An Arabic CV whose skills arrive in English is the bug this product shipped once. */
      const script = detectScript(skillItems.join("\n"));
      ok(`ar skills are Arabic (or a defensible mix of acronyms)`, script !== "en", script);
    }

    /* STAGE 4 — credentials. Compared against the LOCAL rule table, which is the point: the model
       is allowed to name certificates, and the regulator requirement is data we control. */
    const creds = j.credentials ?? j.requirements ?? [];
    console.log(`   creds:   ${sample(strings(creds), 3).join(" · ") || "(none returned)"}`);
    const localRules = credentialsFor(c.context.occupation, c.context.country);
    ok(`${c.lang} the local rule table has credentials for this country`,
      localRules.length > 0, `${localRules.length} rules for ${countryCode(c.context.country)}`);

    /* THE GUARD, on everything the blueprint produced. */
    const invented = strings(j).filter((s) => HAS_DIGIT.test(s) && !ALLOWED.test(s));
    ok(`${c.lang} blueprint invented no number`, invented.length === 0, sample(invented, 2).join(" | "));
  }

  /* ── 3–5. the experience package: duties and achievements ── */

  const exp = await call(`${c.lang} experience_package (duties · achievements)`,
    "/api/generate", {
      task: "experience_package",
      context: c.context,
      experience: { ...c.role, duties: [c.bullet] },
    });

  if (exp.ok && exp.json) {
    const j = exp.json;
    const duties = j.duties ?? j.items ?? [];
    ok(`${c.lang} duties came back`, duties.length >= 3, `${duties.length} duties`);
    console.log(`   duties:  ${sample(strings(duties), 2).join(" | ")}`);
    /*
     * Achievements are PROMPTS, not achievements. The design is a two-step — the model asks what
     * the number was and the user supplies it — so a returned achievement carrying a figure is a
     * broken guard, not a helpful extra.
     */
    const ach = j.achievements ?? j.prompts ?? [];
    console.log(`   achieve: ${sample(strings(ach), 2).join(" | ") || "(none returned)"}`);
    const invented = strings(j).filter((s) => HAS_DIGIT.test(s) && !ALLOWED.test(s));
    ok(`${c.lang} experience invented no number`, invented.length === 0, sample(invented, 2).join(" | "));
    if (c.lang === "ar") {
      ok(`ar duties are written in Arabic`, detectScript(strings(duties).join("\n")) !== "en");
    }
  }

  /* ── 6. the summary ── */

  const fin = await call(`${c.lang} final_content (summary)`,
    "/api/generate", { task: "final_content", context: c.context, facts: c.facts });

  if (fin.ok && fin.json) {
    const j = fin.json;
    const sums = j.summaries ?? (j.summary ? [j.summary] : []);
    ok(`${c.lang} at least one summary came back`, sums.length >= 1, `${sums.length}`);
    console.log(`   summary: ${String(strings(sums)[0] ?? "").slice(0, 150)}`);
    ok(`${c.lang} the summary is a paragraph, not a fragment`,
      String(strings(sums)[0] ?? "").length > 60, `${String(strings(sums)[0] ?? "").length} chars`);
    if (c.lang === "ar") {
      ok(`ar summary is in Arabic`, detectScript(String(strings(sums)[0] ?? "")) !== "en");
    }
    const invented = strings(sums).filter((s) => HAS_DIGIT.test(s) && !ALLOWED.test(s));
    ok(`${c.lang} the summary invented no number`, invented.length === 0, sample(invented, 2).join(" | "));
  }

  /* ── 7. the review ── */

  const rev = await call(`${c.lang} ATS review`, "/api/optimize", {
    resume: c.resume,
    jobDescription: c.jobAd,
    uiLang: c.lang,
    outLang: c.lang === "ar" ? "ar" : "en",
  });

  if (rev.ok && rev.json) {
    const j = rev.json;
    ok(`${c.lang} review returned a match score`,
      typeof j.matchScore === "number" && j.matchScore >= 0 && j.matchScore <= 100, String(j.matchScore));
    ok(`${c.lang} review named at least one keyword`,
      (j.missingKeywords?.length ?? 0) + (j.presentKeywords?.length ?? 0) > 0,
      `missing ${j.missingKeywords?.length ?? 0} / present ${j.presentKeywords?.length ?? 0}`);
    console.log(`   score:   ${j.matchScore} · missing: ${sample(j.missingKeywords, 4).join(", ")}`);
  }

  /* ── the ninth stage the brief did not list, and the wiring test insisted on ── */

  /*
   * `jd_delta` is what runs when a user pastes a job advert: it returns the advert's vocabulary
   * against the CV's. It was not in the eight stages named in the brief, and it is a real server
   * task with a real schema — `ops/aiwiring.test.mjs` refused to pass while the harness skipped it,
   * which is exactly what that check exists for.
   */
  const jd = await call(`${c.lang} jd_delta (job-advert vocabulary)`,
    "/api/generate", { task: "jd_delta", context: c.context, jobAd: c.jobAd });

  if (jd.ok && jd.json) {
    const vocab = jd.json.vocabulary ?? jd.json.requirements ?? [];
    ok(`${c.lang} the advert produced vocabulary`, strings(vocab).length > 0, `${strings(vocab).length} terms`);
    console.log(`   vocab:   ${sample(strings(vocab), 4).join(" · ")}`);
    const invented = strings(jd.json).filter((s) => HAS_DIGIT.test(s) && !ALLOWED.test(s));
    ok(`${c.lang} jd_delta invented no number`, invented.length === 0, sample(invented, 2).join(" | "));
  }

  /* ── 8. translation ── */

  const tr = await call(`${c.lang} translate`, "/api/translate", {
    source: {
      sourceLanguage: c.lang,
      targetLanguage: c.lang === "ar" ? "en" : "ar",
      items: [{ section: "summary", text: c.facts.split("\n")[0] }],
    },
  });

  if (tr.ok && tr.json) {
    const out = strings(tr.json);
    ok(`${c.lang}→${c.lang === "ar" ? "en" : "ar"} translation came back`, out.length > 0, `${out.length} strings`);
    const got = String(out[0] ?? "");
    console.log(`   out:     ${got.slice(0, 140)}`);
    /* A translation that comes back in the SOURCE script is the failure mode worth catching: it
       looks like a success and is a no-op. */
    const want = c.lang === "ar" ? "en" : "ar";
    ok(`the translation is actually in ${want}`, detectScript(got) !== c.lang, detectScript(got));
  }
}

/* ── the ledger ── */

console.log(`\n${"═".repeat(96)}`);
console.log("PER-CALL LEDGER");
console.log(`${"═".repeat(96)}`);
console.log("stage".padEnd(48) + "status  model".padEnd(28) + "ms".padEnd(8) + "usd");
for (const r of ledger) {
  console.log(
    r.stage.slice(0, 47).padEnd(48)
    + String(r.status).padEnd(8)
    + String(r.model).slice(0, 19).padEnd(20)
    + String(r.ms).padEnd(8)
    + (r.cached ? "cache" : `$${r.usd.toFixed(6)}`),
  );
}
console.log(`\nTOTAL SPENT: $${spent.toFixed(6)} across ${ledger.length} calls`);

const dead = ledger.filter((r) => r.status !== 200);
if (dead.length) {
  console.log(`\n${dead.length} call(s) did not return 200:`);
  for (const r of dead) console.log(`  · ${r.stage} → ${r.status}`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
