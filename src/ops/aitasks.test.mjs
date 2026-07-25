/**
 * The AI orchestration layer, driven with a stub `fetch`.
 *
 * Every rule in `runTask` is a policy someone could reasonably have written the other way,
 * which means every one of them needs an assertion or it is just a comment. The ones that
 * matter most are the ones that cost real money when wrong:
 *
 *   - a 429 must NEVER be retried. Retrying a rate limit spends the user's own metered
 *     credit to be told "no" a second time, and turns a throttle into a block.
 *   - a 4xx must never be retried either. The request was wrong; sending it again is
 *     wrong twice.
 *   - a timeout is an ERROR, not a cancellation. Nobody chose it.
 *   - `empty` is a successful call that produced nothing. Reporting it as a failure is how
 *     users learn to ignore failures.
 *
 * Not one real request is made. `fetchImpl` and `sleep` are injected, so the whole suite
 * runs in milliseconds and costs nothing — which is the point, because the last live round
 * of a hundred calls came out of the owner's AI budget.
 *
 *   node --experimental-strip-types ops/aitasks.test.mjs
 */

import {
  TASKS, TASK_NAMES, runTask, bucketOf,
} from "../app/lib/aiTasks.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/** A fetch that answers however the test says, and counts how often it was asked. */
function stub(answers) {
  const calls = [];
  const list = Array.isArray(answers) ? [...answers] : [answers];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const a = list.length > 1 ? list.shift() : list[0];
    if (typeof a === "function") return a(url, init);
    return {
      ok: a.status === undefined ? true : a.status < 400,
      status: a.status ?? 200,
      json: async () => a.json ?? {},
    };
  };
  impl.calls = calls;
  return impl;
}

const noSleep = async () => {};

/* ─────────────────────── the registry ─────────────────────── */

ok("there are fourteen task types", TASK_NAMES.length === 14, String(TASK_NAMES.length));

{
  const bad = TASK_NAMES.filter((n) => {
    const s = TASKS[n];
    return !s.endpoint.startsWith("/api/") || s.name !== n
      || typeof s.validate !== "function" || typeof s.body !== "function" || typeof s.parse !== "function"
      || !(s.timeoutMs > 0) || !(s.retries >= 0);
  });
  ok("every task declares an endpoint, a schema pair, a timeout and a retry count",
    bad.length === 0, bad.join(" · "));
}

{
  // A task whose name and key disagree would be dispatched by key and logged by name.
  const mismatched = TASK_NAMES.filter((n) => TASKS[n].name !== n);
  ok("no task's key disagrees with its own name", mismatched.length === 0, mismatched.join(" · "));
}

{
  /*
   * The token-spending endpoints must not retry on a whim.
   *
   * `/api/suggest` calls cost model tokens, so their retry budget is zero by default: a
   * transient 500 there is better surfaced than silently paid for twice. The three
   * non-suggest tasks may retry, because a page fetch and an upload cost nothing and a
   * review is worth waiting through.
   */
  const suggestRetries = TASK_NAMES
    .filter((n) => TASKS[n].bucket === "suggest")
    .filter((n) => TASKS[n].retries !== 0);
  ok("no token-spending task retries by default", suggestRetries.length === 0, suggestRetries.join(" · "));
  ok("the job-link fetch does retry, because it costs no tokens", TASKS.job_ad_fetch.retries === 2);
  ok("the upload does not retry, because the upload is the expensive part", TASKS.cv_extract.retries === 0);
}

{
  const short = TASK_NAMES.filter((n) => TASKS[n].timeoutMs < 5_000);
  ok("no timeout is short enough to kill a working call", short.length === 0, short.join(" · "));
  ok("the ATS review gets the longest wait",
    TASKS.ats_review.timeoutMs === Math.max(...TASK_NAMES.map((n) => TASKS[n].timeoutMs)));
}

/* ─────────────────────── the CV's language ─────────────────────── */

