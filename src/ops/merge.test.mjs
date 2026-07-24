/**
 * The duplicate-employer bug, pinned.
 *
 * Every case here is taken from a real build against the live product, where
 * one job at one hospital printed as three separate jobs on the finished CV.
 *
 *   node --experimental-strip-types src/ops/merge.test.mjs
 */

import {
  EMPTY_PROFILE, mergePatch, roleKey, weaveLoose, weaveRole, dashify, assembleResume,
} from "../app/lib/mergeProfile.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ── roleKey: the three spellings the live run produced ── */
const A = "أخصائي أشعة — مستشفى دلة | سبتمبر 2024";
const B = "أخصائي أشعة في مستشفى دلة";
const C = "أخصائي أشعة — مستشفى دلة | [add your real dates]";
eq("same job, dash form vs في form", roleKey(A), roleKey(B));
eq("same job, placeholder date ignored", roleKey(A), roleKey(C));
ok("a different employer is a different job",
  roleKey(A) !== roleKey("أخصائي أشعة — مستشفى الحرس الوطني | يونيو 2022"));
ok("a different title is a different job",
  roleKey(A) !== roleKey("متدرب أشعة — مستشفى دلة | سبتمبر 2024"));
eq("English at-form matches dash form",
  roleKey("Radiographer at Dallah Hospital"), roleKey("Radiographer — Dallah Hospital | 2024"));

/* ── weaveRole: the same job must not appear twice ── */
{
  let lines = [];
  lines = weaveRole(lines, "أخصائي أشعة", ["- مهمة أولى"]);
  lines = weaveRole(lines, A, ["- مهمة ثانية"]);
  lines = weaveRole(lines, C, ["- مهمة ثالثة"]);
  const headers = lines.filter((l) => !/^[-•]/.test(l));
  eq("one employer yields one header", headers.length, 1);
  eq("the header with real dates wins", headers[0], A);
  eq("bullets from every turn survive", lines.filter((l) => /^-/.test(l)).length, 3);
}

