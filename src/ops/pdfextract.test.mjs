/**
 * A real PDF, through the real library, into the real parser.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE BUG THIS SUITE EXISTS BECAUSE OF
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `/api/extract` called unpdf with `mergePages: true`. That branch of unpdf is:
 *
 *     text: mergePages ? texts.join("\n").replace(/\s+/g, " ") : texts
 *
 * `\s` includes `\n`, so the entire PDF came back as ONE LINE. `parseCv` is line-based from
 * top to bottom — it splits on `\n`, and `headingFor` rejects any line over 48 characters —
 * so it found nothing, `worthImporting` returned false, and the panel told the user their
 * file "may be a scan or a photo rather than text" and offered to spend their money on OCR.
 *
 * Every text PDF. Every language. Every time.
 *
 * ── why the existing tests all passed ──
 *
 * Three suites cover this area and not one of them could have caught it:
 *
 *   · `ops/importcv.test.mjs` tests `parseCv` against hand-written multi-line fixtures. It
 *     never calls the extractor, so it never sees flattened input.
 *   · `ops/form-smoke.mjs` STUBS `/api/extract`, and the stub returns `lines.join("\n")` —
 *     the end-to-end test mocked away the exact thing that was broken.
 *   · `/optimize` uses the same route and pours the text into a `<textarea>`, where
 *     whitespace does not matter. So the one place it was visibly wrong was the one place
 *     nobody was looking.
 *
 * The gap was structural: every test operated on either side of the seam, and the bug lived
 * in the seam. So this suite builds an actual PDF with jspdf — already a dependency, used by
 * the product's own export — runs it through the actual `unpdf`, and asserts on what comes
 * out. No mocks anywhere in the chain.
 *
 *   node ops/pdfextract.test.mjs
 */

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const { jsPDF } = await import("jspdf");
const { extractText, getDocumentProxy } = await import("unpdf");
const { parseCv, worthImporting, normalizeForParsing } = await import("../app/lib/importCv.ts");

/** A CV with the shape a real one has: headings, a dated role, bullets, a skills line. */
const CV_LINES = [
  "Abdulaziz Alanazi",
  "abdulaziz@example.com | 0581453234 | Riyadh",
  "",
  "EXPERIENCE",
  "Radiographer, Dallah Hospital | Sep 2024 - Present",
  "Performed CT and MRI examinations",
  "Maintained radiation safety standards",
  "Senior Technician, King Fahad Hospital | Jan 2020 - Aug 2024",
  "Supervised a team of four technicians",
  "",
  "EDUCATION",
  "BSc Radiologic Technology, King Saud University | 2016 - 2020",
  "",
  "SKILLS",
  "CT, MRI, Ultrasound, PACS, Radiation Safety",
];

function buildPdf(lines) {
  const doc = new jsPDF();
  let y = 20;
  for (const line of lines) {
    if (line) doc.text(line, 15, y);
    y += 8;
  }
  return Buffer.from(doc.output("arraybuffer"));
}

async function extract(buf, mergePages) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text: t } = await extractText(pdf, { mergePages });
  return Array.isArray(t) ? t.join("\n") : t;
}

/* ─────────── 1. the regression itself ─────────── */

console.log("\n── a text PDF survives extraction with its lines intact ──");

const buf = buildPdf(CV_LINES);
const text = await extract(buf, false);

ok("the PDF yields text", text.length > 100, `${text.length} chars`);
/*
 * The single assertion that would have caught the bug. Everything else here is downstream of
 * it — with no newlines, nothing below can pass, and with them, everything does.
 */
ok("and the text has line breaks", text.includes("\n"),
  `newlines: ${(text.match(/\n/g) || []).length}`);
ok("with roughly one line per line written",
  (text.match(/\n/g) || []).length >= 8, String((text.match(/\n/g) || []).length));

const cv = parseCv(text);
ok("the parser finds the roles", cv.roles.length >= 2, `roles: ${cv.roles.length}`);
ok("and the skills", cv.skills.length >= 3, `skills: ${cv.skills.length}`);
ok("and the education", cv.education.length >= 1, `education: ${cv.education.length}`);
ok("and the contact details", Boolean(cv.email) && Boolean(cv.phone), `${cv.email} / ${cv.phone}`);
ok("so the import is accepted", worthImporting(cv) === true);

/* ─────────── 2. the failing configuration, pinned ─────────── */

console.log("\n── and the flag that broke it is proven to break it ──");

/*
 * Asserted rather than merely fixed. `mergePages: true` reads like the obviously right choice
 * for "one document, one string" — it is the option somebody will reach for again. This makes
 * the consequence a fact in the repository instead of a sentence in a comment.
 */
const merged = await extract(buf, true);
ok("mergePages:true really does destroy every line break", !merged.includes("\n"));
ok("and the same content then parses to nothing",
  worthImporting(parseCv(merged)) === false,
  JSON.stringify({ roles: parseCv(merged).roles.length, skills: parseCv(merged).skills.length }));
ok("which is why the route must not use it",
  !/mergePages:\s*true/.test(
    (await import("node:fs")).readFileSync("app/api/extract/route.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, ""),
  ));

/* ─────────── 3. the guard in the route ─────────── */

console.log("\n── the route notices if this ever happens again ──");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/api/extract/route.ts", "utf8");
  ok("a long body with no line breaks is logged, not swallowed",
    /text\.length > 200 && !text\.includes\("\\n"\)/.test(src));
}

/* ─────────── 4. Arabic ─────────── */

console.log("\n── Arabic dates and headings ──");

/*
 * Not tested through a PDF: jspdf's default fonts cannot shape Arabic, so a generated Arabic
 * PDF would prove something about jspdf rather than about the parser. The extraction half is
 * language-agnostic — it is the same `mergePages` path either way — so what is worth asserting
 * here is the parsing half, directly.
 */
{
  ok("Arabic-Indic digits become ASCII", normalizeForParsing("سبتمبر ٢٠٢٤").includes("2024"));
  ok("and the extended set too", normalizeForParsing("۲۰۲۴").includes("2024"));
  ok("Latin digits are untouched", normalizeForParsing("2024") === "2024");

  const arabic = [
    "عبدالعزيز العنزي",
    "abdulaziz@example.com | 0581453234",
    "",
    "الخبرات الوظيفية",
    "أخصائي أشعة, مستشفى دلة | سبتمبر ٢٠٢٤ - حتى الآن",
    "إجراء فحوصات الأشعة المقطعية",
    "الحفاظ على معايير السلامة الإشعاعية",
    "",
    "المؤهل الدراسي",
    "بكالوريوس تقنية الأشعة, جامعة الملك سعود | 1441 - 1445هـ",
    "",
    "المهارات",
    "الأشعة المقطعية, الرنين المغناطيسي, السلامة الإشعاعية",
  ].join("\n");

  const ar = parseCv(arabic);
  /* Each of these headings was measured leaking into `unread`, losing its whole section. */
  ok("«الخبرات الوظيفية» is recognised as experience", ar.roles.length >= 1, `roles: ${ar.roles.length}`);
  ok("«المؤهل الدراسي» is recognised as education", ar.education.length >= 1, `education: ${ar.education.length}`);
  ok("the skills line is read", ar.skills.length >= 2, `skills: ${ar.skills.length}`);
  ok("an Arabic-Indic date is detected", Boolean(ar.roles[0]?.start), JSON.stringify(ar.roles[0] || {}));
  ok("and the Arabic CV is accepted", worthImporting(ar) === true);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