{
  /*
   * The bug this product has paid for twice: passing the INTERFACE language to something
   * that writes CV content. An Arabic-speaking applicant building an English CV is the
   * normal case here, and every task that produces resume text has to follow `cvLang`.
   */
  const wrong = [];
  for (const n of TASK_NAMES) {
    const spec = TASKS[n];
    if (spec.bucket !== "suggest") continue;
    const body = spec.body({ lang: "ar", cvLang: "en", targetRole: "x", role: "x", current: "x", question: "x" });
    if (body.lang !== "en") wrong.push(n);
  }
  ok("every suggest task sends the CV's language, not the interface's",
    wrong.length === 0, wrong.join(" · "));
}

/* ─────────────────────── validation happens first ─────────────────────── */

{
  const f = stub({ json: { text: "hello" } });
  const r = await runTask("duty_improve", { current: "" }, { fetchImpl: f, sleep: noSleep });
  ok("an empty field is refused before any request", r.state === "error" && f.calls.length === 0,
    `${r.state}, ${f.calls.length} calls`);
  ok("and the refusal names what is missing", r.code === "no-current-text", r.code);
}

{
  const f = stub({ json: { text: "x" } });
  const r = await runTask("job_ad_fetch", { url: "not a url" }, { fetchImpl: f, sleep: noSleep });
  ok("a malformed URL never reaches the fetcher", r.state === "error" && f.calls.length === 0);
}

{
  const f = stub({ json: {} });
  const r = await runTask("ats_review", { resume: "too short" }, { fetchImpl: f, sleep: noSleep });
  ok("a CV too short to score is refused locally", r.code === "cv-too-short" && f.calls.length === 0);
}

/* ─────────────────────── the four outcomes ─────────────────────── */

{
  const r = await runTask("duties_draft", { role: "Radiographer" }, {
    fetchImpl: stub({ json: { items: ["Performed CT", " ", "Positioned patients"] } }), sleep: noSleep,
  });
  ok("a good answer is success", r.state === "success");
  ok("and blank items are dropped on the way through",
    Array.isArray(r.data) && r.data.length === 2, JSON.stringify(r.data));
}

{
  const r = await runTask("duties_draft", { role: "x" }, {
    fetchImpl: stub({ json: { items: [] } }), sleep: noSleep,
  });
  ok("a 200 with an empty list is EMPTY, not an error", r.state === "empty" && !r.error, r.state);
}

{
  const r = await runTask("duties_draft", { role: "x" }, {
    fetchImpl: stub({ json: { unexpected: true } }), sleep: noSleep,
  });
  ok("a 200 in the wrong shape is empty rather than a crash", r.state === "empty");
}

{
  const r = await runTask("duties_draft", { role: "x" }, {
    fetchImpl: stub({ status: 400, json: { error: "Fill in the role first." } }), sleep: noSleep,
  });
  ok("a 4xx is an error", r.state === "error");
  ok("and the server's own sentence is what the user sees",
    r.error === "Fill in the role first.", r.error);
}

/* ─────────────────────── the 429 rule ─────────────────────── */

{
  const f = stub({ status: 429, json: { error: "Slow down a little — try again in a minute." } });
  const r = await runTask("duties_draft", { role: "x" }, { fetchImpl: f, sleep: noSleep });
  ok("a 429 is flagged as throttled, separately from failure", r.throttled === true);
  ok("a 429 is asked EXACTLY ONCE — retrying a rate limit spends credit to be refused again",
    f.calls.length === 1, `${f.calls.length} calls`);
  ok("and the route's own wording is preserved",
    r.error === "Slow down a little — try again in a minute.", r.error);
}

{
  // Even on a task that IS allowed to retry, a 429 must not be one of the reasons.
  const f = stub({ status: 429, json: { error: "slow down" } });
  const r = await runTask("job_ad_fetch", { url: "https://example.com/job" }, { fetchImpl: f, sleep: noSleep });
  ok("a retrying task still asks once on a 429", f.calls.length === 1 && r.throttled === true,
    `${f.calls.length} calls`);
}

/* ─────────────────────── retries ─────────────────────── */

{
  const f = stub({ status: 500, json: { error: "boom" } });
  const r = await runTask("duties_draft", { role: "x" }, { fetchImpl: f, sleep: noSleep });
  ok("a token-spending task does not retry a 500", f.calls.length === 1 && r.state === "error",
    `${f.calls.length} calls`);
}

