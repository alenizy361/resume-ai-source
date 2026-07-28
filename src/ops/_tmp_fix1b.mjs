import { browser, ctx, BASE } from "./_tmp_lib.mjs";
import fs from "node:fs";

const dump = (p) => p.evaluate(() => ({
  ls: Object.keys(localStorage).reduce((a, k) => (a[k] = localStorage.getItem(k).slice(0, 60), a), {}),
  ss: Object.keys(sessionStorage).reduce((a, k) => (a[k] = sessionStorage.getItem(k).slice(0, 60), a), {}),
}));

async function makeCv(p, title) {
  await p.goto(BASE + "/builder", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Build a new CV/ }).click();
  await p.waitForTimeout(1800);
  await p.locator('input[placeholder="Radiology Technologist"]').fill(title);
  await p.waitForTimeout(1200);
}

const b = await browser();
const c1 = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
const p1 = await c1.newPage();
await makeCv(p1, "Radiographer Alpha");
await makeCv(p1, "Nurse Bravo");
const full = await p1.evaluate(() => Object.keys(localStorage).reduce((a, k) => (a[k] = localStorage.getItem(k), a), {}));
console.log("SEED keys:", Object.keys(full));
fs.writeFileSync("/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/seed.json", JSON.stringify(full));
await c1.close();

async function scenario(name, mutate, path = "/builder") {
  const c = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
  const p = await c.newPage();
  const logs = [];
  p.on("console", (m) => logs.push(m.type() + ":" + m.text().slice(0, 160)));
  p.on("pageerror", (e) => logs.push("ERR:" + e.message));
  await p.goto(BASE + "/robots.txt", { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.goto(BASE + "/blank-404-probe", { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.evaluate((seed) => { localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); sessionStorage.clear(); }, full);
  await p.evaluate(mutate);
  const before = await dump(p);
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  const after = await dump(p);
  console.log("\n### " + name);
  console.log(" before:", JSON.stringify(before));
  console.log(" after :", JSON.stringify(after));
  console.log(" cvs   :", Object.keys(after.ls).filter(k => k.startsWith("ra_cv:")).length);
  const txt = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  console.log(" listed:", /Nurse Bravo/.test(txt) ? "OLD CVs VISIBLE" : "clean");
  if (logs.length) console.log(" logs:", logs.slice(0, 6));
  await c.close();
}

await scenario("A1 stale lease (10min), no session", () => { localStorage.setItem("ra_visit_live", String(Date.now() - 600000)); });
await scenario("A2 NO lease key at all, no session", () => { localStorage.removeItem("ra_visit_live"); });
await scenario("A3 no lease, straight to a step URL", () => { localStorage.removeItem("ra_visit_live"); }, "/builder");
await scenario("B fresh lease (60s), no session", () => { localStorage.setItem("ra_visit_live", String(Date.now() - 60000)); });
await b.close();
