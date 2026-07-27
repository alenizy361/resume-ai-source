/**
 * How much JavaScript a page actually ships, measured across repeated builds.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY REPEATED BUILDS, NOT ONE PAIR
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * O-15's first attempt measured a before/after pair — 109 KB after deleting the two root-layout
 * client components, 409 KB after reimplementing them as scripts — and the doc's own postmortem
 * says plainly: "Turbopack chunk splitting varies between builds, so a single before/after pair is
 * not evidence." One build's chunk boundaries are not the next build's, so a single measurement
 * cannot distinguish a real saving from build-to-build noise.
 *
 * This runs `next build` N times (default 3), starts each build, measures with a real browser —
 * every `<script>` byte actually transferred for the page, not a guess from the HTML — and reports
 * the median. A real fix should show up as a large, consistent drop across builds; noise should not.
 *
 *   node ops/jsweight.mjs                      # 3 builds, the pages this item measured
 *   node ops/jsweight.mjs --builds=5 --path=/  # more builds, one page
 */

import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const BUILDS = Number(args.builds) || 3;
const PAGES = args.path ? [args.path] : ["/resume-examples", "/resume-examples/registered-nurse", "/"];
const PORT = Number(args.port) || 3390;

/**
 * Total bytes of every `<script>` a page's initial load actually transfers, real network bytes.
 *
 * `waitUntil: "load"`, with no extra wait afterward — not `"networkidle"`. Next's `<Link>` prefetches
 * OTHER routes' JS once a link scrolls into the viewport or is hovered, and every catalogue page's
 * header carries a link to `/optimize`, which is genuinely JS-heavy. `networkidle` waits for that
 * prefetch to finish and folds a different page's weight into this one's number. `"load"` is the
 * point the browser considers THIS page loaded — everything after it is opportunistic, not required —
 * and stopping the byte count there is what makes the number answer "what does this page cost",
 * not "what does this page cost plus whatever it prefetched while I kept the tab open."
 */
async function measurePage(browser, path) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  /* Prefetch requests for another route are identifiable by Next's own RSC query marker; excluded
     explicitly rather than relied upon to simply not have finished by "load", since a fast prefetch
     on a cached dev server could complete before the load event fires. */
  let bytes = 0, chunkCount = 0;
  page.on("response", async (res) => {
    const ct = res.headers()["content-type"] || "";
    if (!/javascript/.test(ct)) return;
    if (/[?&]_rsc=/.test(res.url())) return;
    try {
      const body = await res.body();
      bytes += body.length;
      chunkCount++;
    } catch { /* a response that finished after the page closed is not this page's weight */ }
  });
  await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "load" });
  await page.close();
  return { bytes, chunkCount };
}

async function oneBuild() {
  execSync("npm run build", { stdio: "pipe" });
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "pipe" });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start in time")), 30000);
    const check = setInterval(async () => {
      try {
        const r = await fetch(`http://localhost:${PORT}/`);
        if (r.ok || r.status < 500) { clearInterval(check); clearTimeout(timer); resolve(); }
      } catch { /* not up yet */ }
    }, 500);
  });

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const results = {};
  for (const path of PAGES) results[path] = await measurePage(browser, path);
  await browser.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  return results;
}

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

console.log(`Measuring ${PAGES.length} page(s) across ${BUILDS} build(s)...`);
const perBuild = [];
for (let i = 0; i < BUILDS; i++) {
  console.log(`\n── build ${i + 1}/${BUILDS} ──`);
  const r = await oneBuild();
  for (const [path, v] of Object.entries(r)) console.log(`  ${path}: ${(v.bytes / 1024).toFixed(0)} KB (${v.chunkCount} chunks)`);
  perBuild.push(r);
}

console.log(`\n══ median across ${BUILDS} builds ══`);
for (const path of PAGES) {
  const byteSamples = perBuild.map((r) => r[path].bytes);
  const chunkSamples = perBuild.map((r) => r[path].chunkCount);
  console.log(`${path}: ${(median(byteSamples) / 1024).toFixed(0)} KB median, ${median(chunkSamples)} chunks — samples: ${byteSamples.map((b) => (b / 1024).toFixed(0)).join(", ")} KB`);
}
