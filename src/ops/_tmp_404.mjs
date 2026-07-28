import { chromium } from "playwright-core";
const O = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const js of [true, false]) {
  const ctx = await b.newContext({ javaScriptEnabled: js });
  for (const p of ["/zzz", "/ar/zzz", "/ar/interviewx", "/ar/resume-examples/no-such-job", "/resume-examples/no-such-job"]) {
    const page = await ctx.newPage();
    const r = await page.goto(O + p, { waitUntil: js ? "networkidle" : "load" });
    await page.waitForTimeout(js ? 800 : 200);
    const info = {
      js, p, status: r.status(),
      htmlLang: await page.evaluate(() => document.documentElement.lang || "(none)"),
      dir: await page.evaluate(() => document.documentElement.dir || "(none)"),
      title: await page.title(),
      text: (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim().slice(0, 140),
      styled: await page.evaluate(() => {
        const m = document.querySelector("main");
        return m ? getComputedStyle(m).display : "NO-MAIN";
      }),
      css: await page.evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').length),
    };
    console.log(JSON.stringify(info));
    await page.close();
  }
  await ctx.close();
}
await b.close();
