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
/** `SRC` with comment lines removed, for assertions that must count code and not prose. */
const CODE = SRC.split("\n")
  .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
  .join("\n");
const codeMatches = (re) => CODE.match(re) || [];
/* The free token probe lives beside the other provider code, not in the route — see section 9. */
const TOKEN_SRC = readFileSync("app/lib/aiTokenCount.ts", "utf8");

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
/* Both probes must be bounded. The Anthropic one is allowed longer because it now sends the real
   ~2300-token cached prefix rather than a one-line toy, and a cache WRITE is slower than a read.
   Exact counts, not "at least": a probe added without a timeout has to fail this. */
ok("both probes have a timeout — a health check that can hang is not one",
  (SRC.match(/setTimeout\(\(\) => ctrl\.abort\(\), 1[05]_000\)/g) || []).length === 2);
/* Counted over CODE only. A `max_tokens: 4` mentioned in a comment is documentation, and counting
   it made this assertion fail the moment the escalation probe's rationale was written down — a test
   that punishes explaining yourself is a test that gets deleted. Same rule the secret-leak check
   above uses: skip lines that are comments. */
ok("the probe asks for almost no output", codeMatches(/max_tokens: 4/g).length === 2);

/*
 * The escalation tier gets its own probe, and this is the assertion that would have caught the
 * /api/translate bug. Nothing normally reaches cfg.reasoningModel — escalation needs a low-confidence
 * classification or a schema failure — so a request shape that is wrong for that model sits broken
 * while every dashboard reads green. That is what happened: temperature: 0 to Sonnet 5, HTTP 400 on
 * every escalated translation, unnoticed.
 */
ok("the escalation tier is probed too", /report\.liveEscalation/.test(SRC));
ok("with the reasoning model, not the fast one", /probeAnthropic\(cfg\.reasoningModel\)/.test(SRC));
ok("and skipped when it would duplicate the probe above",
  /cfg\.reasoningModel !== suggestModel/.test(SRC));
/* The probe must send the reasoning directive production sends, or it is testing a different
   request than the one that can break. */
ok("the probe carries the same thinking directive as /api/generate",
  /thinksByDefault\(model\) && canDisableThinking\(model\)/.test(SRC));
ok("and no unguarded temperature, which is the parameter that broke translate",
  !/^\s*temperature: 0,$/m.test(SRC.slice(SRC.indexOf("async function probeAnthropic"))));

/*
 * The probe has to send what production sends.
 *
 * Prompt caching fails silently in two ways — a prefix under the provider's minimum, and a prefix
 * that stopped being byte-identical — and neither produces an error anywhere. A probe with a
 * different prompt SHAPE from the real route cannot see either, so it would report a healthy model
 * on a deployment paying full price for every request.
 */
ok("the live probe sends the same cached prefix as /api/generate",
  /text: CORE_RULES, cache_control: \{ type: "ephemeral" \}/.test(SRC));
ok("and the task schema block with it, as the second breakpoint",
  /TASK_SCHEMA\.role_blueprint \?\? ""/.test(SRC));
ok("it reports whether the prefix was actually SERVED from cache, not merely accepted",
  /promptCached: u\.cacheRead > 0/.test(SRC));
ok("and returns both counts so the difference is visible rather than inferred",
  /cacheReadTokens: u\.cacheRead/.test(SRC) && /cacheWriteTokens: u\.cacheWrite/.test(SRC));
ok("the probe carries its own cost estimate, from the real usage block",
  /estimateCallCost\(model, u\)/.test(SRC));

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
/*
 * A missing key must never be papered over — but "refuse everything" was the wrong way to enforce
 * that, and this assertion used to require it (`!keyPresent || !suggestKeyPresent` → 503, probing
 * neither). The result was that the live diagnostic went dark in exactly the situation it exists
 * for: one provider configured and one not. Found on a preview deployment where ANTHROPIC_API_KEY is
 * present and NVIDIA_API_KEY is production-scoped, so `?live=1` refused to test the working half.
 *
 * So the rule is now about the REPORT rather than the refusal: probe what can be probed, and let the
 * half that cannot say so — by name, with ok false, and with the overall ok still requiring both.
 */
ok("only a total absence of keys refuses outright",
  /if \(!keyPresent && !suggestKeyPresent\)/.test(CODE)
  && !/if \(!keyPresent \|\| !suggestKeyPresent\)/.test(CODE));
