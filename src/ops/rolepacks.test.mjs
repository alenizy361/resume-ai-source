/**
 * The role packs, checked against the promise they exist to keep.
 *
 * A pack is the first thing a user sees after typing their job title — before any
 * model has run, before anything has been confirmed. That makes it the easiest
 * place in the product for a fabricated fact to enter a CV: the content is
 * pre-written, it looks authoritative, and confirming it is one tap. So the two
 * things that must never happen are asserted here structurally.
 *
 * FIRST: no digits and no percent sign anywhere in any pack. Every string is
 * walked — titles, aliases, group labels, items, duties, credentials, keywords.
 * A duty may describe the work ("Performed diagnostic imaging examinations to
 * approved protocols") and never a result the user did not report ("Performed 40
 * examinations daily, cutting waiting time 20%"). One invented figure discredits
 * every honest line beside it, so the check is exhaustive rather than a spot test.
 *
 * SECOND: both languages, always. A pack missing its Arabic side silently drops a
 * Saudi user into an English-only builder, which is the market this is for.
 *
 * The Radiology Technologist pack is the mandated case: it must be findable from
 * the five spellings people actually type, in either language, and it must offer
 * SCFHS registration and SCFHS classification as two distinct credentials —
 * they are separate acts with separate documents, and merging them reads as if
 * the applicant misunderstands their own licensing.
 *
 *   node --experimental-strip-types src/ops/rolepacks.test.mjs
 */

import { findRolePack, allRolePacks } from "../app/lib/rolePacks.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const packs = allRolePacks();

/** Every string a pack carries, with a path so a failure names the offender. */
function walk(pack) {
  const out = [];
  const push = (path, value) => out.push({ path, value: String(value) });
  push("slug", pack.slug);
  push("title.en", pack.title.en);
  push("title.ar", pack.title.ar);
  pack.aliases.forEach((a, i) => push(`aliases[${i}]`, a));
  pack.groups.forEach((g, gi) => {
    push(`groups[${gi}].label.en`, g.label.en);
    push(`groups[${gi}].label.ar`, g.label.ar);
    g.items.forEach((it, ii) => {
      push(`groups[${gi}].items[${ii}].en`, it.en);
      push(`groups[${gi}].items[${ii}].ar`, it.ar);
    });
  });
  pack.duties.forEach((d, i) => {
    push(`duties[${i}].en`, d.en);
    push(`duties[${i}].ar`, d.ar);
  });
  pack.credentials.forEach((c, i) => {
    push(`credentials[${i}].kind`, c.kind);
    push(`credentials[${i}].title.en`, c.title.en);
    push(`credentials[${i}].title.ar`, c.title.ar);
    if (c.issuer) push(`credentials[${i}].issuer`, c.issuer);
  });
  pack.keywords.forEach((k, i) => push(`keywords[${i}]`, k));
  return out;
}

/* ── the packs exist and are distinct ── */

eq("fourteen packs ship", packs.length, 14);
{
  const slugs = packs.map((p) => p.slug);
  eq("every slug is unique", slugs.length, new Set(slugs).size);
  ok("the mandated radiology pack is one of them", slugs.includes("radiology-technologist"), slugs.join(", "));
}

/* ══════════ NO NUMBERS, ANYWHERE ══════════
 * Arabic-Indic and Eastern Arabic-Indic digits count too — a fabricated figure
 * written ٤٠ is the same fabrication written 40.
 */
const DIGIT = /[0-9٠-٩۰-۹]/;
const PERCENT = /[%٪]/;

let scanned = 0;
for (const pack of packs) {
  const strings = walk(pack);
  scanned += strings.length;
  const numeric = strings.filter((s) => DIGIT.test(s.value));
  const percent = strings.filter((s) => PERCENT.test(s.value));
  ok(`${pack.slug}: no digit in any string`, numeric.length === 0,
    numeric.slice(0, 3).map((s) => `${s.path}="${s.value}"`).join(" | "));
  ok(`${pack.slug}: no percentage in any string`, percent.length === 0,
    percent.slice(0, 3).map((s) => `${s.path}="${s.value}"`).join(" | "));
}
ok("the scan actually covered the content", scanned > 500, `only ${scanned} strings walked`);

