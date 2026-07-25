/**
 * The AI health endpoint must fail closed, and must never print a secret.
 *
 * Both properties are the kind that a code review passes and a deploy breaks, because both
 * are about what the code does NOT do. So they are asserted structurally, against the
 * source, and each assertion is verified by injecting the defect it exists to catch (see the
 * `INJECT` note at the bottom — the checks were confirmed to fail when the guard was
 * removed and when a key was interpolated into the response).
 *
 *   1. FAIL CLOSED. No `HEALTH_TOKEN` configured must mean the endpoint does not exist. A
 *      deployment that forgets to set it must not end up serving open diagnostics.
 *   2. 404, NOT 401. A 401 confirms the endpoint is there, which is the one fact worth
 *      withholding from someone probing for it.
 *   3. NO SECRET VALUES, EVER. Secret env names may appear only where they are being
 *      checked for presence or sent upstream as credentials — never on a path that reaches
 *      the response body.
 *   4. THE LIVE PROBE IS OPT-IN. It spends model credit, so a plain GET must not make a
 *      model call. An uptime monitor pointed at this endpoint must not run up a bill.
 *
 * With `HEALTH_BASE=http://…` it additionally asks the running server, which is the only way
 * to confirm (1) end to end. Without it the suite is pure and offline, so it belongs in the
 * default chain.
 *
 *   node ops/health.test.mjs
 */

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const SRC = readFileSync("app/api/health/ai/route.ts", "utf8");

/* ── 1 & 2: fail closed, and 404 rather than 401 ── */

ok("the route refuses when no token is configured",
  /if \(!expected \|\| given !== expected\)/.test(SRC));
ok("and answers 404, not 401 — a 401 confirms the endpoint exists",
  /status: 404/.test(SRC) && !/status: 401/.test(SRC));
/* Strict, and asserted precisely: the first version of this check matched `!== expected`
   because that string contains `== expected`, and reported a defect in correct code. */
ok("the token comparison is strict",
  /given !== expected/.test(SRC) && !/given\s*==\s*expected/.test(SRC));

/* ── 3: no secret may reach the response ── */

/**
 * Names whose VALUES must never leave the process.
 *
 * `AI_MODEL` and `AI_PROVIDER` are deliberately absent: a model id is not a secret, and
 * reporting which model the deployment believes it is using is most of the diagnostic value.
 */
const SECRETS = [
  "NVIDIA_API_KEY", "ANTHROPIC_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_URL",
  "HEALTH_TOKEN",
];

/**
 * The only three shapes in which a secret name may legitimately appear.
 *
 *   redact("X")                       — presence check, returns a boolean
 *   `Bearer ${process.env.X}` / "x-api-key": String(process.env.X)   — sent upstream
 *   const expected = process.env.HEALTH_TOKEN                        — the gate itself
 *
 * Anything else is a mention on a path that could reach the response body, and is a failure
 * whether or not it happens to be safe today.
 */
const ALLOWED = [
  (n) => new RegExp(`redact\\("${n}"\\)`, "g"),
  (n) => new RegExp(`Bearer \\$\\{process\\.env\\.${n}\\}`, "g"),
  (n) => new RegExp(`String\\(process\\.env\\.${n}\\)`, "g"),
  (n) => new RegExp(`const expected = process\\.env\\.${n}`, "g"),
];

{
  const leaks = [];
  for (const name of SECRETS) {
    let rest = SRC;
    for (const build of ALLOWED) rest = rest.replace(build(name), "");
    // Whatever is left mentioning the name is an unaccounted-for use.
    for (const line of rest.split("\n")) {
      if (line.includes(name) && !line.trim().startsWith("*") && !line.trim().startsWith("//")) {
        leaks.push(`${name}: ${line.trim().slice(0, 70)}`);
      }
    }
  }
  ok("no secret env var is read anywhere it could reach the response",
    leaks.length === 0, leaks.join(" · "));
}

ok("presence is reported through redact(), which cannot return a value",
  /function redact\([\s\S]*?return typeof v === "string" && v\.trim\(\)\.length > 0;/.test(SRC));

{
  // A blunt backstop: the response must never carry a field whose name suggests a value.
  const suspicious = /(?:apiKey|token|secret)\s*:\s*(?!.*[Pp]resent)/.exec(SRC);
  ok("no response field is named like it holds a credential",
    suspicious === null, suspicious?.[0] ?? "");
}

/* ── 4: the live probe is opt-in ── */

ok("a plain GET does not make a model call",
  /searchParams\.get\("live"\) !== "1"/.test(SRC));
ok("and says outright that the live probe costs money",
  /spends model credit/i.test(SRC));
ok("both probes have a timeout — a health check that can hang is not one",
  (SRC.match(/setTimeout\(\(\) => ctrl\.abort\(\), 10_000\)/g) || []).length === 2);
ok("the probe asks for almost no output",
  (SRC.match(/max_tokens: 4/g) || []).length === 2);

/* ── the report is worth reading ── */

for (const field of ["rateLimit", "tasks", "pricing", "support", "apiKeyPresent"]) {
  ok(`the report includes ${field}`, new RegExp(`${field}:`).test(SRC));
}
ok("it names the in-memory rate-limit fallback as the problem it is",
  /per-instance/.test(SRC));
ok("it is never cached — the point is the state right now",
  /dynamic = "force-dynamic"/.test(SRC));

/* ── end to end, when a server is available ── */

if (process.env.HEALTH_BASE) {
  const base = process.env.HEALTH_BASE;
  const res = await fetch(`${base}/api/health/ai`).catch(() => null);
  ok("the live endpoint 404s without a token", res !== null && res.status === 404,
    res ? String(res.status) : "no response");
  const res2 = await fetch(`${base}/api/health/ai?token=wrong`).catch(() => null);
  ok("and 404s with the wrong one", res2 !== null && res2.status === 404,
    res2 ? String(res2.status) : "no response");
  const body = res ? await res.json().catch(() => ({})) : {};
  ok("the refusal leaks nothing about configuration",
    Object.keys(body).length === 1 && body.error === "Not found", JSON.stringify(body).slice(0, 80));
} else {
  console.log("ℹ  set HEALTH_BASE to also check the running server");
}

/*
 * INJECT — how these were verified rather than assumed:
 *   · deleting the `!expected ||` clause          → "refuses when no token is configured" fails
 *   · changing 404 to 401                         → "answers 404, not 401" fails
 *   · adding `key: process.env.NVIDIA_API_KEY`    → "no secret env var is read" fails
 *   · removing the `live !== "1"` early return    → "a plain GET does not make a model call" fails
 */

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