{
  const f = stub({ status: 500, json: { error: "boom" } });
  await runTask("job_ad_fetch", { url: "https://example.com/j" }, { fetchImpl: f, sleep: noSleep });
  ok("a task with two retries makes three attempts on a 500", f.calls.length === 3, `${f.calls.length}`);
}

{
  // Recovering mid-retry must produce a success, not a late error.
  let n = 0;
  const f = stub(async () => {
    n++;
    return n < 3
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ text: "the advert" }) };
  });
  const r = await runTask("job_ad_fetch", { url: "https://example.com/j" }, { fetchImpl: f, sleep: noSleep });
  ok("a retry that succeeds returns success", r.state === "success" && r.data === "the advert", r.state);
}

{
  // A thrown network fault, not an HTTP status.
  let n = 0;
  const f = stub(async () => { n++; if (n < 2) throw new Error("ECONNRESET"); return { ok: true, status: 200, json: async () => ({ text: "ok" }) }; });
  const r = await runTask("job_ad_fetch", { url: "https://example.com/j" }, { fetchImpl: f, sleep: noSleep });
  ok("a dropped connection is retried like a 5xx", r.state === "success", `${r.state} ${r.error ?? ""}`);
}

/* ─────────────────────── cancellation vs timeout ─────────────────────── */

{
  const ctrl = new AbortController();
  ctrl.abort();
  const f = stub({ json: { text: "x" } });
  const r = await runTask("duty_improve", { current: "a line" }, { fetchImpl: f, sleep: noSleep, signal: ctrl.signal });
  ok("an already-cancelled run never asks", r.state === "cancelled" && f.calls.length === 0);
  ok("and a cancellation carries no error text for the user to read", !r.error);
}

