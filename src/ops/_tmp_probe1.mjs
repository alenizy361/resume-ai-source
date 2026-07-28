import { browser, ctx, BASE } from "./_tmp_lib.mjs";

const b = await browser();
const c = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
const p = await c.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await p.goto(BASE + "/builder", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
console.log("URL:", p.url());
console.log("--- inputs ---");
console.log(await p.evaluate(() => [...document.querySelectorAll("input,textarea,select")].map(e => ({ tag: e.tagName, name: e.name, ph: e.placeholder, id: e.id, type: e.type })).slice(0, 20)));
console.log("--- buttons ---");
console.log(await p.evaluate(() => [...document.querySelectorAll("button,a[href]")].map(e => (e.textContent || "").trim().slice(0, 40)).filter(Boolean).slice(0, 40)));
console.log("--- LS keys ---");
console.log(await p.evaluate(() => Object.keys(localStorage)));
console.log("--- SS keys ---");
console.log(await p.evaluate(() => Object.keys(sessionStorage)));
await b.close();
