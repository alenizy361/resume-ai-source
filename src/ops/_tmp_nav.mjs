// Read-only interactive nav audit with playwright-core.
import { chromium } from "playwright-core";

const O = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function probe(ctx, path, label, action) {
  const page = await ctx.newPage();
  const out = { path, label };
  try {
    await page.goto(O + path, { waitUntil: "networkidle", timeout: 30000 });
    out.landedLang = await page.evaluate(() => document.documentElement.lang);
    out.landedDir = await page.evaluate(() => document.documentElement.dir);
    out.url0 = page.url().replace(O, "");
    if (action) await action(page, out);
  } catch (e) { out.error = String(e).slice(0, 200); }
  await page.close();
  return out;
}

const results = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });

// ---- 1. Arabic pages: header CTA, auth link, lang toggle
const arPages = [
  "/ar", "/ar/optimize", "/ar/builder", "/ar/pricing", "/ar/templates", "/ar/account",
  "/ar/resume-examples", "/ar/resume-skills", "/ar/cover-letter-examples",
  "/ar/resume-examples/category", "/ar/resume-examples/category/technology",
  "/ar/resume-examples/software-engineer", "/ar/resume-skills/software-engineer",
  "/ar/cover-letter-examples/software-engineer",
  "/ar/pdf-readability-checker", "/ar/jd-keyword-extractor",
  "/ar/privacy", "/ar/terms",
  "/ar/interview", "/ar/linkedin", "/ar/career-plan", "/ar/interview-live", "/ar/login",
];
for (const p of arPages) {
  results.push(await probe(ctx, p, "ar-header", async (page, out) => {
    const hdr = page.locator("header").first();
    if (await hdr.count()) {
      out.headerLinks = await hdr.locator("a").evaluateAll((as) =>
        as.map((a) => ({ t: (a.textContent || "").trim().slice(0, 28), h: a.getAttribute("href") })));
    } else out.headerLinks = null;
    // click the CTA (.ps-cta) if present
    const cta = page.locator("header a.ps-cta").first();
    if (await cta.count()) {
      const href = await cta.getAttribute("href");
      await cta.click();
      await page.waitForLoadState("networkidle");
      out.ctaHref = href;
      out.ctaLanded = page.url().replace(O, "");
      out.ctaLang = await page.evaluate(() => document.documentElement.lang);
      out.ctaH1 = (await page.locator("h1").first().textContent().catch(() => "")) || "";
      out.ctaH1 = out.ctaH1.trim().slice(0, 60);
    }
  }));
}

// ---- 2. lang toggle from arabic-hint pages (the ?lang=ar shared routes)
for (const p of ["/interview?lang=ar", "/linkedin?lang=ar", "/career-plan?lang=ar", "/interview-live?lang=ar", "/login?lang=ar"]) {
  const fresh = await b.newContext({ viewport: { width: 1280, height: 900 } });
  results.push(await probe(fresh, p, "toggle-EN-from-ar-hint", async (page, out) => {
    out.h1 = ((await page.locator("h1").first().textContent().catch(() => "")) || "").trim().slice(0, 60);
    out.ls = await page.evaluate(() => { try { return localStorage.getItem("ra_lang"); } catch { return "blocked"; } });
    const tog = page.locator("header a").filter({ hasText: /^EN$/ }).first();
    if (await tog.count()) {
      out.toggleHref = await tog.getAttribute("href");
      await tog.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      out.after = page.url().replace(O, "");
      out.afterLang = await page.evaluate(() => document.documentElement.lang);
      out.afterDir = await page.evaluate(() => document.documentElement.dir);
      out.afterH1 = ((await page.locator("h1").first().textContent().catch(() => "")) || "").trim().slice(0, 60);
    } else out.toggleHref = "NO-EN-TOGGLE";
  }));
  await fresh.close();
}

// ---- 3. mobile hamburger, both langs, 390x844
const mob = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
for (const p of ["/", "/ar", "/pricing", "/ar/pricing", "/optimize", "/ar/optimize", "/interview?lang=ar", "/interview", "/ar/resume-examples", "/resume-examples", "/ar/builder", "/builder", "/ar/pdf-readability-checker", "/ar/jd-keyword-extractor", "/career-plan?lang=ar", "/interview-live?lang=ar", "/ar/templates", "/templates"]) {
  results.push(await probe(mob, p, "mobile-menu", async (page, out) => {
    const btn = page.locator('header button[aria-label]').first();
    out.hamburger = await btn.count() > 0;
    if (!out.hamburger) return;
    await btn.click();
    await page.waitForTimeout(500);
    const dlg = page.locator('[role="dialog"]').first();
    out.menuOpen = await dlg.count() > 0 && await dlg.isVisible();
    if (!out.menuOpen) return;
    out.items = await dlg.locator("a").evaluateAll((as) => as.map((a) => ({ t: (a.textContent || "").trim().slice(0, 24), h: a.getAttribute("href") })));
    // hit-test each link
    out.hit = [];
    for (const l of await dlg.locator("a").all()) {
      const box = await l.boundingBox();
      if (!box) { out.hit.push("nobox"); continue; }
      const top = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el ? (el.closest("a") ? "A:" + el.closest("a").getAttribute("href") : el.tagName) : "none";
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      out.hit.push(top);
    }
  }));
}
await mob.close();

// ---- 4. auth pages signed out
for (const p of ["/login", "/account", "/ar/login", "/ar/account"]) {
  const fresh = await b.newContext({ viewport: { width: 1280, height: 900 } });
  results.push(await probe(fresh, p, "auth-signedout", async (page, out) => {
    out.url = page.url().replace(O, "");
    out.h1 = ((await page.locator("h1").first().textContent().catch(() => "")) || "").trim().slice(0, 80);
    out.bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300);
    out.headerLinks = await page.locator("header a").evaluateAll((as) => as.map((a) => ({ t: (a.textContent || "").trim().slice(0, 24), h: a.getAttribute("href") })));
  }));
  await fresh.close();
}

await ctx.close();
await b.close();
console.log(JSON.stringify(results, null, 1));
