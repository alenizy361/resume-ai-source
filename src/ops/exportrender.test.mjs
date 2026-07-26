/**
 * The two renderers, and the one function that decides whether they stamp a mark.
 *
 * ── what this covers that `ops/exportgate.mjs` cannot ──
 *
 * `exportgate.mjs` asks a running server whether a client can talk it into a clean file. It is the
 * proof that matters, and it needs a server, so it is not in `npm test`. This file covers the two
 * halves underneath it in plain Node: the layout logic, which was previously unreachable behind a
 * click handler and a `doc.save()`, and `paidRequest`, which is now the single server-side answer to
 * "has this request paid".
 *
 * `paidRequest` is exercised against hand-built request objects rather than mocked cookies-as-strings,
 * because the thing worth locking down is the COMPOSITION of its three routes to access — a signed
 * pass, an account entitlement, and the entitlement cookie that may only ever speak for the address
 * actually signed in.
 *
 *   ACCESS_SECRET=... node --experimental-strip-types ops/exportrender.test.mjs
 */

/* Set before the module graph loads: `access.ts` reads the secret at import. A fixed value here keeps
   the signatures reproducible, and it is a test secret in a test process — never a deployed one. */
process.env.ACCESS_SECRET = process.env.ACCESS_SECRET || "test-secret-for-exportrender";
process.env.NODE_ENV = "test";

import zlib from "node:zlib";

const { renderPdf, pdfRefusesArabic } = await import("../app/lib/renderPdf.ts");
const { renderDocx } = await import("../app/lib/renderDocx.ts");
const { paidRequest } = await import("../app/lib/paidRequest.ts");
const { grantPass, grantEntPass, ACCESS_COOKIE, ENT_COOKIE } = await import("../app/lib/access.ts");
const { SESSION_COOKIE, createSession } = await import("../app/lib/session.ts");

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const CV = [
  "Ahmed Ali",
  "Riyadh, Saudi Arabia | ahmed@example.com | +966500000000",
  "",
  "PROFESSIONAL SUMMARY",
  "Radiology technologist with eight years of hospital experience across CT and MRI.",
  "",
  "WORK EXPERIENCE",
  "Senior Radiographer — King Faisal Hospital | 2019 - 2024",
  "- Performed 40 CT scans per week to protocol.",
  "",
  "SKILLS",
  "CT, MRI, PACS, Radiation safety",
].join("\n");

const MARK = "Created free with cv.rabit.sa";

/** Inflates each zip member, because a .docx footer lives in its own deflated stream. */
function docxHasMark(buf) {
  const raw = buf.toString("latin1");
  if (raw.includes(MARK)) return true;
  let i = 0;
  while ((i = raw.indexOf("PK", i)) !== -1) {
    const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28);
    const comp = buf.readUInt16LE(i + 8), sizeC = buf.readUInt32LE(i + 18);
    const start = i + 30 + nameLen + extraLen;
    if (sizeC > 0 && start + sizeC <= buf.length) {
      try {
        const body = buf.subarray(start, start + sizeC);
        const out = comp === 8 ? zlib.inflateRawSync(body) : body;
        if (out.toString("utf8").includes(MARK)) return true;
      } catch { /* an unreadable member is not a member with the mark */ }
    }
    i += 4;
  }
  return false;
}

/* ─────────── the renderers ─────────── */

console.log("\n── the PDF ──");
{
  const marked = Buffer.from(await renderPdf(CV, { watermark: true, lang: "en" }));
  const clean = Buffer.from(await renderPdf(CV, { watermark: false, lang: "en" }));

  ok("a real PDF comes out", marked.toString("latin1").startsWith("%PDF-"));
  ok("the free tier is stamped", marked.toString("latin1").includes(MARK));
  ok("and paying removes it", !clean.toString("latin1").includes(MARK));
  ok("the marked file is genuinely larger", marked.length > clean.length,
    `${marked.length} vs ${clean.length}`);
  /* The layout itself, which could not be tested at all while it lived in a click handler. */
  ok("the CV's own content is in there", marked.toString("latin1").includes("Radiograph")
    || marked.toString("latin1").includes("King Faisal"),
    "jsPDF writes text uncompressed by default, so the content is greppable");

  ok("Arabic is refused rather than rendered as mojibake", pdfRefusesArabic("أحمد علي"));
  ok("and English is not", !pdfRefusesArabic(CV));
  /* A mixed CV still cannot be rendered: helvetica has no Arabic glyphs whatever the majority. */
  ok("one Arabic word is enough to refuse", pdfRefusesArabic("Ahmed Ali أحمد"),
    "this is the one place a PRESENCE test is the right test, unlike `dominantScript`");
}

console.log("\n── the Word file ──");
{
  const marked = Buffer.from(await renderDocx(CV, { watermark: true, lang: "en" }));
  const clean = Buffer.from(await renderDocx(CV, { watermark: false, lang: "en" }));

  ok("a real zip comes out", marked.toString("latin1").startsWith("PK"));
  ok("the footer mark is present", docxHasMark(marked));
  ok("and absent when paid", !docxHasMark(clean));
  /* The detector must be able to say yes, or the line above passes vacuously — the exact trap
     `ops/exportgate.mjs` fell into on its first run. */
  ok("the marked and clean files genuinely differ", marked.length !== clean.length,
    `${marked.length} vs ${clean.length}`);

  const arabic = Buffer.from(await renderDocx("أحمد علي\nالرياض\n\nالخبرة العملية\n- أجريت أربعين فحصاً.\n", { watermark: true, lang: "ar" }));
  ok("Arabic Word is produced, because docx shapes Arabic", arabic.length > 1000);
}

