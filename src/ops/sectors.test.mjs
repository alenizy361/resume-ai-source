/**
 * The category layer, and the three ways it could quietly be wrong.
 *
 * 1. **A published page with nothing behind it.** The whole point of `MIN_PROFESSIONS` is that a
 *    category page with two links is the thin auto-generated content the brief bans. A gate that is
 *    never asserted is a gate that gets relaxed by accident when someone adds a sector.
 *
 * 2. **A one-way hreflang.** This is the bug the crawl already found once, on the job pages: the
 *    Arabic side declared its English twin and the English side never declared back, so Google
 *    discarded the pair. The sector pages are worse-placed for it, because the two catalogues
 *    publish DIFFERENT sets — nine Arabic sectors, six English — so a naive reciprocal declaration
 *    would point three Arabic pages at English pages that were never generated.
 *
 * 3. **A route collision.** `/resume-examples/category/<sector>` lives beside
 *    `/resume-examples/<job>`. A job whose slug is literally `category` would make the routing
 *    depend on how Next resolves a static segment against a dynamic sibling.
 *
 * Plus the title lengths, which is the finding this batch was meant to close, measured over the
 * real catalogue rather than a sample.
 *
 *   node --experimental-strip-types ops/sectors.test.mjs
 */

import {
  MIN_PROFESSIONS, SECTORS, copyFor, getSector, hasBoth, professions, sectorForCategory,
  sectorSlugs, sectorsFor, sharedCerts, sharedKeywords,
} from "../app/lib/sectors.ts";
import { JOBS, JOB_SLUGS, CATEGORIES } from "../app/lib/jobs.ts";
import { JOBS_AR, AR_CATEGORIES } from "../app/lib/jobs-ar.ts";
import { TITLE_LIMIT, DESC_LIMIT, fitTitle } from "../app/lib/seoTitle.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ─────────────────── 1. the gate ─────────────────── */

console.log("\n── the publication gate ──");

for (const lang of ["en", "ar"]) {
  for (const s of sectorsFor(lang)) {
    const n = professions(s.slug, lang).length;
    ok(`${lang}/${s.slug}: has at least ${MIN_PROFESSIONS} professions`, n >= MIN_PROFESSIONS, `${n}`);
  }
}

/* And the other direction: a registry entry too thin to publish must not be reachable. */
for (const lang of ["en", "ar"]) {
  const thin = SECTORS.filter((s) => copyFor(s, lang) && professions(s.slug, lang).length < MIN_PROFESSIONS);
  for (const s of thin) {
    ok(`${lang}/${s.slug}: too thin, so getSector refuses it`, getSector(s.slug, lang) === undefined);
    ok(`${lang}/${s.slug}: too thin, so it is not in the route list`, !sectorSlugs(lang).includes(s.slug));
  }
  console.log(`   (${lang}: ${sectorsFor(lang).length} published, ${thin.length} withheld)`);
}

ok("English publishes fewer sectors than Arabic — the catalogues genuinely differ",
  sectorsFor("en").length < sectorsFor("ar").length,
  `en ${sectorsFor("en").length} / ar ${sectorsFor("ar").length}`);

/* ─────────────────── 2. hreflang ─────────────────── */

console.log("\n── hreflang can only be declared both ways ──");

for (const s of SECTORS) {
  const en = Boolean(getSector(s.slug, "en"));
  const ar = Boolean(getSector(s.slug, "ar"));
  ok(`${s.slug}: hasBoth agrees with what is published`, hasBoth(s.slug) === (en && ar), `en=${en} ar=${ar}`);
  if (!hasBoth(s.slug)) {
    ok(`${s.slug}: one language only, so no alternate is claimed`, en !== ar || (!en && !ar));
  }
}

const oneSided = SECTORS.filter((s) => !hasBoth(s.slug) && (getSector(s.slug, "en") || getSector(s.slug, "ar")));
ok("at least one sector is published in one language only — the case the guard exists for",
  oneSided.length > 0, `${oneSided.map((s) => s.slug).join(", ")}`);

/* ─────────────────── 3. routing ─────────────────── */

console.log("\n── routing ──");

