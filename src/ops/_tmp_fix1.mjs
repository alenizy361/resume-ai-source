import { browser, ctx, BASE } from "./_tmp_lib.mjs";

const dump = (p) => p.evaluate(() => {
  const o = {};
  for (const k of Object.keys(localStorage)) o[k] = localStorage.getItem(k);
  return { ls: o, ss: Object.keys(sessionStorage).reduce((a, k) => (a[k] = sessionStorage.getItem(k), a), {}) };
});

async function makeCv(p, title) {
  await p.goto(BASE + "/builder", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Build a new CV/ }).click();
  await p.waitForTimeout(1800);
  const box = p.locator('input[placeholder="Radiology Technologist"]');
  await box.fill(title);
  await p.waitForTimeout(1200);
  return p.url();
}

const b = await browser();

// ── PHASE 1: build two CVs in one tab ────────────────────────────────
const c1 = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
const p1 = await c1.newPage();
p1.on("pageerror", (e) => console.log("P1 ERR:", e.message));
const u1 = await makeCv(p1, "Radiographer Alpha");
const u2 = await makeCv(p1, "Nurse Bravo");
console.log("built:", u1, u2);
let snap = await dump(p1);
const cvKeys = Object.keys(snap.ls).filter(k => k.startsWith("ra_cv:"));
console.log("PHASE1 cv keys:", cvKeys, "sizes", cvKeys.map(k => snap.ls[k].length));
console.log("PHASE1 ss:", snap.ss);
console.log("PHASE1 lease:", snap.ls["ra_visit_live"], "now", Date.now());

// ── FIX 1 / TEST C: second tab in the same browser, first tab still open ──
const p2 = await c1.newPage();
p2.on("pageerror", (e) => console.log("P2 ERR:", e.message));
await p2.goto(BASE + "/builder", { waitUntil: "networkidle" });
await p2.waitForTimeout(2500);
let s2 = await dump(p2);
console.log("TEST C (2nd tab, sibling live): cv keys after =", Object.keys(s2.ls).filter(k => k.startsWith("ra_cv:")));
console.log("TEST C list text:", (await p2.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 500));
await p2.close();

// ── FIX 1 / TEST C2: backgrounded first tab (visibility hidden) then second tab ──
await p1.evaluate(() => { Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
const p3 = await c1.newPage();
await p3.goto(BASE + "/builder", { waitUntil: "networkidle" });
await p3.waitForTimeout(2000);
let s3 = await dump(p3);
console.log("TEST C2 (bg tab1): cv keys =", Object.keys(s3.ls).filter(k => k.startsWith("ra_cv:")));
await p3.close();
await c1.close();

// ── TEST A: genuinely new visit, STALE lease ──────────────────────────
const cA = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
const pA = await cA.newPage();
await pA.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await pA.evaluate(({ ls, staleAt }) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  localStorage.setItem("ra_visit_live", String(staleAt));
  sessionStorage.clear();
}, { ls: snap.ls, staleAt: Date.now() - 10 * 60_000 });
await pA.goto(BASE + "/builder", { waitUntil: "networkidle" });
await pA.waitForTimeout(2500);
const sA = await dump(pA);
console.log("TEST A (stale lease, new visit): cv keys =", Object.keys(sA.ls).filter(k => k.startsWith("ra_cv:")));
console.log("TEST A body:", (await pA.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 400));
await cA.close();

// ── TEST B: NEW PERSON, all tabs closed 60s ago → lease still FRESH ────
const cB = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
const pB = await cB.newPage();
await pB.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await pB.evaluate(({ ls, at }) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  localStorage.setItem("ra_visit_live", String(at));
  sessionStorage.clear();
}, { ls: snap.ls, at: Date.now() - 60_000 });
await pB.goto(BASE + "/builder", { waitUntil: "networkidle" });
await pB.waitForTimeout(2500);
const sB = await dump(pB);
console.log("TEST B (fresh lease, no session marker): cv keys =", Object.keys(sB.ls).filter(k => k.startsWith("ra_cv:")));
console.log("TEST B body:", (await pB.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 600));
await cB.close();

await b.close();
