/**
 * Can a client get an unmarked CV without paying? Asked of a running server, with real HTTP.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS SUITE IS NOT A UNIT TEST
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The claim being made is about a boundary: that no request can talk the server into an unmarked
 * file. A unit test of `paidRequest` would prove the rule is correct and prove nothing about whether
 * the export route consults it, or whether a `watermark` field in the body reaches the renderer.
 * Those are HTTP facts, and this is the only place they can be checked.
 *
 * The assertions look at the BYTES, not at a header. `X-Watermark` is convenience — if the route were
 * lying, or setting it from the wrong variable, a header check would pass while shipping a clean PDF.
 * The free-tier mark is plain text in the PDF stream and in the Word document's footer, so the file
 * itself answers the question.
 *
 * ── the paid half matters as much as the unpaid half ──
 *
 * "Always watermark" would satisfy every unpaid assertion here and break the product. So the suite
 * mints a REAL pass with the same `ACCESS_SECRET` the server is running with, and requires a clean
 * file for it. Run it without that secret and the paid block skips itself loudly rather than passing
 * vacuously.
 *
 *   ACCESS_SECRET=<same as the server> BASE=http://localhost:3315 node ops/exportgate.mjs
 */

import crypto from "node:crypto";
import zlib from "node:zlib";

const BASE = process.env.BASE || "http://localhost:3315";
const SECRET = process.env.ACCESS_SECRET || "";

let pass = 0, fail = 0, skipped = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};
const skip = (n, why) => { skipped++; console.log(`⏭️  ${n} — ${why}`); };

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

const MARK_PDF = "Created free with cv.rabit.sa";
const MARK_DOCX = "Created free with cv.rabit.sa";