{
  const ctrl = new AbortController();
  const f = stub(async (_u, init) => new Promise((_res, rej) => {
    init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }));
  const p = runTask("duty_improve", { current: "a line" }, { fetchImpl: f, sleep: noSleep, signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 10);
  const r = await p;
  ok("cancelling mid-flight is `cancelled`, not `error`", r.state === "cancelled", `${r.state} ${r.error ?? ""}`);
}

{
  /*
   * A timeout is an error, and this is the assertion that separates the two.
   *
   * The runner aborts its own controller on the deadline, so the rejection it catches looks
   * identical to a user cancellation — which is why it tracks WHICH happened rather than
   * inferring it. Driven with a one-tick timeout against a request that never resolves.
   */
  const spec = TASKS.duty_improve;
  const original = spec.timeoutMs;
  spec.timeoutMs = 20;
  const f = stub(async (_u, init) => new Promise((_res, rej) => {
    init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }));
  const r = await runTask("duty_improve", { current: "a line" }, { fetchImpl: f, sleep: noSleep });
  spec.timeoutMs = original;
  ok("a timeout is an ERROR, because nobody chose it", r.state === "error", r.state);
  ok("and it says so", r.code === "timeout", r.code);
}

/* ── machine codes must never be mistaken for prose ──
 *
 * The defect this separation exists for: a 500 with an empty body used to put the literal
 * string "http-500" on screen where a sentence belonged, because `error` carried both the
 * server's words and our internal token. `error` is now the server's words or nothing.
 */
{
  const r = await runTask("duties_draft", { role: "x" }, {
    fetchImpl: stub({ status: 500, json: {} }), sleep: noSleep,
  });
  ok("a failure with no server message sets a code and NO displayable error",
    r.code === "http-500" && r.error === undefined, `code=${r.code} error=${r.error}`);
}

{
  const r = await runTask("duties_draft", { role: "x" }, {
    fetchImpl: stub({ status: 503, json: { error: "Service unavailable." } }), sleep: noSleep,
  });
  ok("a failure WITH a server message keeps both, so the UI can prefer the sentence",
    r.error === "Service unavailable." && r.code === "http-503", `${r.error} / ${r.code}`);
}

{
  const f = stub(async () => { throw new Error("ECONNRESET"); });
  const r = await runTask("duty_improve", { current: "a line" }, { fetchImpl: f, sleep: noSleep });
  ok("a socket error is a code, not a sentence shown to a jobseeker",
    r.code === "network" && r.error === undefined, `code=${r.code} error=${r.error}`);
}

{
  /*
   * The whole-registry version of the rule: run every task against a bodiless 500 and assert
   * that not one of them produces a displayable `error`. Written as a sweep because the
   * per-task assertions above only cover the tasks someone thought to list.
   */
  const leaked = [];
  for (const n of TASK_NAMES) {
    const spec = TASKS[n];
    const input = {
      targetRole: "Radiographer", role: "Radiographer", company: "KFMC",
      current: "a line that is long enough to pass validation comfortably",
      question: "where?", url: "https://example.com/j",
      resume: "x".repeat(80), facts: "y",
      file: typeof File === "undefined" ? undefined : new File(["x"], "cv.pdf"),
    };
    if (spec.validate(input)) continue;                      // cannot be run without a file
    const r = await runTask(n, input, { fetchImpl: stub({ status: 500, json: {} }), sleep: noSleep });
    if (r.error !== undefined) leaked.push(`${n}:${r.error}`);
  }
  ok("no task leaks an internal code as user-facing text", leaked.length === 0, leaked.join(" · "));
}

/* ─────────────────────── the metric two-step ─────────────────────── */

{
  const r = await runTask("duty_metric_ask", { current: "Trained new staff" }, {
    fetchImpl: stub({ json: { question: "How many people?", rewritten: "Trained N new staff" } }), sleep: noSleep,
  });
  ok("the metric task returns a question plus a shape", r.state === "success" && r.data.question.length > 0);
}

{
  /*
   * A rewritten line with no question is the model filling the number in itself — the one
   * thing this product exists not to do. Empty, so nothing can be offered.
   */
  const r = await runTask("duty_metric_ask", { current: "Trained new staff" }, {
    fetchImpl: stub({ json: { rewritten: "Trained 45 new staff" } }), sleep: noSleep,
  });
  ok("a metric answer with no question is refused, not offered", r.state === "empty", r.state);
}

/* ─────────────────────── shapes ─────────────────────── */

{
  const r = await runTask("skills_groups", { targetRole: "Radiology Technologist" }, {
    fetchImpl: stub({ json: { groups: [{ label: "Modalities", items: ["CT", "MRI"] }, { label: "Empty", items: [] }] } }),
    sleep: noSleep,
  });
  ok("groups parse, and a group with no items is dropped",
    r.state === "success" && r.data.length === 1 && r.data[0].items.length === 2, JSON.stringify(r.data));
}

{
  const r = await runTask("summary_variants", { targetRole: "x" }, {
    fetchImpl: stub({ json: { variants: [{ label: "concise", text: "one" }, { label: "x", text: "" }] } }),
    sleep: noSleep,
  });
  ok("variants parse, and a variant with no text is dropped",
    r.state === "success" && r.data.length === 1, JSON.stringify(r.data));
}

/* ─────────────────────── observability ─────────────────────── */

{
  const events = [];
  await runTask("duties_draft", { role: "x" }, {
    fetchImpl: stub({ json: { items: ["a"] } }), sleep: noSleep, onEvent: (e) => events.push(e),
  });
  ok("a run emits start then success", events.map((e) => e.phase).join(",") === "start,success",
    events.map((e) => e.phase).join(","));
  ok("every event names its task and carries a duration",
    events.every((e) => e.task === "duties_draft" && typeof e.ms === "number"));
  /*
   * The logging rule this codebase already holds: integers, never user content. A task
   * event that carried the prompt or the answer would put CV text into telemetry.
   */
  const keys = new Set(events.flatMap((e) => Object.keys(e)));
  ok("and no event field could hold user content",
    [...keys].every((k) => ["task", "phase", "attempt", "ms", "status"].includes(k)),
    [...keys].join(","));
}

{
  const events = [];
  await runTask("job_ad_fetch", { url: "https://example.com/j" }, {
    fetchImpl: stub({ status: 500, json: {} }), sleep: noSleep, onEvent: (e) => events.push(e),
  });
  ok("retries are visible in the event stream",
    events.filter((e) => e.phase === "retry").length === 2,
    events.map((e) => e.phase).join(","));
}

ok("bucketOf reports where a task is charged",
  bucketOf("duties_draft") === "suggest" && bucketOf("ats_review") === "optimize");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
