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

/* ── the two brains, reported and probed separately ── */

/**
 * The endpoint describes two providers because the product runs two: a fast cheap model
 * behind a form field, and a stronger one for whole-document work. Everything below is
 * about that split being honest in BOTH halves of the report.
 */
for (const field of ["suggestProvider", "suggestModel", "suggestKeyPresent"]) {
  ok(`the report includes ${field}`, new RegExp(`${field}[,:]`).test(SRC));
}
ok("the suggest provider falls back to the global one, not to a hardcoded name",
  /AI_PROVIDER_SUGGEST \|\| process\.env\.AI_PROVIDER/.test(SRC));
ok("the suggest model defaults to the cheap fast one, never to the interview's",
  /ANTHROPIC_MODEL_SUGGEST \|\| "claude-haiku-4-5"/.test(SRC)
  && !/ANTHROPIC_MODEL_SUGGEST \|\| process\.env\.ANTHROPIC_MODEL/.test(SRC));

/*
 * The defect this pair exists for, found by reading the route after it shipped.
 *
 * `ok` was computed twice: once for the configuration report, where it required both keys,
 * and once at the end of the live probe, where it required only the global one. So a
 * deployment with AI_PROVIDER_SUGGEST=anthropic and no Anthropic key answered
 * `ok: false` to a plain GET and `ok: true` to `?live=1` — the more expensive request
 * giving the more optimistic answer, which is the wrong way round for a health check.
 *
 * Asserted as a count, because the failure was not a missing check but an INCONSISTENT
 * one: every place that computes `ok` from a key must name both keys.
 */
{
  /* `ok:` in the object literal and `report.ok =` in the probe — both spellings, either
     spacing. Getting this pattern wrong is how the inconsistency survived a review. */
  const oks = [...SRC.matchAll(/(?:^|\s)(?:report\.)?ok\s*[:=]\s*keyPresent[^\n;,]*/g)].map((m) => m[0]);
  ok("every ok computed from a key requires BOTH keys", oks.length >= 2
    && oks.every((line) => /suggestKeyPresent/.test(line)),
    oks.map((l) => l.trim()).join(" · "));
}
ok("a missing suggestion key refuses the live probe too",
  /!keyPresent \|\| !suggestKeyPresent/.test(SRC));

/*
 * And the live half must actually ASK the suggestion provider. Reporting its name while
 * probing only the global one is the same lie with an extra step: `ok: true` on a
 * deployment where every suggestion fails.
 */
ok("the live probe is routed by provider rather than hardcoded",
  /function probe\(which: string, model: string\)/.test(SRC));
ok("and the suggestion provider gets its own probe",
  /probe\(suggestProvider, suggestModel\)/.test(SRC));
ok("which is skipped only when provider AND model both match",
  /suggestProvider === provider && suggestModel === model/.test(SRC));
ok("the live status code follows the combined verdict, not one probe",
  /status: report\.ok \? 200 : 502/.test(SRC));
/* ── the cost machinery, which fails silently everywhere ── */

/**
 * Every part of the cost design has a failure mode that produces no error: a prompt prefix under
 * the cache floor is accepted and not cached, an unset Upstash misses forever, an unverified
 * country rule is still shown. The endpoint has to report them or nobody finds out.
 */
for (const field of ["cachedPrefixTokens", "cacheFloorTokens", "cacheablePrefix", "sharedPackCache", "promptVersion", "rulesVersion"]) {
  ok(`the report includes ${field}`, new RegExp(`${field}[,:]`).test(SRC));
}
ok("the cached prefix is measured against the floor, not assumed",
  /estimateTokens\(CORE_RULES\) >= CACHE_FLOOR_TOKENS/.test(SRC));
/* Three states, not two. "absent" and "live" are the easy ones; the third is the whole point. */
ok("the shared pack cache reports absent rather than pretending",
  /sharedPackCache: !upstash \? "absent" : redis\.ok \? "live" : "configured but unreachable"/.test(SRC));
/* Two env spellings are in circulation and reading only one is a silent downgrade to in-memory
   counting next to a Redis the operator can see in the same browser. */
ok("and names which credential spelling was found, including the half-set case",
  /redisCredentials: redisSource\(\)/.test(SRC));

/*
 * A presence check cannot tell a working store from a revoked token, a wrong URL, or a database
 * deleted from the console. All three read as "configured" and all three behave as "absent".
 */
ok("the store is PINGED, not merely detected", /await redisPing\(\)/.test(SRC));
ok("the ping is not behind the cost gate — it costs nothing",
  SRC.indexOf("await redisPing()") < SRC.indexOf('searchParams.get("live")'));
ok("configured-but-unreachable is its own reported state, not folded into either",
  /configured but unreachable/.test(SRC));
ok("and the rate limiter reports the same distinction",
  /redis unreachable/.test(SRC));
ok("`shared` requires the store to actually answer",
  /shared: upstash && redis\.ok/.test(SRC));

/*
 * Email needs two things and an integration supplies one. With the key and no sender every send is
 * refused before it leaves, silently, while the dashboard shows Resend connected.
 */
ok("email health requires BOTH the key and the sender",
  /ok: redact\("RESEND_API_KEY"\) && redact\("EMAIL_FROM"\)/.test(SRC));
ok("and says so outright when only the key is set",
  /EMAIL_FROM is not — every email is refused/.test(SRC));
ok("the country rules report their own provenance",
  /ruleProvenance\(\)/.test(SRC) && /staleRules\(/.test(SRC));
ok("the budgets are reportable, so a ceiling is never a mystery",
  /budgets: budgets\(\)/.test(SRC));

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
 *   · dropping `suggestKeyPresent` from the live `report.ok`
 *                                                → "every ok computed from a key requires BOTH keys" fails
 *   · replacing `probe(suggestProvider, …)` with `probe(provider, …)`
 *                                                → "the suggestion provider gets its own probe" fails
 */

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