ok("a missing global key still probes the suggestion provider",
  /keyPresent\s*\n?\s*\? \{ ran: true, \.\.\.await probe\(provider, model\)/.test(CODE));
ok("and a missing key reports ran:false with ok:false rather than silence",
  (CODE.match(/ran: false, ok: false, note: `No key for the/g) || []).length === 2);
ok("the missing provider is named, so the fix is obvious",
  /No key for the \$\{provider\} provider/.test(CODE)
  && /No key for the \$\{suggestProvider\} provider/.test(CODE));
/* And the escalation probe must not fire without a key either — that would be a 401 reported as a
   broken escalation tier, which is a worse diagnosis than none. */
ok("the escalation probe requires the anthropic key",
  /suggestProvider === "anthropic" && suggestKeyPresent/.test(CODE));

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
/*
 * The floor is per MODEL and is not monotonic — 512 on Opus 5, 4096 on Haiku 4.5. A single
 * constant reported `cacheablePrefix: true` on a deployment where every call paid full price, and
 * the `?live=1` probe caught it with `cacheWriteTokens: 0`. Measuring against the configured
 * model is the fix, and the constant being gone is the assertion.
 */
ok("the prefix is measured against the floor for the CONFIGURED model",
  /cacheFloorFor\(suggestModel\)/.test(SRC));
ok("and not against a single constant",
  !/CACHE_FLOOR_TOKENS/.test(SRC));
ok("the prefix counted includes the task schema, not only the core rules",
  /estimateTokens\(CORE_RULES\) \+ estimateTokens\(TASK_SCHEMA\.role_blueprint/.test(SRC));
ok("and the non-monotonic floor is stated, so nobody infers it",
  /not monotonic/.test(SRC));
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

/* ── 9: the free token probe ── */

console.log("\n── ?tokens=1 measures for nothing, and is not confused with ?live=1 ──");

/*
 * The distinction this protects.
 *
 * `?live=1` sends a real completion and spends the owner's credit, so it carries a warning.
 * `count_tokens` returns a count and no completion, so it bills nothing. Folding the free probe in
 * behind the paid flag would put a spending warning on a free measurement, and nobody runs a probe
 * that says it costs money — the estimate stays in place forever instead.
 */
ok("the token probe has its own flag", /searchParams\.get\("tokens"\) === "1"/.test(SRC));
ok("and does not ride on the paid one",
  !/searchParams\.get\("live"\)[\s\S]{0,200}countTokensReport/.test(SRC));
ok("the report says outright that it bills nothing", /bills nothing|\$0\.00/.test(SRC + TOKEN_SRC));

/*
 * The reason the probe is a library at all. It began inside the route and the secret-leak guard
 * above rejected it — correctly, since it read `process.env.ANTHROPIC_API_KEY` into a function whose
 * return value goes into the response body. Safe as written, and still the wrong shape. So the
 * route must stay clean and the lib must carry the same discipline.
 */
ok("the route delegates rather than reading the key", /await countTokensReport\(\)/.test(SRC));
ok("the route never reads the anthropic key's value",
  !/countTokensReport\(process\.env/.test(SRC));

ok("the probe library exists", TOKEN_SRC.length > 0);
ok("the probe sends the key upstream and nowhere else",
  /"x-api-key": String\(process\.env\.ANTHROPIC_API_KEY\)/.test(TOKEN_SRC));
ok("the probe is timeout-bounded — a health check that can hang is not one",
  /setTimeout\(\(\) => ctrl\.abort\(\), 15_000\)/.test(TOKEN_SRC));
ok("the probe calls count_tokens, not messages",
  TOKEN_SRC.includes("/v1/messages/count_tokens") && !/api\.anthropic\.com\/v1\/messages"/.test(TOKEN_SRC));
/* No `max_tokens`, because there is no completion to cap — its presence would mean this drifted into
   being a real call, which is the one way this probe could start costing money. */
ok("the probe asks for no completion at all", !/max_tokens/.test(TOKEN_SRC));

/* It must measure every model whose floor differs, or it cannot answer the question it exists for:
   the same prefix caches on Sonnet and does not on Haiku. */
for (const m of ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"]) {
  ok(`the probe measures ${m}`, TOKEN_SRC.includes(m));
}
ok("the probe reports the floor verdict, not just a number", /clearsFloor/.test(TOKEN_SRC));
/* And it must show the estimate beside the measurement, so drift between them is visible rather
   than something the reader has to work out. */
ok("the probe shows the estimate next to the measurement", /estimated:/.test(TOKEN_SRC));

/* Two numbers both labelled "the prefix" is what made this report confusing: 2329 for
   role_blueprint next to 2261 for final_content, neither saying which task it meant. */
ok("the prefix figure names its task", /cachedPrefixTask/.test(SRC));
ok("and every task's prefix is reported", /prefixTokensByTask/.test(SRC));
ok("the estimate is labelled an estimate", /prefixTokensEstimated/.test(SRC));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