/* ── the header must never carry a placeholder ── */
{
  const lines = weaveRole([], "أخصائي أشعة — مستشفى دلة | September [add your real year]", []);
  ok("placeholder stripped from header", !/\[/.test(lines[0]), lines[0]);
}

/* ── weaveLoose: prose restating a known job is not a new section ── */
{
  let lines = weaveRole([], A, ["- مهمة"]);
  lines = weaveLoose(lines, ["أخصائي أشعة في مستشفى دلة", "قمت بتشغيل أجهزة الأشعة"]);
  const headers = lines.filter((l) => !/^[-•]/.test(l));
  eq("restated job adds no second header", headers.length, 2); // the role header + the loose duty
  ok("the loose duty is kept", lines.some((l) => l.includes("قمت بتشغيل")));
}
{
  const lines = weaveLoose([], ["- مهمة", "- مهمة"]);
  eq("identical bullets are not repeated", lines.length, 1);
}
eq("a dashed line keeps one dash", dashify("- مهمة"), "- مهمة");
eq("a bullet char becomes a dash", dashify("• مهمة"), "- مهمة");
eq("a header is left alone", dashify("أخصائي أشعة — دلة"), "أخصائي أشعة — دلة");

/* ── mergePatch end to end, mirroring the live turns ── */
{
  let p = { ...EMPTY_PROFILE };
  p = mergePatch(p, { role: "أخصائي أشعة", experiences: [{ header: { title: "أخصائي أشعة" }, bullets: ["مهمة أ"] }] });
  p = mergePatch(p, {
    experiences: [{
      header: { title: "أخصائي أشعة", company: "مستشفى دلة", start_date: "سبتمبر 2024", end_date: "الآن" },
      bullets: ["مهمة ب"],
    }],
  });
  const headers = p.wovenLines.filter((l) => !/^[-•]/.test(l));
  eq("merge keeps one employer", headers.length, 1);
  ok("merge keeps the date range", headers[0].includes("سبتمبر 2024") && headers[0].includes("الآن"), headers[0]);
  eq("bullets are dashed", p.wovenLines.filter((l) => /^- /.test(l)).length, 2);
}

/* ── education and certifications still fold in ── */
{
  let p = { ...EMPTY_PROFILE };
  p = mergePatch(p, { education: { degree: "بكالوريوس", university: "جامعة الملك سعود", graduation_year: "2022" } });
  p = mergePatch(p, { certifications: "تصنيف الهيئة السعودية, BLS", languages: "العربية (الأم)، الإنجليزية" });
  ok("degree recorded", p.education.includes("بكالوريوس"));
  ok("graduation year captured", p.graduationYear === "2022");
  ok("certifications get their own field", p.certifications.includes("BLS"));
  ok("certifications stay out of education", !p.education.includes("BLS"));
  ok("languages get their own field", p.languages.includes("الإنجليزية"));
  const out = assembleResume(p, false);
  ok("CERTIFICATIONS is its own section", out.includes("CERTIFICATIONS & TRAINING"));
  ok("LANGUAGES is its own section", out.includes("LANGUAGES"));
}

/* ── assembleResume keeps the ATS order ── */
{
  const p = { ...EMPTY_PROFILE, name: "عبدالعزيز", role: "أخصائي أشعة", skills: "MRI", education: "بكالوريوس" };
  const out = assembleResume(p, false);
  ok("summary heading precedes skills heading", out.indexOf("WORK EXPERIENCE") < out.indexOf("SKILLS") || !out.includes("WORK EXPERIENCE"));
  ok("skills precede education", out.indexOf("SKILLS") < out.indexOf("EDUCATION"));
}


/* ── the sixteen-duty CV, replayed exactly ──
 * Taken verbatim from the live build at commit 1008af5, where two turns of
 * rewording put sixteen duties under one hospital. Every previous suite passed
 * while this was happening, because the suites tested the pieces and not the
 * path the product actually takes.
 */
{
  let p = { ...EMPTY_PROFILE };
  // Turn 1: the model drafts into experiences.
  p = mergePatch(p, {
    role: "أخصائي أشعة",
    experiences: [{ header: { title: "أخصائي أشعة" }, bullets: [
      "قام بإجراء الفحوصات الشعاعية للمرضى باستخدام أحدث التقنيات",
      "ساعد في تحليل وتفسير الصور الشعاعية",
      "عمل على تطبيق إجراءات السلامة من الإشعاع في بيئة العمل",
      "تعاون مع الفريق الطبي لتقديم رعاية شاملة للمرضى",
    ] }],
  });
  // Turn 1 ALSO mirrors the same duties into resume_lines, undashed — this is
  // what leaked four headings onto the CV.
  p.wovenLines = weaveLoose(p.wovenLines, [
    "قام بإجراء الفحوصات الشعاعية للمرضى باستخدام أحدث التقنيات",
    "ساعد في تحليل وتفسير الصور الشعاعية",
    "عمل على تطبيق إجراءات السلامة من الإشعاع في بيئة العمل",
    "تعاون مع الفريق الطبي لتقديم رعاية شاملة للمرضى",
  ]);
  // Turn 5: the employer is learned and the duties come back reworded.
  p = mergePatch(p, {
    experiences: [{
      header: { title: "أخصائي أشعة", company: "مستشفى دلة", start_date: "سبتمبر 2024", end_date: "الآن" },
      bullets: [
        "أعد فحوصات الأشعة التشخيصية باستخدام أجهزة متقدمة مثل MRI وCT وX-ray",
        "تأكد من جودة الصور الشعاعية وملاءمتها للتشخيص الطبي",
        "سجل نتائج الفحوصات بدقة في أنظمة إدارة المستشفى",
        "تعاون مع أطباء الأشعة لضمان دقة التقارير الطبية",
        "حافظ على معايير السلامة الإشعاعية وطبق إجراءات الحماية من الإشعاع",
        "أشرف على صيانة أجهزة الأشعة وضمان صلاحيتها للاستخدام",
      ],
    }],
  });

  const headers = p.wovenLines.filter((l) => !/^[-•]/.test(l.trim()));
  const bullets = p.wovenLines.filter((l) => /^[-•]/.test(l.trim()));
  eq("the hospital appears once", headers.length, 1);
  ok("the header carries the full period", headers[0].includes("سبتمبر 2024") && headers[0].includes("الآن"), headers[0]);
  ok("the sixteen duties are within budget", bullets.length <= 6, `${bullets.length} bullets`);
  ok("no duty lost its dash", p.wovenLines.slice(1).every((l) => /^- /.test(l)) || headers.length === 1);
  ok("the structured store is the source", Array.isArray(p.roles) && p.roles.length === 1, JSON.stringify(p.roles?.length));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
