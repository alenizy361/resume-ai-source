/**
 * Build one resume end to end against the LIVE product and print it.
 *
 * "Show me what it produces" cannot be answered from a prompt or a schema — only by running the
 * thing. So this drives the product's real endpoints in the real order and prints what comes back.
 *
 * ── why this was rewritten ──
 *
 * It used to drive `/api/interview` turn by turn, because the chat WAS the product. The chat has
 * been retired: every door into it is gone, both addresses redirect to the builder, and the route
 * itself is deleted. A harness pointed at a deleted endpoint proves nothing — worse, it would have
 * gone on passing for a while by failing quietly on HTTP 404 and printing an empty CV.
 *
 * What the builder actually spends money on is three calls, and they are what this drives now:
 *
 *   role_blueprint       once per occupation + market, cached and shared by every stage
 *   experience_package   once per job the user enters
 *   final_content        once, at the end, for the summary
 *
 * Then `/api/optimize`, on the free provider, for the score — exactly what the review step does.
 *
 * The assembly between the calls is the CLIENT's own code, imported rather than copied: a resume
 * printed here is assembled by `upsertRole`, `rolesToLines` and `assembleResume`, the same three
 * functions the browser uses, so what you read is what a user could actually download.
 *
 * The scenario is a radiology technologist because that is the profession the product owner's own
 * CV is in — a generic sample would not answer the question that was actually asked.
 *
 * Roughly four model calls (three Anthropic, one free-provider score). It spends real budget.
 *
 *   BASE=https://cv.rabit.sa node --experimental-strip-types ops/sample-cv.mjs
 */

import { EMPTY_PROFILE, assembleResume } from "../app/lib/mergeProfile.ts";
import { upsertRole, rolesToLines } from "../app/lib/resumeDoc.ts";

const BASE = process.env.BASE || "https://cv.rabit.sa";
const OUT = process.env.OUT_LANG === "ar" ? "ar" : "en";

/* The five facts the whole product is steered by — the same five `careerContext` carries. */
const CONTEXT = {
  occupation: "Radiology Technologist",
  specialization: "CT and MRI",
  seniority: "mid",
  country: "Saudi Arabia",
  cvLang: OUT,
};

/** What a real person types into the form: their own words, no numbers invented for them. */
const PERSON = {
  name: "عبدالعزيز العنزي",
  contact: "alanziabdulaziz4@gmail.com · +966 58 145 3234 · الرياض",
  education: "بكالوريوس علوم الأشعة — جامعة الملك سعود بن عبدالعزيز للعلوم الصحية، ٢٠٢٢",
  certifications: "تصنيف الهيئة السعودية للتخصصات الصحية — أخصائي · BLS",
  languages: "العربية (اللغة الأم) · English (professional)",
};

const ROLES = [
  {
    id: "r1", title: "Radiology Technologist", company: "Dallah Hospital", location: "الرياض",
    start: "2024-09", end: "", current: true, department: "Radiology",
    userBullets: ["Operated CT and MRI scanners on the day and night rota"],
  },
  {
    id: "r2", title: "Radiology Trainee", company: "National Guard Hospital", location: "الرياض",
    start: "2022-06", end: "2023-07", current: false, department: "Radiology",
    userBullets: [],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, timeoutMs = 120_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

/** One `/api/generate` task, reported honestly when it refuses. */
async function generate(task, extra = {}) {
  const res = await post("/api/generate", { task, context: CONTEXT, ...extra });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.log(`   ✗ ${task}: HTTP ${res.status} — ${body.error || "no message"}`);
    return null;
  }
  return res.json();
}

/** The optimize route streams NDJSON; the result rides on the last {t:"result"}. */
async function readResult(res) {
  const text = await res.text();
  let out = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o.t === "result") out = o.d;
      if (o.t === "error") console.error("optimize error:", o.d);
    } catch { /* partial line */ }
  }
  return out;
}

console.log(`Driving ${BASE} through the builder's own calls — output language: ${OUT}\n`);

