import { chromium } from "playwright-core";

const F = "/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/files";
const BASE = "http://localhost:3000";

const RESUME = `Ahmed Al-Fahad
ahmed.fahad@email.com | +966 55 123 4567 | Riyadh

EXPERIENCE
Senior Software Engineer, Acme Corp, 2020 - Present
- Built payment systems handling 2M transactions/month
- Led a team of 5 engineers

SKILLS
JavaScript, TypeScript, React, Node.js, AWS, Docker`;

const JD = `Staff Engineer - Fintech platform. We need 5+ years building payment infrastructure, strong TypeScript, Kubernetes, and observability experience. Riyadh based.`;

async function bodySnap(page, label) {
  const txt = await page.evaluate(() => document.body.innerText);
  return { label, hasStep: /Step \d of 3|الخطوة/.test(txt), txt };
}

async function run(path, vp) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  console.log(`\n\n########## ${path} @ ${vp.width}x${vp.height} ##########`);
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const stepText = () => page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => /^(Step \d of 3|الخطوة .+ من ٣)$/.test(d.textContent.trim()));
    return el ? el.textContent.trim() : "(no step indicator)";
  });
  const barsFilled = () => page.evaluate(() => {
    const bars = [...document.querySelectorAll("div.h-1\\.5")];
    return bars.map((b) => getComputedStyle(b).backgroundColor);
  });

  console.log("STEP1 indicator:", await stepText());

  // ── UPLOAD A LONG FILE (server truncates) ON STEP 1 ──
  await page.setInputFiles('input[type=file]', `${F}/long.pdf`);
  await page.waitForTimeout(2500);
  const ta1 = await page.evaluate(() => document.querySelector("textarea").value.length);
  const visible1 = await page.evaluate(() => document.body.innerText);
  console.log("after long.pdf upload -> textarea length:", ta1);
  console.log("  truncation warning visible on step1?",
    /8,000|٨٠٠٠|8000/.test(visible1) ? "YES: " + visible1.split("\n").filter(l => /8,000|٨٠٠٠/.test(l)).join(" | ") : "NO");
  console.log("  extraction preview visible?", /Here.s what we read|هذا ما قرأناه/.test(visible1));

  // ── UPLOAD A BAD FILE ON STEP 1 ──
  await page.setInputFiles('input[type=file]', `${F}/corrupt.pdf`);
  await page.waitForTimeout(2000);
  const visible2 = await page.evaluate(() => document.body.innerText);
  console.log("after corrupt.pdf -> any error text on screen?",
    /corrupt|password|تعذّر|Couldn|Failed/i.test(visible2) ? "YES" : "NO");
  console.log("  textarea length now:", await page.evaluate(() => document.querySelector("textarea").value.length));

  await page.setInputFiles('input[type=file]', `${F}/resume.rtf`);
  await page.waitForTimeout(1500);
  const visible3 = await page.evaluate(() => document.body.innerText);
  console.log("after resume.rtf (bogus ext) -> error text on screen?",
    /Unsupported|تعذّر|PDF, DOCX/i.test(visible3) ? "YES" : "NO");

  // reset textarea to a clean resume
  await page.evaluate(() => { const t = document.querySelector("textarea"); t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.fill("textarea", RESUME);
  await page.waitForTimeout(400);

  // continue -> step 2
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent));
    b.click();
  });
  await page.waitForTimeout(600);
  console.log("STEP2 indicator:", await stepText(), "bars:", (await barsFilled()).join(" "));

  await page.fill("textarea", JD);
  await page.fill('input[placeholder*="Employer" i], input[placeholder*="جهة" i]', "Acme Fintech");
  await page.fill('input[placeholder*="country" i], input[placeholder*="الدولة" i]', "Saudi Arabia");
  await page.waitForTimeout(300);

  // Back -> step 1: is resume preserved?
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^(← Back|→ رجوع)$/.test(x.textContent.trim()));
    b.click();
  });
  await page.waitForTimeout(500);
  console.log("BACK to step1 indicator:", await stepText());
  console.log("  resume preserved on step1?", await page.evaluate((r) => document.querySelector("textarea").value === r, RESUME));
  console.log("  step1 shows error box (stale upload error)?", await page.evaluate(() => /corrupt|Unsupported|تعذّر/i.test(document.body.innerText)));

  // forward again
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)).click(); });
  await page.waitForTimeout(500);
  console.log("  JD preserved on step2?", await page.evaluate((j) => document.querySelector("textarea").value === j, JD));
  console.log("  employer preserved?", await page.evaluate(() => [...document.querySelectorAll("input")].map(i => i.value).join(" / ")));

  // step 3
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)).click(); });
  await page.waitForTimeout(600);
  console.log("STEP3 indicator:", await stepText(), "bars:", (await barsFilled()).join(" "));
  const s3 = await page.evaluate(() => document.body.innerText);
  console.log("  step3 shows stale error?", /corrupt|Unsupported|8,000|٨٠٠٠|تعذّر/i.test(s3) ? "YES -> " + s3.split("\n").filter(l=>/corrupt|Unsupported|8,000|٨٠٠٠|تعذّر/i.test(l)).join(" | ") : "NO");
  console.log("  selected outLang buttons:", await page.evaluate(() => [...document.querySelectorAll("button")].filter(b=>/^(English|العربية|Both|الإنجليزية|الاثنتان)$/.test(b.textContent.trim())).map(b=>b.textContent.trim()+"="+getComputedStyle(b).backgroundColor).join(" | ")));

  // ── storage dump before reload
  const ls1 = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).map(([k,v])=>[k, String(v).slice(0,120)])), null, 1));
  console.log("  localStorage:", ls1);

  // ── RELOAD MID-WIZARD
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log("AFTER RELOAD indicator:", await stepText());
  const taR = await page.evaluate(() => document.querySelector("textarea")?.value || "");
  console.log("  resume restored?", taR === RESUME, "len", taR.length);
  console.log("  MyCvPicker shown?", await page.evaluate(() => /Use a CV you already made|استخدم سيرة أنشأتها/.test(document.body.innerText)));

  // navigate to step 2, is JD still there?
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)); if(b) b.click(); });
  await page.waitForTimeout(500);
  console.log("  JD restored on step2?", await page.evaluate((j) => document.querySelector("textarea").value === j, JD));
  console.log("  employer/country restored?", await page.evaluate(() => [...document.querySelectorAll("input")].map(i=>JSON.stringify(i.value)).join(" / ")));

  // ── ANALYZE (AI will fail) ──
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /Continue|متابعة/.test(x.textContent)).click(); });
  await page.waitForTimeout(400);
  const t0 = Date.now();
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => /Analyze my resume|حلّل سيرتي/.test(x.textContent)).click(); });
  // wait for either error or result
  let done = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => document.body.innerText);
    if (/Retry|إعادة|Job-match score|درجة الملاءمة|Overall resume score|تقييم جودة/.test(s)) { done = true; break; }
  }
  console.log(`ANALYZE settled=${done} after ${((Date.now()-t0)/1000).toFixed(1)}s`);
  const after = await page.evaluate(() => document.body.innerText);
  console.log("  screen after analyze (first 700 chars):\n", after.slice(0, 700).replace(/\n/g, " ⏎ "));
  console.log("  step indicator now:", await stepText());
  console.log("  resume still in textarea?", await page.evaluate((r) => (document.querySelector("textarea")?.value || "") === r, RESUME));

  console.log("CONSOLE:", logs.slice(0, 20).join("\n"));
  await browser.close();
}

const path = process.argv[2] || "/optimize";
const w = Number(process.argv[3] || 1280), h = Number(process.argv[4] || 800);
await run(path, { width: w, height: h });
