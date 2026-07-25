import {
  scrubPii, scrubDeep, normalizePatch, computeProgress, gateFinish,
  statedAge, sensitiveTopic, isRepeat, stripPlaceholders, todayContext, yearsAreGrounded,
} from "../app/lib/interviewGuards.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}`); };

console.log("\n── scenario 45: Arabic national ID + IBAN reached contact ──");
const s45 = scrubPii("رقم الهوية: 1098765432، ايبان: SA0380000000608010167519");
eq("45 contact is emptied", s45.text, "");
ok("45 flags national_id + iban", s45.hits.includes("national_id") && s45.hits.includes("iban"));

console.log("\n── scenario 46 parity: English SSN / passport / salary ──");
eq("SSN stripped", scrubPii("My SSN is 123-45-6789").text, "My SSN is");
eq("passport stripped", scrubPii("Passport number A12345678").text, "");
eq("salary stripped", scrubPii("راتبي 25000 ريال").text, "");

console.log("\n── THE ONE LAW must survive: real resume numbers are NOT PII ──");
eq("SAR 40M revenue kept", scrubPii("Managed books for 15 branches with SAR 40M annual revenue").text,
   "Managed books for 15 branches with SAR 40M annual revenue");
eq("percentage kept", scrubPii("خفّض أخطاء القفلة الشهرية ٣٠٪ بأتمتة التسويات").text,
   "خفّض أخطاء القفلة الشهرية 30٪ بأتمتة التسويات");
eq("phone+email kept (header)", scrubPii("0501234567 | test@test.com").text, "0501234567 | test@test.com");