/* ── 1. the blueprint: one call, read by skills, credentials, languages and the review ── */

console.log("── role_blueprint");
const bp = await generate("role_blueprint", { confirmedSkills: [] });
/* The route answers with the shaped object itself plus a `_meta` block — no envelope. */
const skills = (bp?.skillGroups ?? []).flatMap((g) => g.items ?? []).slice(0, 12);
const themes = bp?.responsibilityThemes ?? [];
console.log(`   ${skills.length} skills, ${themes.length} responsibility themes`);
if (bp) {
  console.log(`   normalized occupation: ${bp.normalizedOccupation || "(none)"}`);
  /* What the call cost, from the route's own accounting rather than an estimate. */
  const m = bp._meta ?? {};
  console.log(`   ${m.model ?? "?"} · ${m.inputTokens ?? "?"}→${m.outputTokens ?? "?"} tokens · $${m.estimatedUsd ?? "?"}${m.cachedPrefix ? " · prefix cached" : ""}`);
}

/* ── 2. one package per job, which is where the per-experience cost lives ── */

let profile = {
  ...EMPTY_PROFILE,
  name: PERSON.name,
  contact: PERSON.contact,
  role: CONTEXT.occupation,
  education: PERSON.education,
  certifications: PERSON.certifications,
  languages: PERSON.languages,
  skills: skills.join("، "),
  roles: [],
};

for (const r of ROLES) {
  await sleep(2000); // under the route's own burst limit
  console.log(`── experience_package: ${r.title} @ ${r.company}`);
  const pack = await generate("experience_package", {
    experience: {
      title: r.title, department: r.department, industry: "Healthcare",
      tools: [], userBullets: r.userBullets, current: r.current,
    },
    themes: themes.slice(0, 6),
  });
  const duties = pack?.responsibilitySuggestions ?? [];
  console.log(`   ${duties.length} responsibilities offered`);

  /*
   * A user confirms; this harness confirms everything, which is the WORST case for honesty and
   * therefore the right thing to print. `upsertRole` caps the bullets exactly as the builder does,
   * so what appears below is inside the product's own budget and not a wish list.
   */
  profile.roles = upsertRole(profile.roles, {
    id: r.id, title: r.title, company: r.company, location: r.location,
    start: r.start, end: r.end, bullets: [...r.userBullets, ...duties],
  });
}
profile.wovenLines = rolesToLines(profile.roles);

/* ── 3. the summary, from the CONFIRMED text and nothing else ── */

await sleep(2000);
console.log("── final_content");
const facts = assembleResume({ ...profile, name: "", contact: "" }, OUT === "ar");
const fin = await generate("final_content", { facts: facts.slice(0, 6000), sections: [] });
const summaries = fin?.summaries ?? [];
console.log(`   ${summaries.length} summaries offered`);
if (summaries[0]?.text) profile.summary = summaries[0].text;

const assembled = assembleResume(profile, OUT === "ar");

console.log("\n════════════════════════════════════════════════════════");
console.log("WHAT THE BUILDER COLLECTED — everything confirmed, nothing else");
console.log("════════════════════════════════════════════════════════");
console.log(assembled || "(nothing)");

console.log("\n════════════════════════════════════════════════════════");
console.log("THE PRODUCT'S OWN SCORE OF IT");
console.log("════════════════════════════════════════════════════════");

if (assembled.trim().length < 25) {
  console.log("(too little was collected to send to the review)");
  process.exit(0);
}
const optRes = await post("/api/optimize", {
  resume: assembled.slice(0, 8000), jobDescription: "", uiLang: OUT, outLang: OUT,
}, 300_000);
if (!optRes.ok) {
  console.log(`optimize failed: HTTP ${optRes.status}`);
  process.exit(1);
}
const result = await readResult(optRes);
console.log(result?.optimizedResume || "(empty)");
console.log("\n──── score ────");
console.log(`before: ${result?.score ?? "?"}   after: ${result?.afterScore ?? "?"}`);
console.log(`summary: ${result?.matchSummary ?? ""}`);
