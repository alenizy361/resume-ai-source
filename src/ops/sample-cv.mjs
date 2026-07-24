/**
 * Build one resume end to end against the LIVE product and print it.
 *
 * "Show me what it produces" cannot be answered from the prompt or the schema —
 * only by running the thing. This drives /api/interview turn by turn exactly as
 * the browser client does (mergePatch and assembleResume are mirrored from
 * Journey.tsx, including the woven-line splice), then hands the assembled text
 * to /api/optimize and prints the finished CV.
 *
 * The scenario is a radiology technologist because that is the profession the
 * product owner's own CV is in — a generic sample would not answer the question
 * that was actually asked, which is how the output compares to that CV.
 *
 *   BASE=https://cv.rabit.sa node --experimental-strip-types ops/sample-cv.mjs
 */

const BASE = process.env.BASE || "https://cv.rabit.sa";
const LANG = process.env.LANG_UI || "ar";
const OUT = process.env.OUT_LANG || "en";

/** What a real person types: short, unpunctuated, missing half of what matters. */
const TURNS = [
  "انا اخصائي اشعة",
  "اشتغل في مستشفى دلة من سبتمبر ٢٠٢٤ الى الحين",
  "عبدالعزيز العنزي، جوالي ٠٥٨١٤٥٣٢٣٤ والايميل alanziabdulaziz4@gmail.com، الرياض",
  "بكالوريوس علوم اشعة من جامعة الملك سعود بن عبدالعزيز للعلوم الصحية تخرجت ٢٠٢٢",
  "عندي تصنيف هيئة التخصصات الصحية اخصائي، و BLS",
  "اشتغلت كمان في مستشفى الحرس الوطني متدرب من يونيو ٢٠٢٢ الى يوليو ٢٠٢٣",
  "اجيد العربية والانجليزية",
  "خلاص كفايه",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, timeoutMs = 120_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Mirrors Journey.tsx mergePatch — same caps, same woven-line splice. */
function mergePatch(p, patch) {
  const n = { ...p, extras: [...p.extras], wovenLines: [...p.wovenLines] };
  const str = (v, max) => (typeof v === "string" && v ? v.slice(0, max) : null);

  const name = str(patch.name, 100); if (name) n.name = name;
  const contact = str(patch.contact, 200); if (contact) n.contact = contact;
  const role = str(patch.role, 120); if (role) n.role = role;
  const summary = str(patch.summary, 700); if (summary) n.summary = summary;

  if (patch.education && typeof patch.education === "object") {
    const e = patch.education;
    const line = [e.degree, e.university, e.graduation_year].filter(Boolean).join(" · ");
    if (line && !n.education.includes(line)) n.education = n.education ? `${n.education}\n${line}` : line;
  } else {
    const edu = str(patch.education, 300);
    if (edu && !n.education.includes(edu)) n.education = n.education ? `${n.education}\n${edu}` : edu;
  }
  // Certifications land inside education — the product has no separate section.
  const cert = str(patch.certifications, 300);
  if (cert && !n.education.includes(cert)) n.education = n.education ? `${n.education}\n${cert}` : cert;

  if (typeof patch.skills === "string" && patch.skills) n.skills = patch.skills.slice(0, 400);
  if (Array.isArray(patch.skills)) n.skills = patch.skills.map(String).filter(Boolean).slice(0, 12).join("، ");
  if (Array.isArray(patch.extras)) n.extras.push(...patch.extras.map(String).slice(0, 6));

  if (Array.isArray(patch.experiences)) {
    for (const ex of patch.experiences) {
      let head = "";
      if (typeof ex?.header === "string") head = ex.header;
      else if (ex?.header && typeof ex.header === "object") {
        const h = ex.header;
        const from = String(h.start_date || "").trim();
        const to = String(h.end_date || "").trim();
        const period = from && to ? `${from} – ${to}` : from || to;
        head = [h.title, h.company].filter(Boolean).join(" — ") + (period ? ` | ${period}` : "");
      }
      const bullets = Array.isArray(ex?.bullets)
        ? ex.bullets.map((b) => `- ${String(b).replace(/^[-•]\s*/, "")}`) : [];
      if (!head) { n.wovenLines.push(...bullets); continue; }
      const at = n.wovenLines.indexOf(head);
      if (at === -1) n.wovenLines.push(head, ...bullets);
      else {
        let end = at + 1;
        while (end < n.wovenLines.length && /^[-•]/.test(n.wovenLines[end].trim())) end++;
        n.wovenLines.splice(at, end - at, head, ...bullets);
      }
    }
  }
  return n;
}

/** Mirrors Journey.tsx assembleResume — the canonical ATS order it ships with. */
function assembleResume(p, rtl) {
  const parts = [];
  if (p.name) parts.push(p.name);
  if (p.contact) parts.push(p.contact);
  if (p.role) parts.push(p.role);
  if (p.summary) parts.push(`\n${rtl ? "الملخص المهني" : "PROFESSIONAL SUMMARY"}\n${p.summary}`);
  if (p.wovenLines.length) parts.push(`\n${rtl ? "الخبرة العملية" : "WORK EXPERIENCE"}\n${p.wovenLines.join("\n")}`);
  if (p.skills) parts.push(`\n${rtl ? "المهارات" : "SKILLS"}\n${p.skills}`);
  if (p.education) parts.push(`\n${rtl ? "التعليم والشهادات" : "EDUCATION & CERTIFICATIONS"}\n${p.education}`);
  if (p.extras.length) parts.push(`\n${rtl ? "إضافات" : "ADDITIONAL"}\n${p.extras.map((x) => `- ${x}`).join("\n")}`);
  return parts.join("\n");
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

let profile = {
  role: "", name: "", contact: "", summary: "",
  education: "", skills: "", extras: [], wovenLines: [], jobAd: "",
};
let history = [];

console.log(`Driving ${BASE}/api/interview — ${TURNS.length} turns, output language: ${OUT}\n`);

for (const [i, answer] of TURNS.entries()) {
  // The product's own burst limit is 6 per 20s; pace under it.
  if (i > 0) await sleep(4000);

  const res = await post("/api/interview", { action: "turn", lang: LANG, answer, profile, history });
  if (!res.ok) { console.log(`turn ${i + 1}: HTTP ${res.status}`); continue; }
  const j = await res.json();

  const say = String(j.say || "");
  console.log(`── turn ${i + 1}  [${j.action}]  progress ${j.progress ?? 0}`);
  console.log(`   user: ${answer}`);
  console.log(`   sira: ${say}`);
  if (Array.isArray(j.resume_lines) && j.resume_lines.length) {
    console.log(`   +${j.resume_lines.length} resume lines`);
  }

  profile = mergePatch(profile, j.profile_patch || {});
  if (Array.isArray(j.resume_lines)) profile.wovenLines.push(...j.resume_lines.map(String));
  history = [...history, { who: "user", text: answer }, { who: "ai", text: say }].slice(-12);
}

const assembled = assembleResume(profile, LANG === "ar" && OUT === "ar");

console.log("\n════════════════════════════════════════════════════════");
console.log("WHAT THE INTERVIEW COLLECTED — the input to the rewrite");
console.log("════════════════════════════════════════════════════════");
console.log(assembled || "(nothing)");

console.log("\n════════════════════════════════════════════════════════");
console.log("THE FINISHED CV — what the user downloads");
console.log("════════════════════════════════════════════════════════");

if (assembled.trim().length < 25) {
  console.log("(the interview collected too little to send to the optimizer)");
  process.exit(0);
}
const optRes = await post("/api/optimize", {
  resume: assembled.slice(0, 8000), jobDescription: "", uiLang: LANG, outLang: OUT,
}, 300_000);
if (!optRes.ok) {
  console.log(`optimize failed: HTTP ${optRes.status}`);
  process.exit(1);
}
const result = await readResult(optRes);
console.log(result?.optimizedResume || "(empty)");
console.log("\n──── the product's own score of it ────");
console.log(`score before: ${result?.score ?? "?"}   after: ${result?.afterScore ?? "?"}`);
console.log(`summary: ${result?.matchSummary ?? ""}`);
