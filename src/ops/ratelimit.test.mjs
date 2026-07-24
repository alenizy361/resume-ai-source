/**
 * Rate-limiter behaviour, without a Redis.
 *
 * Run with:  npm run test:ratelimit
 *
 * The two properties that matter are the ones a live incident would exercise:
 * the shared counter must actually enforce the budget, and a Redis that is down
 * must not take the endpoint down with it.
 */
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}`); };
const eq = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  good ? pass++ : fail++;
  console.log(`${good ? "✅" : "❌"} ${name}${good ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

/* ── 1. no shared store configured → the in-memory limiter, enforced ── */
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = await import("../app/lib/ratelimit.ts?case=memory");

console.log("\n── with no shared store: falls back to in-memory, still enforces ──");
eq("not reported as shared", mem.rateLimitIsShared(), false);
const memResults = [];
for (let i = 0; i < 5; i++) memResults.push(await mem.allowShared("k", 3, 60_000));
eq("3 allowed then blocked", memResults, [true, true, true, false, false]);
ok("a different key has its own budget", await mem.allowShared("other", 3, 60_000));

/* ── 2. shared store configured → the pipeline drives the decision ── */
process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.invalid";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
const shared = await import("../app/lib/ratelimit.ts?case=shared");

console.log("\n── with a shared store: the counter decides ──");
eq("reported as shared", shared.rateLimitIsShared(), true);

const realFetch = globalThis.fetch;
let counter = 0;
let lastBody = null;
globalThis.fetch = async (_url, init) => {
  lastBody = JSON.parse(init.body);
  counter += 1;
  return { ok: true, json: async () => [{ result: "OK" }, { result: counter }] };
};
const sharedResults = [];
for (let i = 0; i < 5; i++) sharedResults.push(await shared.allowShared("s", 3, 60_000));
eq("3 allowed then blocked, from Redis' count", sharedResults, [true, true, true, false, false]);
eq("SET carries the TTL and NX", lastBody[0], ["SET", "rl:s", "0", "EX", "60", "NX"]);
eq("INCR consumes one", lastBody[1], ["INCR", "rl:s"]);

console.log("\n── a Redis that is down must not take the endpoint down ──");
globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
ok("unreachable Redis falls back and allows", await shared.allowShared("down", 3, 60_000));
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
ok("Redis 500 falls back and allows", await shared.allowShared("err", 3, 60_000));
globalThis.fetch = async () => ({ ok: true, json: async () => [{ result: "OK" }, { result: "not-a-number" }] });
ok("malformed reply falls back and allows", await shared.allowShared("bad", 3, 60_000));

console.log("\n── the fallback is still a limiter, not an open door ──");
globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
const degraded = [];
for (let i = 0; i < 5; i++) degraded.push(await shared.allowShared("deg", 3, 60_000));
eq("degraded mode still enforces the budget", degraded, [true, true, true, false, false]);
globalThis.fetch = realFetch;

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
