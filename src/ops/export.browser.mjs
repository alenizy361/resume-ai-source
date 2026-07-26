/**
 * The download buttons, clicked. Does the file that reaches the user's disk carry the mark?
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS ALONGSIDE THE OTHER TWO SUITES
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 *   `ops/exportrender.test.mjs`  the renderers and `paidRequest`, in plain Node
 *   `ops/exportgate.mjs`         the HTTP boundary: can a request talk the server into a clean file
 *   this file                    the BUTTON: does clicking it actually go through that boundary
 *
 * The third is not redundant. Moving the render server-side rewrote both export components, and the
 * failure mode of that rewrite is silent: a button that throws before its fetch, or falls into its
 * local fallback on every click, still downloads a file — a watermarked one — and looks fine. Only a
 * browser can tell "the server stamped this" from "the offline fallback stamped this", and the
 * difference is whether a paying customer gets what they paid for.
 *
 * So the requests to `/api/export` are counted, and the downloaded bytes are read off disk.
 *
 *   BASE=http://localhost:3317 node ops/export.browser.mjs
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const BASE = process.env.BASE || "http://localhost:3317";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const MARK = "Created free with cv.rabit.sa";

const CV = [
  "Ahmed Ali", "Riyadh | ahmed@example.com", "", "PROFESSIONAL SUMMARY",
  "Radiology technologist with eight years across CT and MRI.", "", "WORK EXPERIENCE",
  "Senior Radiographer — King Faisal Hospital | 2019 - 2024",
  "- Performed 40 CT scans per week to protocol.", "", "SKILLS", "CT, MRI, PACS",
].join("\n");

const OPTIMIZE_REPLY = JSON.stringify({
  matchScore: 62, afterScore: 88, matchSummary: "ok",
  optimizedResume: CV,
  missingKeywords: [], presentKeywords: [], skillsGap: [], improvements: [],
  /*
   * The server's own verdict, and deliberately the GENEROUS one.
   *
   * `watermark: false` is what an edited localStorage result used to look like. Under the old design
   * the buttons believed it and produced clean files. Under the new one it changes nothing about the
   * bytes, because the bytes come from the export route — so this field being a lie is exactly what
   * the assertions below are checking survives.
   */
  watermark: false,
});

function docxHasMark(buf) {
  const raw = buf.toString("latin1");
  if (raw.includes(MARK)) return true;
  let i = 0;
  while ((i = raw.indexOf("PK\x03\x04", i)) !== -1) {
    const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28);
    const comp = buf.readUInt16LE(i + 8), sizeC = buf.readUInt32LE(i + 18);
    const start = i + 30 + nameLen + extraLen;
    if (sizeC > 0 && start + sizeC <= buf.length) {
      try {
        const body = buf.subarray(start, start + sizeC);
        const out = comp === 8 ? zlib.inflateRawSync(body) : body;
        if (out.toString("utf8").includes(MARK)) return true;
      } catch { /* unreadable member */ }
    }
    i += 4;
  }
  return false;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

/** Reach /optimize's result screen with a stubbed analysis, counting export calls. */
async function resultScreen(page) {
  const exportCalls = [];
  await page.route("**/api/optimize", (r) => r.fulfill({
    status: 200, headers: { "content-type": "application/x-ndjson" },
    body: `{"t":"think","d":"…"}\n{"t":"result","d":${OPTIMIZE_REPLY}}\n`,
  }));
  /* Observed, not stubbed: the real route has to run, or this proves nothing about enforcement. */
  page.on("request", (r) => { if (r.url().includes("/api/export")) exportCalls.push(r.method()); });

  await page.goto(`${BASE}/optimize`, { waitUntil: "load" });
  await page.waitForTimeout(1600);
  await page.locator("textarea").first().fill(CV);
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Continue")').first().click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Continue")').first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Analyze")').first().click();
  await page.waitForTimeout(2500);
  return exportCalls;
}

/* ── 1. the free download, clicked ─────────────────────────────────────────────────── */

console.log("\n── clicking Download PDF as a free visitor ──");
{
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`   PAGE ERROR: ${String(e).slice(0, 200)}`));
  const calls = await resultScreen(page);

  const btn = page.locator('button:has-text("Download PDF")');
  ok("the button is on the result screen", (await btn.count()) === 1, String(await btn.count()));

  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    btn.first().click(),
  ]);
  const file = await dl.path();
  ok("a file was downloaded", Boolean(file), String(file));
  ok("named as a PDF", dl.suggestedFilename().endsWith(".pdf"), dl.suggestedFilename());

  const bytes = readFileSync(file);
  ok("it is a real PDF", bytes.toString("latin1").startsWith("%PDF-"));
  ok("and it carries the mark", bytes.toString("latin1").includes(MARK),
    "the stubbed result said watermark:false — the bytes must not have believed it");
  ok("the export route was actually called", calls.length >= 1, JSON.stringify(calls));
  ok("by POST", calls.includes("POST"), JSON.stringify(calls));

  /* Word too, on the same screen. */
  const [dl2] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.locator('button:has-text("Word")').first().click(),
  ]);
  const wordBytes = readFileSync(await dl2.path());
  ok("the Word file downloads", wordBytes.length > 1000, String(wordBytes.length));
  ok("it is a zip", wordBytes.toString("latin1").startsWith("PK"));
  ok("and carries the footer mark", docxHasMark(wordBytes));
  await ctx.close();
}

/* ── 2. the same page with an edited result: the old bypass, attempted for real ─────── */

console.log("\n── editing the stored result, which used to be the whole bypass ──");
{
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await resultScreen(page);

  /*
   * The bypass, performed exactly as a user could: rewrite the persisted result so every client-side
   * reader concludes "paid", then reload so the page rehydrates from it, then download.
   */
  const edited = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("ra_optimize_result"));
    if (!key) return "no result key";
    const v = JSON.parse(localStorage.getItem(key));
    v.watermark = false;
    v.locked = false;
    localStorage.setItem(key, JSON.stringify(v));
    return key;
  });
  ok("the stored result was found and edited", !String(edited).startsWith("no "), String(edited));

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);

  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.locator('button:has-text("Download PDF")').first().click(),
  ]);
  const bytes = readFileSync(await dl.path());
  ok("the downloaded PDF is STILL marked", bytes.toString("latin1").includes(MARK),
    "this is the O-12 bypass: one edited boolean used to yield a clean paid-quality file");
  await ctx.close();
}

/* ── 3. a genuinely paid visitor gets a clean file, through the button ──────────────── */

console.log("\n── a real pass, through the UI ──");
if (!process.env.ACCESS_SECRET) {
  console.log("⏭️  skipped — ACCESS_SECRET not provided, so no pass can be minted that the server accepts");
} else {
  const crypto = await import("node:crypto");
  const payload = Buffer.from(JSON.stringify({ plan: "complete", exp: Date.now() + 90 * 864e5 })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.ACCESS_SECRET).update(payload).digest("base64url");

  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{
    name: "ra_access", value: `${payload}.${sig}`,
    domain: new URL(BASE).hostname, path: "/", httpOnly: false, secure: false,
  }]);
  const page = await ctx.newPage();
  await resultScreen(page);

  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.locator('button:has-text("Download PDF")').first().click(),
  ]);
  const bytes = readFileSync(await dl.path());
  ok("the paid PDF has no mark", !bytes.toString("latin1").includes(MARK),
    "\"always watermark\" would satisfy every assertion above and break the product");

  const [dl2] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.locator('button:has-text("Word")').first().click(),
  ]);
  ok("and the paid Word file has none either", !docxHasMark(readFileSync(await dl2.path())));
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
