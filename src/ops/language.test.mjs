/**
 * The wrong-language rewrite, pinned.
 *
 * A live build returned a fully Arabic CV to a request for an English one. The
 * strings below are lifted from that run and from the run before it that got it
 * right, so the check is measured against what the product actually produced
 * rather than against invented samples.
 *
 *   node --experimental-strip-types src/ops/language.test.mjs
 */

import { languageHonoured, arabicRatio } from "../app/lib/resumeLang.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`); }
};

// The run that was correct.
const ENGLISH = `Abdulaziz Alenzi
Diagnostic Radiography Specialist
PROFESSIONAL SUMMARY
Results-driven Diagnostic Radiography Specialist with 2 years of experience operating
advanced diagnostic imaging equipment including MRI, CT, and X-ray.
EXPERIENCE
Diagnostic Radiography Specialist — Dalla Hospital | September 2024
- Conducted diagnostic imaging procedures using advanced equipment such as MRI and CT`;

// The run that was wrong: asked for English, answered in Arabic.
const ARABIC = `عبدالعزيز العنزي
الملخص المهني
أخصائي أشعة تشخيصية مع خبرة في استخدام أجهزة الأشعة التشخيصية المتقدمة ومعايير السلامة.
الخبرة العملية
أخصائي أشعة — مستشفى دلة | سبتمبر 2024
- أجرى فحوصات الأشعة التشخيصية باستخدام أجهزة متقدمة مثل الرنين المغناطيسي`;

ok("English rewrite passes an English request", languageHonoured(ENGLISH, "en"));
ok("Arabic rewrite FAILS an English request", !languageHonoured(ARABIC, "en"));
ok("Arabic rewrite passes an Arabic request", languageHonoured(ARABIC, "ar"));
ok("English rewrite FAILS an Arabic request", !languageHonoured(ENGLISH, "ar"));
ok("undefined outLang is treated as English", !languageHonoured(ARABIC, undefined));
ok("bilingual passes 'both'", languageHonoured(`${ENGLISH}\n=== النسخة العربية ===\n${ARABIC}`, "both"));
ok("English alone FAILS 'both'", !languageHonoured(ENGLISH, "both"));

// English CVs legitimately carry Arabic proper nouns; that must not trip it.
ok("Arabic proper nouns inside an English CV are fine",
  languageHonoured(`${ENGLISH}\n- Worked at مستشفى دلة and مستشفى الحرس الوطني`, "en"));

ok("too short to judge is not a failure", languageHonoured("Abdulaziz", "en"));
ok("empty is not a failure", languageHonoured("", "en"));
ok("ratio of pure Arabic is high", arabicRatio("أخصائي أشعة") > 0.9);
ok("ratio of pure English is zero", arabicRatio("Radiography Specialist") === 0);

/* ── the cover letter, a PAID feature that had no language input at all ────────────── */
console.log("\n── /api/cover-letter writes in the CV's language, not the model's guess ──");
{
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("app/api/cover-letter/route.ts", "utf8");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  /*
   * This route took `resume` and `jobDescription` and nothing else. It never named an output
   * language, and no caller sent one — so the letter's language was whatever the model inferred from
   * an input that is frequently mixed: an Arabic CV against an English advert is the ordinary case in
   * this market. An Arabic-CV user could be handed an English cover letter. It is a paid feature, and
   * nothing detected it because there was no expectation to compare against.
   */
  ok("the prompt takes an output language", /PROMPT = \(resume: string, jobDescription: string, outLang/.test(code));
  ok("and states it in the prompt", /OUTPUT LANGUAGE/.test(route));
  ok("the route reads it from the request", /body\.outLang === "ar"/.test(code));

  /* An instruction a model is free to misread is one it eventually misreads — the lesson
     `/api/optimize` learned from a live build that returned a fully Arabic CV to an English request.
     Same detector, same retry text, so the two routes cannot drift on what a failure sounds like. */
  ok("the output is checked, not assumed", /languageHonoured\(coverLetter, outLang\)/.test(code));
  ok("and retried once with the shared instruction", /LANGUAGE_RETRY\(outLang\)/.test(code));

  /* The old rule told the model to "mirror the job's language", which on a mixed input is an
     instruction to do the wrong thing. */
  ok("it no longer asks the model to mirror the job's LANGUAGE",
    !/Mirror the job's language/.test(route));

  /* All three callers must send it, or the default silently becomes the policy again. */
  for (const f of ["app/components/build/DesignSection.tsx",
                   "app/(en)/optimize/page.tsx", "app/(ar)/ar/optimize/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    const call = src.slice(src.indexOf('/api/cover-letter'), src.indexOf('/api/cover-letter') + 500);
    ok(`${f.split("/").pop()} sends outLang`, /outLang/.test(call), call.slice(0, 80));
  }

  /* And the builder's caller takes it from the CV, never from the interface — a user reading the
     Arabic UI while building an English CV must get an English letter. */
  const design = readFileSync("app/components/build/DesignSection.tsx", "utf8");
  ok("the builder derives it from the CV's language", /outLang: arabicCv \? "ar" : "en"/.test(design));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
