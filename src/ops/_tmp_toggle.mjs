// Language-toggle behaviour on the four shared (?lang=ar) routes + arabic header CTAs.
import { chromium } from "playwright-core";
const O = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function txt(page, sel) {
  try { return ((await page.locator(sel).first().textContent({ timeout: 3000 })) || "").replace(/\s+/g, " ").trim().slice(0, 70); } catch { return ""; }
}
function isAr(s) { return /[؀-ۿ]/.test(s); }

// PART 1 — arrive at /ar/<route> (the in-product link), then click the header EN toggle.
for (const entry of ["/ar/interview", "/ar/linkedin", "/ar/career-plan", "/ar/interview-live"]) {
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const rec = { entry };
  try {
    await page.goto(O + entry, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);
    rec.landedUrl = page.url().replace(O, "");
    rec.lang = await page.evaluate(() => document.documentElement.lang);
    rec.h1 = await txt(page, "h1");
    rec.h1IsArabic = isAr(rec.h1);
    rec.ls = await page.evaluate(() => { try { return localStorage.getItem("ra_lang"); } catch { return "x"; } });
    const tog = page.locator("header a").filter({ hasText: /^EN$/ }).first();
    rec.hasEnToggle = (await tog.count()) > 0;
    if (rec.hasEnToggle) {
      rec.toggleHref = await tog.getAttribute("href");
      await tog.click();
      await page.waitForTimeout(2000);
      rec.afterUrl = page.url().replace(O, "");
      rec.afterLang = await page.evaluate(() => document.documentElement.lang);
      rec.afterDir = await page.evaluate(() => document.documentElement.dir);
      rec.afterH1 = await txt(page, "h1");
      rec.afterH1IsArabic = isAr(rec.afterH1);
      // reload the same URL in the same profile — does it stay arabic?
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      rec.reloadLang = await page.evaluate(() => document.documentElement.lang);
      rec.reloadH1IsArabic = isAr(await txt(page, "h1"));
    }
  } catch (e) { rec.error = String(e).slice(0, 160); }
  console.log("P1 " + JSON.stringify(rec));
  await ctx.close();
}

// PART 2 — a plain English visitor with a stale ra_lang=ar (set by one visit to any ?lang=ar page)
{
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const rec = { scenario: "visit /ar/interview then navigate to /interview via in-product English link" };
  await page.goto(O + "/ar/interview", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  rec.ls = await page.evaluate(() => { try { return localStorage.getItem("ra_lang"); } catch { return "x"; } });
  for (const p of ["/interview", "/linkedin", "/career-plan", "/interview-live", "/login", "/optimize", "/"]) {
    await page.goto(O + p, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    rec[p] = { lang: await page.evaluate(() => document.documentElement.lang), h1: await txt(page, "h1") };
  }
  console.log("P2 " + JSON.stringify(rec, null, 1));
  await ctx.close();
}

await b.close();
