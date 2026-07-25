/**
 * One name, in one place, and it is the product's.
 *
 * The audit found three names in circulation: Sira (43 files), سيرة (33), and Rabit —
 * eight footers where it is correct attribution, plus AdvisorLanding, where the ASSISTANT
 * introduced itself as "I'm Rabit". That last one is the actual defect: Rabit is the
 * company, Sira is the product, and a user who is told three names across four screens
 * cannot tell which one charged their card.
 *
 *   node --experimental-strip-types src/ops/brand.test.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRAND, brandName, copyright, salaryBasis, supportEmailIsPersonal } from "../app/lib/brand.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
};
const FILES = walk("app").map((f) => [f.replace(/^app\//, ""), readFileSync(f, "utf8")]);
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── the definition ── */
{
  eq("the product is named in both languages", [brandName("en"), brandName("ar")], ["Sira", "سيرة"]);
  ok("the company is not the product", BRAND.company !== BRAND.name);
  ok("attribution names both, in that order",
    BRAND.attribution.startsWith(BRAND.name) && BRAND.attribution.endsWith(BRAND.company));
  ok("the Arabic attribution is in Arabic script — including the company",
    !/[A-Za-z]/.test(BRAND.attributionAr), BRAND.attributionAr);
  eq("the copyright line is generated", copyright("en", 2026), `© 2026 ${BRAND.attribution}`);
  ok("and in Arabic", copyright("ar", 2026).startsWith("© 2026") && /سيرة/.test(copyright("ar", 2026)));
}

/* ── the company name is never used as a name ── */
{
  /*
   * The defect is the company name in a SELF-INTRODUCTION, not every mention of it.
   *
   * The first version of this check flagged any bare "Rabit" and caught /privacy and
   * /terms — which are legally required to name the operating company and are the one
   * place it belongs in prose. A check that fires on correct behaviour gets switched
   * off, so it now matches only the pattern that was actually wrong: something telling
   * the user its name is the company's.
   */
  const INTRODUCES = /\b(?:I'?m|I am|this is)\s+Rabit\b|أنا\s+راب[طت]\b/;
  const offenders = FILES
    .filter(([rel, src]) => rel !== "lib/brand.ts" && INTRODUCES.test(code(src)))
    .map(([rel]) => rel);
  ok("nothing introduces itself as the company", offenders.length === 0, offenders.join(", "));

  /*
   * The greeting itself — wherever it lives, or nowhere.
   *
   * This used to name `components/AdvisorLanding.tsx` and read its `boot_me` string, because
   * that file is where the defect happened. Then AdvisorLanding was deleted as dead code and
   * this assertion started failing against an empty string: the proxy had gone while the rule
   * it stood for had not.
   *
   * So it is now the rule. ANY self-introduction anywhere must interpolate the brand rather
   * than hardcode a name, and zero self-introductions passes — which is the current state,
   * since the only one the product had went with the file.
   */
  const GREETS = /\b(?:boot_me|greeting|selfIntro)\s*:\s*(?:`|")([^`"]*)/g;
  const badGreetings = [];
  for (const [rel, src] of FILES) {
    if (rel === "lib/brand.ts") continue;
    for (const m of code(src).matchAll(GREETS)) {
      const text = m[1];
      // A greeting that says a name must say it via BRAND; one that names nobody is fine.
      if (/\b(?:I'?m|I am)\b|أنا\b/.test(text) && !/\$\{BRAND\.(?:name|nameAr)\}|brandName\(/.test(text)) {
        badGreetings.push(`${rel}: "${text.slice(0, 40)}"`);
      }
    }
  }
  ok("any assistant greeting names the product through BRAND, or names nobody",
    badGreetings.length === 0, badGreetings.join(" · "));
}

/* ── the footer exists once ── */
{
  const hardcoded = FILES.filter(([rel, src]) =>
    rel !== "lib/brand.ts" && /©\s*\d{4}\s*(?:Sira|سيرة)/.test(code(src))).map(([rel]) => rel);
  ok("no page hardcodes the copyright line", hardcoded.length === 0, hardcoded.join(", "));

  const users = FILES.filter(([, src]) => /\bcopyright\(/.test(src)).length;
  // Thirteen footers were consolidated. If this drops, a page stopped attributing.
  ok("the generated footer is actually used", users >= 12, `${users} files`);
}

/* ── the support address ── */
{
  ok("a support address exists", /@/.test(BRAND.supportEmail));
  // A known-open item, asserted so it cannot be forgotten OR silently regress into more
  // files. The fix is NEXT_PUBLIC_SUPPORT_EMAIL, not a code change — and inventing a
  // support@ mailbox that does not exist would be worse than shipping one that is read.
  ok("it is still the personal fallback, which is a documented open item",
    supportEmailIsPersonal(), "set NEXT_PUBLIC_SUPPORT_EMAIL to close this");

  const inline = FILES.filter(([rel, src]) =>
    rel !== "lib/brand.ts" && /alanziabdulaziz4@gmail\.com/.test(code(src))).map(([rel]) => rel);
  // The seven inline copies are the debt this documents. The number must not grow.
  ok("the personal address is not spreading", inline.length <= 7, `${inline.length}: ${inline.join(", ")}`);
}

/* ── a published salary figure must say what it is ── */
{
  for (const lang of ["en", "ar"]) {
    const b = salaryBasis(lang);
    ok(`the ${lang} salary basis exists and is specific`, b.length > 60, b.slice(0, 40));
    ok(`the ${lang} basis does not claim a survey`, !/verified salary survey|مسحاً موثّقاً للرواتب/.test(b.replace(/not a verified salary survey|وليس مسحاً موثّقاً للرواتب/, "")));
  }
  ok("the Arabic basis is in Arabic", /[؀-ۿ]/.test(salaryBasis("ar")));

  /*
   * Every page that prints a range prints the qualifier beside it.
   *
   * 62 Arabic occupations and 55 English ones carry a salary range with no survey, no
   * dataset and no year behind it, labelled "Typical salary". A jobseeker deciding what
   * to ask for reads that as a Saudi market fact, and a wrong one costs them money in a
   * negotiation. The figures stay — a labelled estimate is genuinely useful — but a page
   * cannot print the number without the label.
   */
  const printsSalary = FILES.filter(([, src]) => /\{j\.salary\}/.test(src));
  ok("some page still publishes ranges", printsSalary.length >= 3, `${printsSalary.length} pages`);
  const unlabelled = printsSalary.filter(([, src]) => !/salaryBasis\(/.test(src)).map(([rel]) => rel);
  ok("no page prints a salary range without its basis", unlabelled.length === 0, unlabelled.join(", "));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
