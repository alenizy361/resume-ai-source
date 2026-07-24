/**
 * The bullet-explosion bug, pinned to the strings that caused it.
 *
 * Three live builds ended with ten near-identical duties under one job. Every
 * pair below is lifted from those runs — an exact comparison called them
 * different, a reader calls them the same duty written twice.
 *
 *   node --experimental-strip-types src/ops/resumedoc.test.mjs
 */

import {
  jobKey, saysTheSame, dedupeBullets, upsertRole, capBullets,
  roleHeader, rolesToLines, rolesDigest, BULLET_CAP_CURRENT, BULLET_CAP_PAST,
} from "../app/lib/resumeDoc.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

/* ── the actual duplicates from run 3 ── */
const D1 = "أعد فحوصات الأشعة التشخيصية باستخدام أجهزة متقدمة مثل MRI وCT وX-ray";
const D2 = "أعد فحوصات الأشعة التشخيصية باستخدام أجهزة متقدمة مثل الرنين المغناطيسي والأشعة المقطعية";
const D3 = "أعد صور الأشعة التشخيصية باستخدام أجهزة التصوير الشعاعي والتصوير المقطعي المحوسب";
const S1 = "حافظ على معايير السلامة الإشعاعية وطبق إجراءات الحماية من الإشعاع";
const S2 = "حافظ على معايير السلامة الإشعاعية وطبق إجراءات الوقاية من الإشعاع";
const DIFFERENT = "تعاون مع الأطباء لتحديد بروتوكولات الفحص المناسبة لكل حالة";

ok("two phrasings of the same imaging duty are one duty", saysTheSame(D1, D2));
ok("safety duty, protection vs prevention, is one duty", saysTheSame(S1, S2));
ok("a genuinely different duty stays different", !saysTheSame(D1, DIFFERENT));
ok("collaboration duty differs from safety duty", !saysTheSame(S1, DIFFERENT));

eq("the real duplicate pile collapses", dedupeBullets([D1, D2, S1, S2, DIFFERENT]).length, 3);
eq("dashes are stripped once", dedupeBullets(["- مهمة واحدة مميزة"])[0], "مهمة واحدة مميزة");
eq("empty lines vanish", dedupeBullets(["", "   ", "- "]).length, 0);

/* ── identity ── */
eq("same job regardless of diacritics", jobKey("أخصائي أشعة", "مستشفى دلة"), jobKey("اخصائي اشعه", "مستشفي دله"));
ok("different employer is a different job", jobKey("أخصائي أشعة", "دلة") !== jobKey("أخصائي أشعة", "الحرس الوطني"));

/* ── replace beats append: the whole point ── */
{
  let roles = [];
  roles = upsertRole(roles, { title: "أخصائي أشعة", bullets: [D1, S1] });
  roles = upsertRole(roles, { title: "أخصائي أشعة", company: "مستشفى دلة", start: "سبتمبر 2024", end: "الآن", bullets: [D2, S2] });
  eq("the stub was claimed, not duplicated", roles.length, 1);
  eq("restated duties did not pile up", roles[0].bullets.length, 2);
  ok("the employer was learned", roles[0].company === "مستشفى دلة");
  ok("the period was learned", roles[0].start === "سبتمبر 2024" && roles[0].end === "الآن");
}
{
  const roles = upsertRole(
    [{ title: "أخصائي أشعة", company: "دلة", location: "", start: "", end: "الآن", bullets: [D1, S1, DIFFERENT] }],
    { title: "أخصائي أشعة", company: "دلة", bullets: ["مهمة بديلة واحدة فقط"] }, true);
  eq("replace mode replaces", roles[0].bullets.length, 1);
}

/* ── caps, per the sources: 6 current, 4 past ── */
{
  const many = Array.from({ length: 12 }, (_, i) => `مهمة مختلفة تماما رقم ${i} بكلمات فريدة ${"سين".repeat(i + 1)}`);
  eq("current role capped", capBullets({ title: "t", company: "c", location: "", start: "2024", end: "الآن", bullets: many }).bullets.length, BULLET_CAP_CURRENT);
  eq("past role capped tighter", capBullets({ title: "t", company: "c", location: "", start: "2020", end: "2022", bullets: many }).bullets.length, BULLET_CAP_PAST);
}

/* ── the header the CV shows ── */
eq("header carries a real date RANGE",
  roleHeader({ title: "أخصائي أشعة", company: "مستشفى دلة", location: "الرياض", start: "سبتمبر 2024", end: "الآن", bullets: [] }),
  "أخصائي أشعة — مستشفى دلة, الرياض | سبتمبر 2024 – الآن");
ok("a lone start date does not print a dangling dash",
  !roleHeader({ title: "t", company: "c", location: "", start: "2024", end: "", bullets: [] }).includes("–"));

/* ── derived lines ── */
{
  const lines = rolesToLines([{ title: "أخصائي أشعة", company: "دلة", location: "", start: "2024", end: "الآن", bullets: ["أولى", "ثانية"] }]);
  eq("one header plus its bullets", lines.length, 3);
  ok("every bullet is dashed", lines.slice(1).every((l) => l.startsWith("- ")));
  ok("the header is not dashed", !lines[0].startsWith("- "));
}

/* ── the digest that replaces the truncated JSON ── */
{
  const digest = rolesDigest([{ title: "أخصائي أشعة", company: "دلة", location: "", start: "2024", end: "الآن", bullets: [D1, S1] }]);
  ok("the digest states what is already written", digest.includes("ALREADY WRITTEN"));
  ok("the digest shows the count against the cap", digest.includes(`2/${BULLET_CAP_CURRENT}`));
  ok("the digest is compact", digest.length < 500, `${digest.length} chars`);
  ok("empty roles say so", rolesDigest([]).includes("no roles"));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