/* ── the spelling that would embarrass the product ── */
{
  const offenders = [];
  for (const pack of packs) {
    for (const s of walk(pack)) if (/SCAFACH/i.test(s.value)) offenders.push(`${pack.slug}.${s.path}`);
  }
  ok("the misspelling SCAFACH appears in no pack", offenders.length === 0, offenders.join(", "));
}

/* ── both languages, always ── */
for (const pack of packs) {
  const missing = [];
  const both = (path, pair) => {
    if (!pair.en || !String(pair.en).trim()) missing.push(`${path}.en`);
    if (!pair.ar || !String(pair.ar).trim()) missing.push(`${path}.ar`);
  };
  both("title", pack.title);
  pack.groups.forEach((g, gi) => {
    both(`groups[${gi}].label`, g.label);
    g.items.forEach((it, ii) => both(`groups[${gi}].items[${ii}]`, it));
  });
  pack.duties.forEach((d, i) => both(`duties[${i}]`, d));
  pack.credentials.forEach((c, i) => both(`credentials[${i}].title`, c.title));
  ok(`${pack.slug}: Arabic and English are both present everywhere`, missing.length === 0, missing.join(", "));
}

/* ── Arabic that is actually Arabic, English that is actually English ── */
const ARABIC = /[؀-ۿ]/;
for (const pack of packs) {
  const wrong = [];
  for (const s of walk(pack)) {
    if (s.path.endsWith(".ar") && !ARABIC.test(s.value)) wrong.push(`${s.path}="${s.value}"`);
  }
  ok(`${pack.slug}: every .ar field contains Arabic script`, wrong.length === 0, wrong.slice(0, 3).join(" | "));
}

/* ── enough content to be worth showing instantly ── */
for (const pack of packs) {
  const n = pack.duties.length;
  ok(`${pack.slug}: eight to twelve duties (${n})`, n >= 8 && n <= 12);
  ok(`${pack.slug}: suggestions are grouped`, pack.groups.length >= 2 && pack.groups.every((g) => g.items.length >= 4));
  ok(`${pack.slug}: credentials are offered`, pack.credentials.length >= 4);
  ok(`${pack.slug}: ATS keywords in both languages`,
    pack.keywords.length >= 10 && pack.keywords.some((k) => ARABIC.test(k)) && pack.keywords.some((k) => /[A-Za-z]/.test(k)));
}

/* ── a duty describes work, not a result ── */
for (const pack of packs) {
  const metric = pack.duties.filter((d) =>
    /\b(increased|reduced|improved|achieved|exceeded|grew|saved)\b/i.test(d.en)
    || /(زيادة|تخفيض|تحسين بنسبة|تجاوز المستهدف)/.test(d.ar));
  ok(`${pack.slug}: no duty claims an unreported outcome`, metric.length === 0,
    metric.map((d) => d.en).join(" | "));
  const placeholder = pack.duties.filter((d) => /\[|\]|\bX+\b|__/.test(d.en) || /\[|\]/.test(d.ar));
  ok(`${pack.slug}: no bracketed placeholder for a figure`, placeholder.length === 0,
    placeholder.map((d) => d.en).join(" | "));
}

/* ══════════ THE MANDATED RADIOLOGY TECHNOLOGIST CASE ══════════ */

const RADIOLOGY = "radiology-technologist";

for (const typed of ["Radiology Technologist", "radiology tech", "اخصائي اشعة", "أخصائي أشعة", "Radiologic Technologist"]) {
  const got = findRolePack(typed);
  ok(`"${typed}" finds the radiology pack`, got?.slug === RADIOLOGY, `got ${got?.slug ?? "null"}`);
}
ok("case is irrelevant", findRolePack("RADIOLOGY TECHNOLOGIST")?.slug === RADIOLOGY);
ok("a longer real-world title still matches", findRolePack("Senior Radiology Technologist — Riyadh")?.slug === RADIOLOGY,
  String(findRolePack("Senior Radiology Technologist — Riyadh")?.slug));

/* ── an unknown occupation gets nothing, not the nearest guess ── */
eq("an unknown title returns null", findRolePack("underwater basket weaver"), null);
eq("an empty title returns null", findRolePack(""), null);
eq("punctuation alone returns null", findRolePack("   —  "), null);