ok("no job slug is `category`, which would collide with the sector path",
  !JOB_SLUGS.includes("category") && !JOBS_AR.some((j) => j.slug === "category"));

const allSectorSlugs = SECTORS.map((s) => s.slug);
ok("sector slugs are unique", new Set(allSectorSlugs).size === allSectorSlugs.length);
ok("sector slugs are URL-safe lowercase", allSectorSlugs.every((s) => /^[a-z0-9-]+$/.test(s)),
  allSectorSlugs.filter((s) => !/^[a-z0-9-]+$/.test(s)).join(", "));
ok("no sector slug is also a job slug in either language",
  allSectorSlugs.every((s) => !JOB_SLUGS.includes(s) && !JOBS_AR.some((j) => j.slug === s)));

/* ─────────────────── the join, which is where a typo hides ─────────────────── */

console.log("\n── the category values actually join ──");

for (const lang of ["en", "ar"]) {
  const known = lang === "ar" ? AR_CATEGORIES : CATEGORIES;
  for (const s of SECTORS) {
    const copy = copyFor(s, lang);
    if (!copy) continue;
    ok(`${lang}/${s.slug}: category "${copy.category}" exists in the catalogue`, known.includes(copy.category));
  }
}

/* A published sector must be findable from the category value, which is how the profession pages
   link up. A mismatch here shows as a silently missing link rather than an error. */
for (const lang of ["en", "ar"]) {
  for (const s of sectorsFor(lang)) {
    const back = sectorForCategory(copyFor(s, lang).category, lang);
    ok(`${lang}/${s.slug}: reachable from its category value`, back?.slug === s.slug, back?.slug ?? "undefined");
  }
}

/* A category too thin to publish must return undefined rather than the wrong sector. */
{
  const thinCats = CATEGORIES.filter((c) => JOBS.filter((j) => j.category === c).length < MIN_PROFESSIONS);
  for (const c of thinCats) {
    ok(`en category "${c}" is too thin, so professions in it link nowhere`, sectorForCategory(c, "en") === undefined);
  }
  console.log(`   (${thinCats.length} English categories deliberately have no sector page)`);
}

/* ─────────────────── content: written, not generated ─────────────────── */

console.log("\n── the content is real ──");

for (const lang of ["en", "ar"]) {
  for (const s of sectorsFor(lang)) {
    const c = copyFor(s, lang);
    ok(`${lang}/${s.slug}: title within ${TITLE_LIMIT}`, c.title.length <= TITLE_LIMIT, `${c.title.length}`);
    ok(`${lang}/${s.slug}: description within ${DESC_LIMIT}`, c.description.length <= DESC_LIMIT, `${c.description.length}`);
    ok(`${lang}/${s.slug}: at least two intro paragraphs`, c.intro.length >= 2, `${c.intro.length}`);
    const words = [...c.intro, c.hiring, ...c.faq.flatMap((f) => [f.q, f.a])].join(" ").split(/\s+/).length;
    ok(`${lang}/${s.slug}: at least 250 words of prose`, words >= 250, `${words}`);
    ok(`${lang}/${s.slug}: three or more questions`, c.faq.length >= 3, `${c.faq.length}`);
  }
}

/* The Arabic pages must be written in Arabic, not translated — the duplicate-content trap the
   English/Arabic pairs already fell into once. A page with no Arabic letters in its prose is a
   placeholder; a page whose Arabic reads as a word-for-word mirror is a duplicate, which no test
   can catch, but an untranslated one can be. */
for (const s of sectorsFor("ar")) {
  const c = copyFor(s, "ar");
  const prose = [...c.intro, c.hiring].join(" ");
  ok(`ar/${s.slug}: written in Arabic`, /[؀-ۿ]/.test(prose) && !/[a-z]{12,}/.test(prose));
}

/* No two sectors may share an intro or a description — that is duplicate content inside one site. */
for (const lang of ["en", "ar"]) {
  const descriptions = sectorsFor(lang).map((s) => copyFor(s, lang).description);
  const intros = sectorsFor(lang).map((s) => copyFor(s, lang).intro[0]);
  ok(`${lang}: every sector description is distinct`, new Set(descriptions).size === descriptions.length);
  ok(`${lang}: every sector opening paragraph is distinct`, new Set(intros).size === intros.length);
}