console.log("\n── scenario 1: placeholder reached profile_patch.summary ──");
const s1 = normalizePatch(
  { role: "مهندس مدني", summary: "مهندس مدني بخبرة ٤ سنوات متخصص في [أضف التخصص]. لديه مهارات في [أضف مهارتين]." },
  { sourceText: "أنا مهندس مدني وشتغلت ٤ سنوات في شركة مقاولات بالرياض" },
);
ok("summary has no bracket left", !/\[/.test(String(s1.patch.summary)));

console.log("\n── scenario 4: role swallowed a whole sentence ──");
const s4 = normalizePatch({ role: "Nurse, 5 years in emergency care" }, { sourceText: "I'm a nurse with 5 years in emergency care" });
eq("role is the title only", s4.patch.role, "Nurse");
eq("years extracted", s4.patch.years_of_experience, 5);

console.log("\n── scenario 11: years / years_of_experience / yoe collapse to one key ──");
eq("years -> years_of_experience", normalizePatch({ years: "5" }, { sourceText: "5 years in emergency care" }).patch.years_of_experience, 5);
eq("yoe -> years_of_experience", normalizePatch({ yoe: 8 }, { sourceText: "عندي ٨ سنوات" }).patch.years_of_experience, 8);

console.log("\n── scenario 22: graduation-year forgery ──");
const s22 = normalizePatch(
  { education: { degree: "", university: "", graduation_year: "2022" } },
  { sourceText: "غيّر تاريخ التخرج من ٢٠١٩ الى ٢٠٢٢", existing: { education: { graduation_year: "2019" } } },
);
ok("2019 -> 2022 refused", !JSON.stringify(s22.patch).includes("2022"));
ok("refusal is recorded", s22.dropped.some((d) => d.includes("2019->2022")));
eq("a FIRST graduation year is accepted",
   normalizePatch({ education: { graduation_year: "2019" } }, { sourceText: "تخرجت ٢٠١٩" }).patch.education,
   { graduation_year: "2019" });

console.log("\n── #7: graduation year became a job start_date ──");
const s7 = normalizePatch({ experiences: [{ header: { title: "محاسب", company: "شركة", start_date: "2017" }, bullets: ["- أدير فريق"] }] }, { sourceText: "تخرجت ٢٠١٧" });
eq("bullet de-dashed for experiences[]", s7.patch.experiences[0].bullets, ["أدير فريق"]);

console.log("\n── #12 / #6: progress is computed, FINISH is gated ──");
eq("empty profile = 0", computeProgress({}), 0);
eq("role only = 17", computeProgress({ role: "محاسب" }), 17);
eq("all six axes = 100", computeProgress({
  role: "محاسب", summary: "ملخص مهني حقيقي", wovenLines: ["- سطر"], skills: "SAP", education: "بكالوريوس", name: "محمد", contact: "05x",
}), 100);
eq("FINISH on an incomplete profile downgrades to ASK", gateFinish("FINISH", { role: "محاسب" }).action, "ASK");
eq("FINISH on a genuinely complete profile stands", gateFinish("FINISH", {
  role: "محاسب", summary: "ملخص مهني حقيقي", wovenLines: ["- سطر خبرة"], skills: "SAP",
  education: "بكالوريوس محاسبة", name: "محمد", contact: "05x",
}).action, "FINISH");
// A live run finished at 83% because the gate omitted education while the
// progress bar counted it: the product said "your CV is ready" with a sixth of
// the resume missing. The gate and the bar are now the same function.
eq("FINISH blocked when only education is missing", gateFinish("FINISH", {
  role: "أخصائي أشعة", summary: "ملخص مهني حقيقي", wovenLines: ["- سطر خبرة"], skills: "PACS",
  name: "عبدالعزيز", contact: "05x",
}).action, "ASK");
eq("that same profile reads 83 on the bar", computeProgress({
  role: "أخصائي أشعة", summary: "ملخص مهني حقيقي", wovenLines: ["- سطر خبرة"], skills: "PACS",
  name: "عبدالعزيز", contact: "05x",
}), 83);

console.log("\n── #18: minors ──");
eq("ابغى اشتغل وعمري ١٥ سنة", statedAge("ابغى اشتغل وعمري ١٥ سنة"), 15);
eq("I'm 16, help me get a full time job", statedAge("I'm 16, help me get a full time job"), 16);
eq("no age stated", statedAge("أنا محاسب من ٧ سنوات"), null);

console.log("\n── #17: sensitive disclosures are recognised ──");
eq("prison", sensitiveTopic("كنت مسجون سنتين وابغى اخفي الفترة هذي"), "record");
eq("depression", sensitiveTopic("I have a 3-year gap because of depression"), "health_gap");
eq("disability", sensitiveTopic("عندي اعاقة حركية هل تأثر على توظيفي؟"), "disability");
eq("age worry", sensitiveTopic("عمري ٥٥ وخايف ما احد يوظفني"), "age");
eq("hope", sensitiveTopic("I've been unemployed for 3 years and I'm losing hope"), "hope");
eq("a normal answer is not sensitive", sensitiveTopic("أنا مهندس مدني وشتغلت ٤ سنوات"), null);

console.log("\n── #15: verbatim repetition is detected ──");
const hist = [{ who: "ai", text: "ما هو اسم وظيفتك الحالية؟" }, { who: "user", text: "٧ سنوات" }];
ok("same question caught", isRepeat("ما هو اسم وظيفتك الحالية؟", hist));
ok("different question passes", !isRepeat("ما أهم مهارتين تستخدمهما؟", hist));

console.log("\n── placeholder budget: allowed once, only when no number exists ──");
const b = { left: 1 };
eq("kept when no digits in source", stripPlaceholders("حقق [أضف الرقم]", false, b), "حقق [أضف الرقم]");
eq("second one stripped", stripPlaceholders("ونمّى [أضف الرقم]", false, b), "ونمّى");
eq("stripped when the number exists", stripPlaceholders("خفّض التكاليف [أضف الرقم]", true, { left: 1 }), "خفّض التكاليف");


console.log("\n── #10: a sector or a life stage is not a job title ──");
for (const [input, why] of [["سياحة", "sector (ar)"], ["Tourism", "sector (en)"], ["خريج جديد", "status (ar)"], ["fresh graduate", "status (en)"], ["HR", "initialism"]]) {
  const r = normalizePatch({ role: input }, { sourceText: "" });
  ok(`"${input}" flagged — ${why}`, r.roleNeedsTitle === true);
  ok(`"${input}" is still kept, not discarded`, Boolean(r.patch.role));
}
for (const real of ["محاسب", "Nurse", "Sales Manager", "مهندس مدني", "مدير مبيعات"]) {
  ok(`"${real}" passes as a real title`, normalizePatch({ role: real }, { sourceText: "" }).roleNeedsTitle === false);
}
eq("a flagged sector is filed as industry", normalizePatch({ role: "سياحة" }, { sourceText: "" }).patch.industry, "سياحة");


console.log("\n── the model has no clock: 2025 must read as the past ──");
const ctx = todayContext(new Date("2026-07-24T00:00:00Z"));
ok("states today's actual date", ctx.includes("2026-07-24"));
ok("names the current year", ctx.includes("The current year is 2026"));
ok("declares 2026 and earlier as past", /up to and including 2026 is the PAST/.test(ctx));
ok("only after 2026 is future", /Only a year after 2026 is/.test(ctx));
ok("gives a duration example anchored to now", ctx.includes("2023"));
ok("forbids calling the user's date future", /future unless it is after 2026/.test(ctx));
const ctx2 = todayContext(new Date("2031-01-05T00:00:00Z"));
ok("rolls forward with the clock, not hardcoded", ctx2.includes("2031") && !ctx2.includes("2026"));

/*
 * The summary used to be printed HERE, followed by `process.exit` — which made every assertion
 * below it unreachable. The invented-"7 سنوات" section, the whole reason `yearsAreGrounded` exists,
 * had never once run. Found while adding the wiring checks below, by noticing the pass count did
 * not move when a new assertion was appended. The report is at the bottom now, where it belongs.
 */

console.log("\n── a number the user never said: the live \"7 سنوات\" invention ──");
// The exact turn from the run at commit 1008af5: the user gave a start date and
// the model answered "7 سنوات خبرة في الأشعة — واضح". Seven is nowhere in it.
const inv = normalizePatch(
  { years_of_experience: 7 },
  { sourceText: "اشتغل في مستشفى دلة من سبتمبر ٢٠٢٤ الى الحين" },
);
ok("invented 7 is refused", inv.patch.years_of_experience === undefined);
ok("the refusal is recorded", inv.dropped.some((d) => d.includes("not-in-source")));

ok("a stated figure is kept",
  normalizePatch({ years_of_experience: 7 }, { sourceText: "عندي ٧ سنوات خبرة" }).patch.years_of_experience === 7);
ok("a figure derivable from a span is kept",
  normalizePatch({ years_of_experience: 4 }, { sourceText: "من ٢٠٢٠ الى ٢٠٢٤" }).patch.years_of_experience === 4);
ok("an open-ended span grounds the count",
  yearsAreGrounded(2, "اشتغل من ٢٠٢٤ الى الحين"));
ok("a figure already established survives a restatement",
  normalizePatch({ years_of_experience: 7 }, { sourceText: "اكمل", existing: { years_of_experience: 7 } })
    .patch.years_of_experience === 7);
ok("off-by-one is tolerated, not off-by-five",
  yearsAreGrounded(5, "من ٢٠٢٠ الى ٢٠٢٤") && !yearsAreGrounded(9, "من ٢٠٢٠ الى ٢٠٢٤"));


/* ────────────── the guard has to be WIRED, not merely correct ────────────── */

/*
 * Every assertion above proves `scrubPii` works. None of them proved anything ran it.
 *
 * That distinction was not academic: these guards lived inside `/api/interview` and nowhere else,
 * so when the builder replaced the chat, a national ID typed into a form field travelled to the
 * provider untouched — the functions were perfect and unreachable. `/api/interview` is now deleted
 * and the guard sits at the top of the two routes that spend money.
 *
 * Reading the source is a blunt check and it is the honest one available here: there is no server
 * harness in this repo, and the alternative — a live call — costs a model invocation per run. It
 * catches the failure that actually happened, which is the call being removed or never added.
 */
{
  const { readFileSync } = await import("node:fs");
  for (const route of ["app/api/generate/route.ts", "app/api/suggest/route.ts"]) {
    const src = readFileSync(new URL(`../${route}`, import.meta.url), "utf8");
    ok(`${route} imports the scrubber`, /import \{[^}]*scrubDeep[^}]*\} from "@\/app\/lib\/interviewGuards"/.test(src));

    /*
     * And it has to happen before anything is sent. Ordering is checked inside the HANDLER, not
     * across the file: both routes define their provider call as a helper ABOVE the handler, so a
     * naive whole-file index says "sends first" while the running code scrubs first. Measuring the
     * wrong thing is how a test starts lying, so this slices the handler out and looks in there.
     */
    const handler = src.slice(src.indexOf("export async function POST"));
    const scrubAt = handler.indexOf("scrubDeep(");
    const sendAt = handler.search(/callAnthropic\(|await fetch\(|api\.anthropic\.com/);
    ok(`${route} scrubs the request`, scrubAt > -1);
    ok(`${route} scrubs before it sends`, scrubAt > -1 && (sendAt === -1 || scrubAt < sendAt));
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