/* ─────────── who has paid ─────────── */

/** A NextRequest-shaped stub: `paidRequest` only ever reads `req.cookies.get(name)?.value`. */
const reqWith = (jar) => ({
  cookies: { get: (name) => (name in jar ? { value: jar[name] } : undefined) },
});

console.log("\n── paidRequest ──");
{
  const now = Date.now();

  ok("no cookies is not paid", (await paidRequest(reqWith({}), now)).paid === false,
    "an unpaid visitor handed a clean CV is revenue that never arrives");

  const good = grantPass("complete", now);
  ok("a valid device pass is paid", (await paidRequest(reqWith({ [ACCESS_COOKIE]: good }), now)).paid === true);
  ok("and needs no account", (await paidRequest(reqWith({ [ACCESS_COOKIE]: good }), now)).signedIn === false,
    "checkout does not require signing in, so a pass has to work on its own");

  /* Tampering: the payload is readable base64url, so the signature is the only thing stopping edits. */
  const [body] = good.split(".");
  ok("a pass with a wrong signature is not paid",
    (await paidRequest(reqWith({ [ACCESS_COOKIE]: `${body}.notasignature` }), now)).paid === false);
  const forgedBody = Buffer.from(JSON.stringify({ plan: "complete", exp: now + 9e8 })).toString("base64url");
  ok("a hand-written payload is not paid",
    (await paidRequest(reqWith({ [ACCESS_COOKIE]: `${forgedBody}.${good.split(".")[1]}` }), now)).paid === false,
    "the signature covers the payload, so swapping one invalidates the other");

  ok("an expired pass is not paid",
    (await paidRequest(reqWith({ [ACCESS_COOKIE]: grantPass("single", now - 48 * 3600_000) }), now)).paid === false,
    "a correctly signed pass that has run out must not still unlock");

  /* The entitlement cookie, and the rule that makes it safe: it speaks only for the signed-in email. */
  const session = createSession("ahmed@example.com", now);
  const entForAhmed = grantEntPass("ahmed@example.com", now + 30 * 864e5);

  const mine = await paidRequest(reqWith({ [SESSION_COOKIE]: session, [ENT_COOKIE]: entForAhmed }), now);
  ok("the entitlement cookie unlocks its own account", mine.paid === true);
  ok("and reports the expiry", mine.until > now);
  ok("and the address", mine.email === "ahmed@example.com");

  const theirs = await paidRequest(reqWith({ [SESSION_COOKIE]: session, [ENT_COOKIE]: grantEntPass("badr@example.com", now + 30 * 864e5) }), now);
  ok("a valid entitlement cookie for ANOTHER account unlocks nothing", theirs.paid === false,
    "signed is not the same as mine — this is the check that stops a copied cookie");

  ok("signed in with no entitlement at all is not paid",
    (await paidRequest(reqWith({ [SESSION_COOKIE]: session }), now)).paid === false,
    "no store is configured in this process, so this is also the store-unavailable case: fails closed");

  /* A pass and a session together: either route alone is enough, so the pass still counts. */
  ok("a device pass still counts for a signed-in visitor",
    (await paidRequest(reqWith({ [SESSION_COOKIE]: session, [ACCESS_COOKIE]: good }), now)).paid === true);

  /* Garbage must not throw out of a function whose failure mode is a paywall decision. */
  for (const junk of ["", "....", "not.a.token", "%%%"]) {
    ok(`junk cookie ${JSON.stringify(junk)} answers unpaid rather than throwing`,
      (await paidRequest(reqWith({ [ACCESS_COOKIE]: junk, [ENT_COOKIE]: junk, [SESSION_COOKIE]: junk }), now)).paid === false);
  }
}

/* ─────────── the route reads none of it from the client ─────────── */

console.log("\n── the boundary, read from the source ──");
{
  const { readFileSync } = await import("node:fs");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const route = strip(readFileSync(new URL("../app/api/export/route.ts", import.meta.url), "utf8"));

  ok("the route never reads a watermark field from the body", !/body\.watermark/.test(route),
    "the entire point: the client may send the text, never the entitlement");
  ok("it decides from paidRequest", /paidRequest\(req\)/.test(route));
  ok("and the mark is the negation of that", /const watermark = !paid\.paid/.test(route));

  /* And the buttons must not have kept a prop that could reintroduce it. */
  for (const f of ["app/components/PdfExport.tsx", "app/components/DocxExport.tsx"]) {
    const src = strip(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
    ok(`${f.split("/").pop()} takes no watermark prop`, !/watermark\?:\s*boolean/.test(src),
      "it used to, and on /optimize the value came from a rehydrated localStorage result");
    ok(`${f.split("/").pop()} fetches from the export route`, /\/api\/export/.test(src));
    ok(`${f.split("/").pop()}'s offline fallback always marks`, /watermark: true/.test(src),
      "a fallback that guessed generously would be the hole again");
    ok(`${f.split("/").pop()} never passes watermark: false`, !/watermark: false/.test(src));
  }

  /* No page may pass a watermark prop to these two any more. */
  const pages = ["app/(en)/optimize/page.tsx", "app/(ar)/ar/optimize/page.tsx", "app/components/build/DesignSection.tsx"];
  for (const f of pages) {
    const src = strip(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
    const bad = /<(PdfExport|DocxExport)[^>]*watermark=/s.test(src);
    ok(`${f.split("/").pop()} passes no watermark to the file exports`, !bad);
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
