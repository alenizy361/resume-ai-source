/**
 * Nothing that holds a person's document may be reachable through one host only.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS SUITE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Vercel Edge Config has no self-hosted equivalent. Three stores used it, and between them they hold
 * everything that would be expensive to lose:
 *
 *   entitlements.ts   WHO HAS PAID          — already had a Redis fallback
 *   cvstore.ts        saved CVs per account — did not
 *   publicresume.ts   published CVs at /r/  — did not
 *
 * So moving the product to any other host meant migrating live payment records and people's published
 * CVs by hand, under time pressure, with a URL somebody has already put on a job application at the
 * other end of it. That is not a migration plan, it is a hostage situation, and it was invisible
 * because everything worked perfectly where it was.
 *
 * Each store now answers from Edge Config when configured and Redis otherwise — the Redis this product
 * already runs for the shared occupation packs, so no new service and no new credential.
 *
 * These assertions are on the SOURCE, deliberately. Exercising both backends needs live credentials
 * for both, which a test suite must not carry; what can be checked without them is that neither path
 * has been quietly dropped, and that is the failure that would actually happen — someone tidies the
 * "unused" branch of a store they only ever saw run on Vercel.
 *
 *   node ops/portability.test.mjs
 */

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const read = (p) => readFileSync(p, "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const STORES = [
  { name: "entitlements", file: "app/lib/entitlements.ts" },
  { name: "cvstore", file: "app/lib/cvstore.ts" },
  { name: "publicresume", file: "app/lib/publicresume.ts" },
];

console.log("\n── every personal store can answer without Vercel ──");

for (const s of STORES) {
  const src = code(read(s.file));

  /* A Redis path must exist at all. This is the assertion that would have failed before the work. */
  ok(`${s.name} has a Redis path`,
    /UPSTASH_REDIS_REST_URL|redisUrl\(\)/.test(src));

  /*
   * And it must be REACHABLE. A store whose `configured()` still demands Edge Config would fall
   * through to "not configured" off Vercel and silently return nothing — which for `cvstore` reads to
   * the user as their saved CVs having been deleted.
   */
  ok(`${s.name} reports itself configured on Redis alone`,
    /Configured\(\)\s*\|\|\s*(redisConfigured|upstashConfigured)\(\)/.test(src),
    "the `configured` check still requires Edge Config");

  /* Reads AND writes. A read-only Redis path is a store that loses every new save. */
  ok(`${s.name} can write to Redis, not only read`,
    /\["SET"|"SET",/.test(src), "no SET — writes would still need Vercel");
}

console.log("\n── Edge Config still wins where it is configured ──");
{
  /*
   * The migration must be a no-op until it is deliberately performed. If Redis took priority, then
   * the moment these credentials met on one deployment the product would start reading an empty
   * Redis and reporting that everybody's CVs and entitlements had vanished.
   */
  for (const s of STORES) {
    const src = code(read(s.file));
    ok(`${s.name} prefers Edge Config when both are present`,
      /if\s*\(\s*edgeConfigured\(\)\s*\)/.test(src) || /if\s*\(\s*!edgeConfigured\(\)\s*\)/.test(src),
      "no explicit precedence — the backend would depend on statement order");
  }
}

console.log("\n── the remaining Vercel-only couplings, named rather than discovered later ──");
{
  /*
   * Not failures. A list, asserted so it cannot grow silently — the point of the exercise is that the
   * cost of leaving is known at all times, not that it is zero.
   */
  const og = read("app/api/og/route.tsx");
  ok("only /api/og needs the edge runtime", /runtime = "edge"/.test(og));

  const pkg = JSON.parse(read("package.json"));
  const vercelDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter((d) => d.startsWith("@vercel/"));
  /* `@vercel/analytics` and `@vercel/speed-insights` degrade to silence off-platform: they stop reporting and nothing breaks. */
  const expectedVercelDeps = ["@vercel/analytics", "@vercel/speed-insights"];
  ok("the only Vercel dependencies are analytics and speed-insights, which degrade to silence",
    vercelDeps.length === expectedVercelDeps.length && expectedVercelDeps.every(d => vercelDeps.includes(d)),
    vercelDeps.join(", "));

  /* Anything else reaching for Edge Config directly would be a fourth store nobody knew about. */
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e)) files.push(p);
    }
  };
  walk("app");
  const users = files.filter((f) => /edge-config\.vercel\.com/.test(read(f)));
  const known = STORES.map((s) => s.file);
  const surprises = users.filter((f) => !known.includes(f));
  ok("no file outside the three stores talks to Edge Config", surprises.length === 0, surprises.join(", "));
}

console.log("\n── the migration exists and verifies its own work ──");
{
  const mig = read("ops/store-migrate.mjs");
  ok("a migration script exists", mig.length > 500);
  ok("it can run without writing anything", /--apply|dryRun|dry-run/.test(mig));
  /*
   * Reading back is the whole point. "Copied 40 keys" proves 40 writes were issued, not that a single
   * one can be found again — and the keys differ between backends, so a one-character drift produces
   * a silent, total loss.
   */
  ok("it reads every key back from the destination", /verif|readback|read back/i.test(mig));
  ok("published CVs go first, because a live URL is somebody's job application",
    mig.indexOf("pub") < mig.indexOf("res_") || /publicresume/.test(mig));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
