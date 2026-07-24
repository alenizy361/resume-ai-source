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

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
