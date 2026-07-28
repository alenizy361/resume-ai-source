import { chromium } from "playwright-core";
const BASE = "http://localhost:3000";

const AR_CV = `سارة العتيبي
مهندسة برمجيات
sara@email.com | الرياض
الخبرة: مهندسة برمجيات أولى في شركة كبرى من ٢٠٢٠ حتى الآن
قدت فريقاً من خمسة مهندسين وبنيت أنظمة دفع
المهارات: جافاسكربت، رياكت، نود، AWS، دوكر
التعليم: بكالوريوس علوم الحاسب، جامعة الملك سعود، ٢٠١٧`;

const EN_CV = `Ahmed Al-Fahad
Senior Software Engineer
ahmed@email.com | +966 55 123 4567 | Riyadh
EXPERIENCE: Senior Software Engineer at Acme Corp 2020-Present
Built payment systems handling 2M transactions per month and led a team of five engineers
SKILLS: JavaScript, TypeScript, React, Node.js, AWS, Docker, Kubernetes
EDUCATION: BSc Computer Science, KFUPM, 2017`;

async function run(path, vp) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  console.log(`\n===== MyCvPicker on ${path} @ ${vp.width}x${vp.height} =====`);
  await page.goto(BASE + path);
  await page.evaluate(({ ar, en }) => {
    sessionStorage.setItem("ra_visit_session", "1");
    localStorage.setItem("ra_saved_resumes:anon", JSON.stringify([
      { id: "a1", ts: Date.now() - 1000, title: "سيرتي العربية", source: "optimized", text: ar, lang: "ar" },
      { id: "a2", ts: Date.now() - 90000000, title: "My English CV", source: "optimized", text: en, lang: "en" },
    ]));
  }, { ar: AR_CV, en: EN_CV });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const strip = await page.evaluate(() => {
    const h = [...document.querySelectorAll("div")].find((d) => /Use a CV you already made|استخدم سيرة أنشأتها/.test(d.textContent) && d.querySelectorAll("button").length >= 2);
    return h ? h.innerText : "(NO PICKER)";
  });
  console.log("picker:\n" + strip);

  // pick the ARABIC cv
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /سيرتي العربية/.test(x.textContent));
    if (!b) return false; b.click(); return true;
  });
  console.log("clicked arabic cv:", ok);
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({
    ta: document.querySelector("textarea").value.slice(0, 40),
    taLen: document.querySelector("textarea").value.length,
    confirm: document.body.innerText.split("\n").filter((l) => /Filled from|تم التعبئة/.test(l)).join(" | "),
  }));
  console.log("after pick:", JSON.stringify(st));

  // go to step 3 to read outLang
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)).click());
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)).click());
  await page.waitForTimeout(600);
  const langSel = await page.evaluate(() => [...document.querySelectorAll("button")]
    .filter((b) => /^(English|العربية|Both|الإنجليزية|الاثنتان)$/.test(b.textContent.trim()))
    .map((b) => b.textContent.trim() + "=" + (getComputedStyle(b).backgroundColor === "rgb(139, 92, 246)" ? "SELECTED" : "-")).join(" | "));
  console.log("step3 outLang:", langSel);

  // now go back to step1 and pick the ENGLISH one -> does outLang follow?
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^(← Back|→ رجوع)$/.test(x.textContent.trim())).click());
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^(← Back|→ رجوع)$/.test(x.textContent.trim())).click());
  await page.waitForTimeout(500);
  const another = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Use a different CV|استخدم سيرة أخرى/.test(x.textContent));
    if (!b) return "(no 'use different' button)"; b.click(); return "clicked";
  });
  console.log("use-different:", another);
  await page.waitForTimeout(400);
  const picked2 = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /My English CV/.test(x.textContent));
    if (!b) return false; b.click(); return true;
  });
  console.log("clicked english cv:", picked2);
  await page.waitForTimeout(500);
  console.log("textarea now:", await page.evaluate(() => JSON.stringify(document.querySelector("textarea").value.slice(0, 40))));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)).click());
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)).click());
  await page.waitForTimeout(600);
  console.log("step3 outLang after english pick:", await page.evaluate(() => [...document.querySelectorAll("button")]
    .filter((b) => /^(English|العربية|Both|الإنجليزية|الاثنتان)$/.test(b.textContent.trim()))
    .map((b) => b.textContent.trim() + "=" + (getComputedStyle(b).backgroundColor === "rgb(139, 92, 246)" ? "SELECTED" : "-")).join(" | ")));

  await browser.close();
}

await run("/optimize", { width: 1280, height: 800 });
await run("/ar/optimize", { width: 390, height: 844 });
