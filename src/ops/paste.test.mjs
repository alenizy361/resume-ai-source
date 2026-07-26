/**
 * The unreadable-file escape hatch, driven in a real browser.
 *
 * ── the defect this covers ──
 *
 * `/api/extract` answers 400 rather than 500 on a file it cannot read, and its own comment says why:
 * "so the UI can show a 'paste the text instead' hint". The hint shipped and the box did not — and
 * the hint named the JOB DESCRIPTION field, so a user who followed it would have pasted their own CV
 * in as the advert they were applying to, and had the tailoring computed against themselves.
 *
 * A phone photo or a scan of a CV is the common case in this market rather than an edge one, and it
 * is the single case an upload cannot rescue. So the paste path has to work, in both languages, on
 * Arabic text — and it has to reach the SAME review screen as the upload, or one of them will drift.
 *
 * ── why a browser and not a unit test ──
 *
 * `ops/importcv.test.mjs` already asserts `parseCv` on strings, and asserts structurally that both
 * entries funnel through one `ingest()`. Neither can tell you the button is reachable, that the box
 * appears, or that the review screen renders what was parsed. This drives it.
 *
 *   node ops/paste.test.mjs [baseUrl]
 */

import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3141";
const b = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
let pass=0, fail=0;
const ok=(n,c,d="")=>{ if(c){pass++;console.log(`✅ ${n}`);} else {fail++;console.log(`❌ ${n}${d?` — ${d}`:""}`);} };

/* A real Arabic CV, because the parser has to cope with the script the market writes in — and
   because a Latin fixture would have passed while Arabic failed. */
const CV = `أحمد عبدالله السالم
ahmed.salem@example.com | 0551234567 | الرياض، السعودية

الخبرة العملية
فني أشعة تشخيصية — مستشفى الملك فهد، الرياض
٢٠١٩ — الآن
نفّذت فحوصات الأشعة المقطعية والعامة وفق البروتوكولات المعتمدة
راجعت جودة الصور قبل إرسالها إلى نظام PACS

التعليم
بكالوريوس علوم الأشعة — جامعة الملك سعود، ٢٠١٨

المهارات
التصوير المقطعي، الرنين المغناطيسي، PACS، سلامة الأشعة
`;

for (const [label, path] of [["ar", "/ar/builder"], ["en", "/builder"]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(600);

  /* The import panel lives behind the third entry card. */
  const card = page.locator("button", { hasText: /Upload and improve|ارفع سيرتي وحسّنها/ }).first();
  if (await card.count()) { await card.click(); await page.waitForTimeout(400); }
  else {
    const any = page.locator("text=/اختر ملفاً|Choose a file/").first();
    if (!await any.count()) console.log("   (import panel not reachable)");
  }

  const opener = page.locator("button", { hasText: /Paste the text instead|الصق النص بدلاً من الملف/ }).first();
  ok(`${label}: the paste opener is offered`, await opener.count() > 0);
  if (!await opener.count()) { await ctx.close(); continue; }
  await opener.click();
  await page.waitForTimeout(200);

  const box = page.locator("#cv-paste");
  ok(`${label}: the paste box appears`, await box.count() === 1);
  ok(`${label}: it lets the text decide direction`, await box.getAttribute("dir") === "auto");

  /* too short must be refused */
  await box.fill("قصير");
  await page.locator("button", { hasText: /Read this text|اقرأ هذا النص/ }).first().click();
  await page.waitForTimeout(300);
  const short = await page.locator("p", { hasText: /too short|أقصر/ }).count();
  ok(`${label}: a stub is refused`, short > 0);

  /* the real thing */
  await box.fill(CV);
  await page.locator("button", { hasText: /Read this text|اقرأ هذا النص/ }).first().click();
  await page.waitForTimeout(600);

  const review = await page.locator("text=/Here is what we read|هذا ما قرأناه/").count();
  ok(`${label}: the review screen appears from a paste`, review > 0);
  const body = await page.locator("body").innerText();
  ok(`${label}: it read the employer`, /الملك فهد/.test(body), body.slice(0, 120));
  ok(`${label}: it read a skill`, /PACS/.test(body));
  ok(`${label}: no network error surfaced`, !/Failed to read|لم نستطع/.test(body));

  await ctx.close();
}
await b.close();
console.log(`\n${fail===0?"ALL PASS":"FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