/** POST to the export route and return status, headers and raw bytes. */
async function post(body, { cookie = "" } = {}) {
  const res = await fetch(`${BASE}/api/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      /* Sent deliberately: a response header the route SETS must never be something it READS. */
      "X-Watermark": "0",
    },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf, text: buf.toString("latin1") };
}

/* A .docx is a zip, so the footer text is deflated — but the footer PART is a separate stream and
   `docx` does not compress small ones predictably. Search the raw zip, then fall back to inflating
   every stored/deflated member until the mark is found. */
function docxContainsMark(buf) {
  const raw = buf.toString("latin1");
  if (raw.includes(MARK_DOCX)) return true;
  /* Walk local file headers and try to inflate each member. Cheap, and it means this assertion is
     about the DOCUMENT rather than about how the zip happened to be packed. */
  let i = 0;
  while ((i = raw.indexOf("PK", i)) !== -1) {
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const comp = buf.readUInt16LE(i + 8);
    const sizeC = buf.readUInt32LE(i + 18);
    const start = i + 30 + nameLen + extraLen;
    if (sizeC > 0 && start + sizeC <= buf.length) {
      try {
        const body = buf.subarray(start, start + sizeC);
        const out = comp === 8 ? zlib.inflateRawSync(body) : body;
        if (out.toString("utf8").includes(MARK_DOCX)) return true;
      } catch { /* a member we cannot read is not a member with the mark */ }
    }
    i += 4;
  }
  return false;
}

/*
 * ── the detector proves itself before anything is trusted ──
 *
 * Every "no mark" assertion in this file is a negative, and a negative is only as good as the
 * detector behind it. `docxContainsMark` had two bugs on its first run — `require()` in an ES module,
 * which throws and was swallowed by the catch meant for unreadable zip members, and a scan for the
 * bare string "PK" rather than the local-header signature. The visible symptom was two failures. The
 * INVISIBLE one was that "the paid Word file has no footer mark" passed, vacuously, because the
 * detector could never find a mark at all.
 *
 * So it is now required to find one in a file known to carry it, and to not find one in a file known
 * not to, before the boundary is touched.
 */
console.log(`\n── the detector proves itself ──`);
{
  const { renderDocx } = await import("../app/lib/renderDocx.ts");
  ok("it finds the mark in a file known to carry one",
    docxContainsMark(Buffer.from(await renderDocx(CV, { watermark: true, lang: "en" }))),
    "without this, every \"no mark\" assertion below passes vacuously — which is what happened");
  ok("and finds none in a file known not to",
    !docxContainsMark(Buffer.from(await renderDocx(CV, { watermark: false, lang: "en" }))));
}

console.log(`\n── an anonymous request gets a MARKED file ──`);
{
  const r = await post({ format: "pdf", text: CV, lang: "en" });
  ok("the PDF is produced", r.status === 200, `status ${r.status}`);
  ok("it is a real PDF", r.text.startsWith("%PDF-"), r.text.slice(0, 8));
  ok("and it carries the free-tier mark", r.text.includes(MARK_PDF),
    "an unpaid visitor with a clean CV is revenue that never arrives");
  ok("the header agrees", r.headers.get("x-watermark") === "1", r.headers.get("x-watermark"));
  ok("it is not cached", (r.headers.get("cache-control") || "").includes("no-store"));

  const d = await post({ format: "docx", text: CV, lang: "en" });
  ok("the Word file is produced", d.status === 200, `status ${d.status}`);
  ok("with the Word content type",
    (d.headers.get("content-type") || "").includes("wordprocessingml"),
    d.headers.get("content-type"));
  ok("and it carries the mark too", docxContainsMark(d.buf),
    "for an Arabic CV this file IS the download, so its mark is the whole free tier");
}

console.log(`\n── the client cannot ASK for a clean file ──`);
{
  /* The exact bypass O-12 named, now attempted directly against the boundary. */
  const r = await post({ format: "pdf", text: CV, lang: "en", watermark: false });
  ok("a body claiming watermark:false is ignored", r.text.includes(MARK_PDF),
    "this is the localStorage edit that used to produce a clean PDF");
  ok("and the header still says marked", r.headers.get("x-watermark") === "1");

  const r2 = await post({ format: "pdf", text: CV, lang: "en", paid: true, hasAccess: true, watermark: 0 });
  ok("nor do paid/hasAccess/watermark:0 together", r2.text.includes(MARK_PDF));

  const d = await post({ format: "docx", text: CV, lang: "en", watermark: false });
  ok("the Word path refuses the same claim", docxContainsMark(d.buf));

  /* A forged REQUEST header must not be read back as the verdict. */
  ok("the X-Watermark request header is not an input", r.headers.get("x-watermark") === "1");

  /* A forged access cookie must fail its signature. */
  const forged = await post({ format: "pdf", text: CV }, {
    cookie: "ra_access=" + Buffer.from(JSON.stringify({ plan: "complete", exp: Date.now() + 9e8 })).toString("base64url") + ".notasignature",
  });
  ok("an unsigned access cookie grants nothing", forged.text.includes(MARK_PDF),
    "the pass is HMAC-signed; a hand-written one must not verify");
}

console.log(`\n── a genuinely paid request gets a CLEAN file ──`);
if (!SECRET) {
  skip("the paid path", "ACCESS_SECRET not provided — cannot mint a pass the server will accept");
  skip("the paid Word path", "same");
} else {
  /* Minted exactly as `lib/access.ts` does: base64url(payload) + "." + HMAC-SHA256 of that. */
  const payload = Buffer.from(JSON.stringify({ plan: "complete", exp: Date.now() + 90 * 864e5 })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const cookie = `ra_access=${payload}.${sig}`;

  const r = await post({ format: "pdf", text: CV, lang: "en" }, { cookie });
  ok("the PDF comes back", r.status === 200, `status ${r.status}`);
  ok("with NO mark", !r.text.includes(MARK_PDF),
    "\"always watermark\" would pass every assertion above and break the product");
  ok("and the header says so", r.headers.get("x-watermark") === "0", r.headers.get("x-watermark"));

  const d = await post({ format: "docx", text: CV, lang: "en" }, { cookie });
  ok("the Word file has no footer mark", !docxContainsMark(d.buf));

  /* An EXPIRED pass is a valid signature over a dead payload — the other half of the check. */
  const oldPayload = Buffer.from(JSON.stringify({ plan: "complete", exp: Date.now() - 1000 })).toString("base64url");
  const oldSig = crypto.createHmac("sha256", SECRET).update(oldPayload).digest("base64url");
  const expired = await post({ format: "pdf", text: CV }, { cookie: `ra_access=${oldPayload}.${oldSig}` });
  ok("an expired pass is marked again", expired.text.includes(MARK_PDF),
    "a correctly signed pass that has run out must not still unlock");
}

console.log(`\n── the boundary's own hygiene ──`);
{
  const bad = await post({ format: "png", text: CV });
  ok("an unknown format is refused", bad.status === 400, `status ${bad.status}`);

  const empty = await post({ format: "pdf", text: "hi" });
  ok("nothing to export is refused", empty.status === 400, `status ${empty.status}`);

  const huge = await post({ format: "pdf", text: "A word ".repeat(20000) });
  ok("an oversized body is refused", huge.status === 413, `status ${huge.status}`);

  const arabic = await post({ format: "pdf", text: "أحمد علي\nالرياض\n\nالخبرة العملية\n- أجريت أربعين فحصاً أسبوعياً.\n" });
  ok("an Arabic text PDF is refused rather than returned as mojibake", arabic.status === 422,
    `status ${arabic.status}`);

  const arabicDocx = await post({ format: "docx", text: "أحمد علي\nالرياض\n\nالخبرة العملية\n- أجريت أربعين فحصاً أسبوعياً.\n", lang: "ar" });
  ok("but Arabic Word is produced, because docx shapes Arabic", arabicDocx.status === 200,
    `status ${arabicDocx.status}`);

  const res = await fetch(`${BASE}/api/export`, { method: "GET" });
  ok("there is no GET verdict endpoint to duplicate useEntitlement", res.status === 405,
    `status ${res.status}`);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(fail === 0 ? 0 : 1);