/* ── the pack's mandated content ── */
{
  const rad = findRolePack("Radiology Technologist");
  const group = (en) => rad.groups.find((g) => g.label.en === en);

  const modalities = group("Modalities");
  ok("the Modalities group exists", !!modalities);
  for (const want of ["General X-ray", "Computed Tomography", "Magnetic Resonance Imaging", "Fluoroscopy",
    "Mammography", "Bone Mineral Density", "Mobile imaging", "Operating-room imaging"]) {
    ok(`Modalities offers ${want}`, modalities.items.some((i) => i.en === want));
  }

  const systems = group("Systems");
  ok("the Systems group exists", !!systems);
  for (const want of ["PACS", "RIS", "DICOM", "Modality worklist", "Worklist management"]) {
    ok(`Systems offers ${want}`, systems.items.some((i) => i.en === want));
  }

  const clinical = group("Clinical & Safety");
  ok("the Clinical & Safety group exists", !!clinical);
  for (const want of ["Patient identification", "Patient positioning", "Image-quality assessment",
    "Radiation protection", "Infection control", "Contrast-media safety", "Emergency imaging",
    "Pediatric imaging", "Quality control", "Equipment fault escalation"]) {
    ok(`Clinical & Safety offers ${want}`, clinical.items.some((i) => i.en === want));
  }

  // Registration and classification are two SCFHS acts, not one.
  const reg = rad.credentials.filter((c) => c.kind === "registration" && /SCFHS/.test(c.title.en));
  const cls = rad.credentials.filter((c) => c.kind === "classification" && /SCFHS/.test(c.title.en));
  eq("SCFHS registration is offered once", reg.length, 1);
  eq("SCFHS classification is offered once", cls.length, 1);
  ok("they are separate entries", reg[0] !== cls[0] && reg[0].title.en !== cls[0].title.en,
    `${reg[0]?.title.en} vs ${cls[0]?.title.en}`);
  ok("with different kinds", reg[0].kind !== cls[0].kind);

  for (const [kind, pattern] of [
    ["certification", /Basic Life Support/],
    ["training", /Radiation Safety/],
    ["certification", /Radiation Protection Officer/],
    ["training", /Infection Control/],
  ]) {
    ok(`the pack offers a ${kind} matching ${pattern}`,
      rad.credentials.some((c) => c.kind === kind && pattern.test(c.title.en)));
  }

  ok("no credential pretends to be held — no dates, no numbers",
    rad.credentials.every((c) => !("issueDate" in c) && !("expiryDate" in c) && !DIGIT.test(JSON.stringify(c))));
  ok("SCFHS is spelled correctly in the issuer field",
    rad.credentials.filter((c) => c.issuer).every((c) => !/SCAFACH/i.test(c.issuer)));
}

/* ── the other five are reachable by what people type ── */
for (const [typed, slug] of [
  ["Accountant", "accountant"],
  ["محاسب عام", "accountant"],
  ["Senior Accountant", "accountant"],
  ["Cashier", "cashier"],
  ["كاشير", "cashier"],
  ["Registered Nurse", "registered-nurse"],
  ["ممرض", "registered-nurse"],
  ["Staff Nurse", "registered-nurse"],
  ["Sales Manager", "sales-manager"],
  ["مدير مبيعات", "sales-manager"],
  ["Administrative Assistant", "administrative-assistant"],
  ["مساعد إداري", "administrative-assistant"],
  ["Secretary", "administrative-assistant"],
]) {
  const got = findRolePack(typed);
  ok(`"${typed}" finds ${slug}`, got?.slug === slug, `got ${got?.slug ?? "null"}`);
}

/* ── suggestions carry no duplicates within a pack ── */
for (const pack of packs) {
  const items = pack.groups.flatMap((g) => g.items.map((i) => i.en.toLowerCase()));
  eq(`${pack.slug}: no repeated suggestion item`, items.length, new Set(items).size);
  const duties = pack.duties.map((d) => d.en.toLowerCase());
  eq(`${pack.slug}: no repeated duty`, duties.length, new Set(duties).size);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
