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

  /* Both callers must send it, or the default silently becomes the policy again. `/optimize` and
     `/ar/optimize` share one caller since F-25 — `OptimizeTool.tsx` — instead of one each. */
  for (const f of ["app/components/build/DesignSection.tsx",
                   "app/components/tools/OptimizeTool.tsx"]) {
    const src = readFileSync(f, "utf8");
    const call = src.slice(src.indexOf('/api/cover-letter'), src.indexOf('/api/cover-letter') + 500);
    ok(`${f.split("/").pop()} sends outLang`, /outLang/.test(call), call.slice(0, 80));
  }

  /* And the builder's caller takes it from the CV, never from the interface — a user reading the
     Arabic UI while building an English CV must get an English letter. */
  const design = readFileSync("app/components/build/DesignSection.tsx", "utf8");
  ok("the builder derives it from the CV's language", /outLang: arabicCv \? "ar" : "en"/.test(design));
}

/* ── the two that were masked, and the one that was latent ────────────────────────── */
console.log("\n── the CV's language reaches every route that writes CV content ──");
{
  const { readFileSync } = await import("node:fs");
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  /*
   * ── O-5: /api/optimize's Anthropic branch dropped both language arguments ──
   *
   * It called `PROMPT(resume, jobDescription)` while the NVIDIA branch beside it passed four
   * arguments, and it accepted `extra` without ever concatenating it. Two consequences, live the
   * moment `AI_PROVIDER=anthropic` is set: `outLang` undefined falls to the prompt's English branch,
   * so a user who chose Arabic gets English; and `extra` is where `LANGUAGE_RETRY` arrives, so the
   * retry re-sent a byte-identical prompt and the model was never told what it got wrong.
   *
   * Masked by the default provider being NVIDIA — the kind of defect that appears the day someone
   * flips one environment variable, with nothing in the diff to explain it.
   */
  const opt = strip(readFileSync("app/api/optimize/route.ts", "utf8"));
  ok("the Anthropic branch takes both languages",
    /async function callAnthropic\(\s*resume: string, jobDescription: string, uiLang\?: string, outLang\?: string, extra = ""/.test(opt));
  ok("and passes them to the prompt",
    /PROMPT\(resume, jobDescription, uiLang, outLang\)/.test(opt));
  ok("and finally concatenates `extra`, so the retry says something new",
    /PROMPT\(resume, jobDescription, uiLang, outLang\) \+ extra/.test(opt));
  ok("the retry site passes them through",
    /callAnthropic\(resume, jd, uiLang, outLang, extra\)/.test(opt));
  /* Both providers must now receive the same four things, or the bug returns on one of them. */
  ok("neither provider is called with fewer arguments than the other",
    !/callAnthropic\(resume, jd, extra\)/.test(opt));

  /*
   * ── O-6: `ats_review` sent a key the route does not read, containing the wrong language ──
   *
   * `lang: i.lang ?? "en"` — discarded by the route, which reads `uiLang`/`outLang`, so `outLang`
   * defaulted to English inside it. And the discarded value was the INTERFACE language, where the
   * CV's own is `i.cvLang`; `TaskInput`'s own documentation says so.
   *
   * Reachable only through `runTask` — the typed, shared path a new caller would use — because the
   * two live `/optimize` pages bypass it and post `outLang` themselves.
   */
  const tasks = strip(readFileSync("app/lib/aiTasks.ts", "utf8"));
  const atsBody = tasks.slice(tasks.indexOf('endpoint: "/api/optimize"'), tasks.indexOf('endpoint: "/api/optimize"') + 700);
  ok("ats_review sends uiLang", /uiLang: i\.lang \?\? "en"/.test(atsBody));
  ok("and outLang from the CV, not the interface", /outLang: i\.cvLang \?\? i\.lang \?\? "en"/.test(atsBody));
  ok("and no longer sends a key the route ignores", !/\blang: i\.lang \?\? "en"[,}]/.test(atsBody));

  /*
   * ── O-7: /api/tools was English-only ──
   *
   * Both prompts were English text and the route read no language, so a LinkedIn headline, an About
   * section and eight interview questions came back in English regardless of the CV or the interface.
   * Latent — both callers are English pages today — but latent in the direction the product grows.
   */
  const tools = readFileSync("app/api/tools/route.ts", "utf8");
  const tcode = strip(tools);
  ok("/api/tools reads a language", /rawLang === "ar" \? "ar" : "en"/.test(tcode));
  ok("both prompts take it", /\(a: string, b: string, lang: "ar" \| "en"\) => string/.test(tcode));
  /* `[^)]*` stopped at the first `)` — the call nests `String(inputA).slice(...)`, so the naive
     class never reached the argument being asserted. A regex that cannot match the real call is a
     failing test with nothing wrong behind it. */
  ok("and it reaches the model", /promptFn\([\s\S]*?, lang\)/.test(tcode));
  ok("the rule is its own line, not folded into the persona", /OUTPUT LANGUAGE/.test(tools));
  /* The JSON keys are a wire format the caller destructures, not content — translating them would
     break the reader rather than serve them. */
  ok("the JSON keys stay English", /Keep the JSON keys exactly as given in English/.test(tools));
  /*
   * ── and then the callers stopped declaring a CONSTANT ──
   *
   * When the route first learned to read a language, these two pages were made to state theirs
   * explicitly: `lang: "en"`, which was honest about what they did and better than sending nothing.
   * It was still wrong. Both are reached by Arabic readers — `/ar/interview` and `/ar/linkedin`
   * redirect here with `?lang=ar` — so every Arabic user got English interview questions and an
   * English LinkedIn headline, and no field on either page could say otherwise.
   *
   * The assertion is therefore inverted rather than deleted: a hardcoded language is now the
   * regression, and `outLangFor` (which prefers the picked CV's own declaration, then the script the
   * user actually typed, then the interface) is the requirement. See `lib/myCvs.ts`.
   */
  for (const f of ["app/(en)/linkedin/page.tsx", "app/(en)/interview/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    const name = f.split("/").slice(-2).join("/");
    ok(`${name} derives its output language`, /lang: outLangFor\(/.test(src));
    ok(`${name} no longer hardcodes one`, !/lang: "en"/.test(src));
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
