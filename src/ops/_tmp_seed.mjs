import { browser, ctx, BASE } from "./_tmp_lib.mjs";

const b = await browser();
const c = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
const p = await c.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await p.goto(BASE + "/builder", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
const btns = await p.evaluate(() => [...document.querySelectorAll("button,a")].map((e, i) => i + ":" + e.tagName + ":" + (e.getAttribute("href")||"") + ":" + (e.textContent||"").trim().slice(0,50)));
console.log(btns.join("\n"));
await p.getByRole("button", { name: /Build a new CV/ }).click();
await p.waitForTimeout(2500);
console.log("URL after:", p.url());
console.log(await p.evaluate(() => document.body.innerText.slice(0, 1500)));
console.log("INPUTS:", await p.evaluate(() => [...document.querySelectorAll("input,textarea,select")].map(e => ({ tag: e.tagName, ph: e.placeholder, id: e.id, type: e.type }))));
await b.close();
