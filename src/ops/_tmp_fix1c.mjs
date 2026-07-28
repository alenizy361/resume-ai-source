import { browser, ctx, BASE } from "./_tmp_lib.mjs";
import fs from "node:fs";

const SEED = JSON.parse(fs.readFileSync("/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/seed.json", "utf8"));

const b = await browser();

async function scenario(name, { lease, blockLease }) {
  const c = await ctx(b, { viewport: { width: 1280, height: 900 }, mobile: false });
  const p = await c.newPage();
  if (blockLease) {
    await p.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === "ra_visit_live" && this === window.localStorage) return;
        return orig.call(this, k, v);
      };
    });
  }
  await p.goto(BASE + "/robots.txt", { waitUntil: "domcontentloaded" });
  await p.evaluate(({ seed, lease }) => {
    localStorage.clear(); sessionStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    if (lease === null) localStorage.removeItem("ra_visit_live");
    else localStorage.setItem("ra_visit_live", String(Date.now() + lease));
  }, { seed: SEED, lease });
  await p.goto(BASE + "/builder", { waitUntil: "load" });
  await p.waitForSelector("text=Build a new CV", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(3500);
  const st = await p.evaluate(() => ({
    cvs: Object.keys(localStorage).filter(k => k.startsWith("ra_cv:")).length,
    visitAnon: localStorage.getItem("ra_visit:anon"),
    lease: localStorage.getItem("ra_visit_live"),
    sess: sessionStorage.getItem("ra_visit_session"),
    txt: document.body.innerText.replace(/\s+/g, " ").slice(0, 220),
  }));
  console.log(`\n### ${name}\n  cvKeys=${st.cvs} visitAnon=${st.visitAnon} lease=${st.lease} sess=${st.sess}`);
  console.log("  hydrated=", /Build a new CV/.test(st.txt), " OLD VISIBLE=", /Nurse Bravo|Radiographer Alpha/.test(st.txt));
  console.log("  txt:", st.txt.slice(0, 180));
  await c.close();
}

await scenario("A stale lease (-10min), lease writes ALLOWED", { lease: -600000 });
await scenario("A' stale lease (-10min), lease writes BLOCKED", { lease: -600000, blockLease: true });
await scenario("N no lease, lease writes BLOCKED", { lease: null, blockLease: true });
await scenario("A2 stale lease (-10min), allowed, run 2", { lease: -600000 });
await b.close();