/* ─────────────────── computed tables ─────────────────── */

console.log("\n── the computed tables ──");

for (const lang of ["en", "ar"]) {
  for (const s of sectorsFor(lang)) {
    const kw = sharedKeywords(s.slug, lang);
    const n = professions(s.slug, lang).length;
    ok(`${lang}/${s.slug}: no shared keyword claims more roles than exist`,
      kw.every((k) => k.count <= n), `${n} roles`);
    ok(`${lang}/${s.slug}: every shared keyword appears in at least 2 roles`,
      kw.every((k) => k.count >= 2));
    ok(`${lang}/${s.slug}: shared keywords are sorted by frequency`,
      kw.every((k, i) => i === 0 || kw[i - 1].count >= k.count));
    ok(`${lang}/${s.slug}: no duplicate term after case folding`,
      new Set(kw.map((k) => k.term.toLowerCase())).size === kw.length);
  }
}

/*
 * An empty table is a legitimate answer and the page must not pretend otherwise. The five English
 * healthcare professions in the catalogue share no keyword at all — they were written separately
 * and phrase the same idea differently — so this asserts the shape rather than a minimum, and
 * records the fact so it is a known gap rather than a surprise.
 */
{
  const empty = [];
  for (const lang of ["en", "ar"]) {
    for (const s of sectorsFor(lang)) {
      if (sharedKeywords(s.slug, lang).length === 0) empty.push(`${lang}/${s.slug}`);
      if (sharedCerts(s.slug, lang).length === 0) empty.push(`${lang}/${s.slug}:certs`);
    }
  }
  ok("an empty computed table returns [] rather than throwing", Array.isArray(sharedKeywords("technology", "en")));
  console.log(`   (empty tables, rendered as absent rather than as a heading: ${empty.join(", ") || "none"})`);
}

/* ─────────────────── titles that fit ─────────────────── */

console.log("\n── every templated title fits ──");

const templated = [
  ["resume-examples", JOBS, (j) => fitTitle(`${j.title} Resume Example`, " & ATS Keywords", " (2026)")],
  ["resume-skills", JOBS, (j) => fitTitle(`${j.title} Skills for a Resume`, " — ATS Keywords", " (2026)")],
  ["cover-letter", JOBS, (j) => `${j.title} Cover Letter Example (2026)`],
  ["ar/resume-examples", JOBS_AR, (j) => `مثال سيرة ذاتية ${j.title} + كلمات ATS (2026)`],
  ["ar/resume-skills", JOBS_AR, (j) => `مهارات وكلمات ATS لسيرة ${j.title} (2026)`],
  ["ar/cover-letter", JOBS_AR, (j) => `مثال خطاب تعريف ${j.title} (2026)`],
];
for (const [name, list, build] of templated) {
  const over = list.map(build).filter((t) => t.length > TITLE_LIMIT);
  const longest = Math.max(...list.map((j) => build(j).length));
  ok(`${name}: no title over ${TITLE_LIMIT} characters`, over.length === 0, over.slice(0, 2).join(" | "));
  console.log(`   (${name}: longest ${longest})`);
}

/*
 * And `fitTitle` itself: the reason it uses `continue` rather than `break` is that a part which does
 * not fit must not block a shorter one that would. Asserted directly, because that behaviour is one
 * keyword away from being wrong and produces no error when it is.
 */
console.log("\n── fitTitle ──");
ok("appends everything that fits", fitTitle("Base", " A", " B") === "Base A B");
ok("drops a part that would exceed the limit", fitTitle("x".repeat(63), " AB", " C") === `${"x".repeat(63)} C`);
ok("keeps the base even when nothing fits", fitTitle("y".repeat(64), " very long suffix") === "y".repeat(64));
ok("never returns more than the limit when the base fits",
  [...JOBS, ...JOBS_AR].every((j) => fitTitle(`${j.title} Resume Example`, " & ATS Keywords", " (2026)").length <= TITLE_LIMIT));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
