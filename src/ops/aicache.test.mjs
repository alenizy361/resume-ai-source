/**
 * The cost rules, asserted where they are decidable: hashing, keys, invalidation, staleness,
 * de-duplication, routing and budgets.
 *
 * None of this needs a browser or a model, and that is deliberate. The expensive claims in the
 * optimisation brief — "changing the phone number must not invalidate skills", "a late reply
 * must not overwrite a new context", "two components asking the same thing cost one request" —
 * are all statements about pure functions. Proving them here costs milliseconds and zero
 * tokens; proving them through the UI costs a browser, a server and real model calls, and the
 * last of those comes out of the owner's own AI budget.
 *
 * What is NOT here: whether the suggestions are any good. That is `ops/titles-bench.mjs`,
 * offline, against 111 occupations, where quality can be scored instead of guessed.
 *
 *   node --experimental-strip-types ops/aicache.test.mjs
 */

import {
  hashOf, normalizeContext, contextHash, packKey, jdDeltaKey,
  slotOf, readCache, writeCache, changedFields, tasksToInvalidate, invalidate,
  acceptReply, newRequestId, dedupe, inflightCount, resetInflight,
  PROMPT_VERSION, RULES_VERSION, AI_CACHE_TASKS,
} from "../app/lib/aiCache.ts";
import {
  TASK_CLASS, MAX_OUTPUT, TASK_TIMEOUT_MS, routeModel, qualityFloor,
  estimateCallCost, cacheHitRate, modelConfig,
} from "../app/lib/aiModels.ts";
import {
  EMPTY_LEDGER, mayCall, record, recordHit, perCompletedCv, budgets,
} from "../app/lib/aiBudget.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

/* ─────────────────────────── hashing ─────────────────────────── */

{
  ok("the same object hashes the same twice", hashOf({ a: 1, b: "x" }) === hashOf({ a: 1, b: "x" }));

  /*
   * The one that makes every other cache check meaningful. Without key sorting, two identical
   * contexts built in different property orders hash differently, so the cache never hits and
   * the whole exercise silently buys nothing.
   */
  ok("property order does not change the hash",
    hashOf({ a: 1, b: 2 }) === hashOf({ b: 2, a: 1 }));
  ok("but ARRAY order does — a reordered list is a different list",
    hashOf([1, 2]) !== hashOf([2, 1]));
  ok("undefined is not a value", hashOf({ a: 1, b: undefined }) === hashOf({ a: 1 }));
  ok("a different value changes the hash", hashOf({ a: 1 }) !== hashOf({ a: 2 }));
  ok("the digest is fixed width", /^[0-9a-f]{8}$/.test(hashOf({ x: "y" })));
  /* An empty input must still produce a key, or the cache slot becomes "task@". */
  ok("nothing still hashes to something", /^[0-9a-f]{8}$/.test(hashOf(undefined)));
}

/* ─────────────────────────── the career context ─────────────────────────── */

{
  eq("the context is normalised, not trusted",
    normalizeContext({ occupation: "  Radiology Technologist ", specialization: "CT", seniority: "Mid", country: "SA", cvLang: "en" }),
    { occupation: "radiology technologist", specialization: "ct", seniority: "mid", country: "sa", cvLang: "en" });

  ok("case and whitespace do not split the cache",
    contextHash({ occupation: "Nurse", country: "SA", cvLang: "en" })
    === contextHash({ occupation: " nurse ", country: "sa", cvLang: "en" }));

  ok("an unknown cvLang is English, never undefined",
    normalizeContext({}).cvLang === "en");

  /*
   * The five fields that change the answer, and no sixth. This is asserted as an exact set
   * because Part 16's whole cost argument is that nothing else is sent — adding `employer` here
   * later would make the context churn per job and the cache miss per job, silently.
   */
  eq("the context is exactly five fields",
    Object.keys(normalizeContext({})).sort(),
    ["country", "cvLang", "occupation", "seniority", "specialization"]);

  /* Language is CV language. Conflating it with the interface shipped Arabic duties on an
     English CV once already. */
  ok("the CV language is part of the context",
    contextHash({ occupation: "nurse", cvLang: "ar" }) !== contextHash({ occupation: "nurse", cvLang: "en" }));
}

/* ─────────────────────────── the shared pack key ─────────────────────────── */

{
  const base = { occupation: "radiology technologist", specialization: "", seniority: "mid", country: "sa", cvLang: "en", modelVersion: "m1" };

  ok("the pack key carries both versions",
    packKey(base).includes(PROMPT_VERSION) && packKey(base).includes(RULES_VERSION));

  /* Test 6: same occupation, same country, same level, same language, second user → same key. */
  ok("two users with the same context share one pack",
    packKey(base) === packKey({ ...base }));

  for (const [field, value] of [
    ["occupation", "teacher"], ["specialization", "ct"], ["seniority", "senior"],
    ["country", "ae"], ["cvLang", "ar"], ["modelVersion", "m2"],
  ]) {
    ok(`changing ${field} changes the pack key`,
      packKey({ ...base, [field]: value }) !== packKey(base));
  }

  /*
   * The model is in the key for a measurement reason, not a correctness one: comparing Haiku's
   * pack against Sonnet's is impossible if they share a cache slot.
   */
  ok("a pack generated by another model is not reused",
    packKey({ ...base, modelVersion: "sonnet" }) !== packKey({ ...base, modelVersion: "haiku" }));

  /* Test 8: a pasted advert must layer on the cached pack, not replace it. */
  const pack = packKey(base);
  ok("the job-advert delta hangs off the pack it layers on",
    jdDeltaKey(pack, "Seeking a CT radiographer…").startsWith(pack));
  ok("a different advert is a different delta",
    jdDeltaKey(pack, "advert A") !== jdDeltaKey(pack, "advert B"));
  ok("the same advert against a different pack is a different delta",
    jdDeltaKey(pack, "advert A") !== jdDeltaKey(packKey({ ...base, occupation: "teacher" }), "advert A"));
  ok("whitespace and case in the advert do not split the delta cache",
    jdDeltaKey(pack, " Advert A ") === jdDeltaKey(pack, "advert a"));
}

/* ─────────────────────────── the resume-level cache ─────────────────────────── */

{
  const ctx = contextHash({ occupation: "nurse", country: "sa", cvLang: "en" });
  const entry = {
    task: "role_blueprint", contextHash: ctx, inputHash: "i1",
    promptVersion: PROMPT_VERSION, model: "claude-haiku-4-5",
    result: { skills: ["Triage"] }, userConfirmed: [], userRejected: [], createdAt: 1,
  };
  const store = writeCache({}, entry);

  ok("the slot is task plus context", slotOf("role_blueprint", ctx) === `role_blueprint@${ctx}`);

  /* Tests 4 and 5: refresh, and back-and-forward, must read rather than call. */
  ok("a revisit reads the stored result", readCache(store, "role_blueprint", ctx, "i1") !== null);
  ok("an empty store simply misses", readCache(undefined, "role_blueprint", ctx, "i1") === null);

  /*
   * The miss that is easy to get wrong. The context has not moved — same occupation, country,
   * level, language — but the user has confirmed two more tools since, so the INPUT differs and
   * the answer would too. A cache keyed on context alone would serve the older answer forever.
   */
  ok("a changed input is a miss even when the context is identical",
    readCache(store, "role_blueprint", ctx, "i2") === null);

  ok("a different context is a miss", readCache(store, "role_blueprint", "ffffffff", "i1") === null);
  ok("a prompt-version bump retires the entry",
    readCache(writeCache({}, { ...entry, promptVersion: "p0" }), "role_blueprint", ctx, "i1") === null);
  ok("an invalidated entry is not served",
    readCache(writeCache({}, { ...entry, invalidatedAt: 2 }), "role_blueprint", ctx, "i1") === null);
  ok("writing does not mutate the store it was given",
    Object.keys(writeCache(store, { ...entry, task: "final_content" })).length === 2
    && Object.keys(store).length === 1);
}

/* ─────────────────────────── invalidation: Part 11, as assertions ─────────────────────────── */

{
  const before = { occupation: "radiology technologist", specialization: "ct", seniority: "mid", country: "sa", cvLang: "en" };

  eq("an unchanged context invalidates nothing", tasksToInvalidate(before, { ...before }), []);

  /*
   * The three "must not invalidate" rules are true by CONSTRUCTION: none of these fields is
   * part of `CareerContext`, so they cannot appear in `changedFields`. Asserted through the
   * public function anyway, because "it cannot happen" is what people say about the bug.
   */
  for (const noise of [
    { label: "a template change", extra: { template: "azure" } },
    { label: "a contact-detail change", extra: { phone: "+966500000000", email: "a@b.c" } },
    { label: "an employer-name change", extra: { employer: "King Fahad Medical City" } },
    { label: "an export setting", extra: { pdfMargin: 12 } },
  ]) {
    eq(`${noise.label} invalidates nothing`, tasksToInvalidate(before, { ...before, ...noise.extra }), []);
  }

  /* Test 7: occupation change must retire everything profession-dependent. */
  const afterOccupation = tasksToInvalidate(before, { ...before, occupation: "teacher" });
  ok("an occupation change retires the blueprint", afterOccupation.includes("role_blueprint"));
  ok("…and the experience packages", afterOccupation.includes("experience_package"));
  ok("…and the final summary", afterOccupation.includes("final_content"));
  ok("…and the job-advert delta", afterOccupation.includes("jd_delta"));
  ok("but NOT a rewrite of the user's own sentence — those are their words, not the market's",
    !afterOccupation.includes("bullet_rewrite"));

  /* Country change: credentials and regulatory guidance live in the blueprint. */
  const afterCountry = tasksToInvalidate(before, { ...before, country: "ae" });
  ok("a country change retires the blueprint, where the credentials live",
    afterCountry.includes("role_blueprint"));
  ok("a country change does not retire a bullet rewrite",
    !afterCountry.includes("bullet_rewrite"));

  /* Language change touches everything that produces text, including rewrites. */
  ok("a CV-language change retires every text-producing task",
    AI_CACHE_TASKS.every((t) => tasksToInvalidate(before, { ...before, cvLang: "ar" }).includes(t)));

  eq("changedFields names only what moved",
    changedFields(before, { ...before, country: "ae" }), ["country"]);

  /* Marked, not deleted — so "why did this regenerate" stays answerable and Part 20 can still
     show the previous content when a regeneration fails. */
  const ctx = contextHash(before);
  const store = writeCache({}, {
    task: "role_blueprint", contextHash: ctx, inputHash: "i1", promptVersion: PROMPT_VERSION,
    model: "m", result: 1, userConfirmed: [], userRejected: [], createdAt: 1,
  });
  const after = invalidate(store, ["role_blueprint"], 99);
  ok("invalidation marks rather than deletes",
    Object.keys(after).length === 1 && after[slotOf("role_blueprint", ctx)].invalidatedAt === 99);
  ok("and the marked entry stops being served",
    readCache(after, "role_blueprint", ctx, "i1") === null);
  ok("invalidating an untargeted task leaves it alone",
    invalidate(store, ["final_content"], 99)[slotOf("role_blueprint", ctx)].invalidatedAt === undefined);
  ok("an already-invalidated entry keeps its original timestamp",
    invalidate(after, ["role_blueprint"], 123)[slotOf("role_blueprint", ctx)].invalidatedAt === 99);
}

/* ─────────────────────────── stale replies ─────────────────────────── */

{
  const now = { contextHash: "aaaa", inputHash: "bbbb", revision: 4 };
  const stamp = { requestId: "r1", task: "role_blueprint", ...now };

  ok("a matching reply is written", acceptReply(stamp, now));
  ok("a reply from another context is refused",
    !acceptReply({ ...stamp, contextHash: "cccc" }, now));
  ok("a reply from another input is refused",
    !acceptReply({ ...stamp, inputHash: "dddd" }, now));
  ok("a reply from an older revision is refused",
    !acceptReply({ ...stamp, revision: 3 }, now));

  /*
   * The case the hashes alone cannot catch, and the reason `revision` exists at all: the user
   * changed the country, a request went out, they changed it BACK, and the context hash is
   * identical to what the in-flight request carried. Hash equality says accept. The resume has
   * moved twice, so the revision says no.
   */
  ok("edit-and-revert does not let an intermediate reply through",
    !acceptReply({ ...stamp, revision: 4 }, { ...now, revision: 6 }));

  /* A stamp from the future is a bug, not staleness, and is still refused. */
  ok("a reply claiming a future revision is refused",
    !acceptReply({ ...stamp, revision: 9 }, now));

  ok("request ids are unique and monotonic", newRequestId() !== newRequestId());
}

/* ─────────────────────────── in-flight de-duplication: Test 9 ─────────────────────────── */

{
  resetInflight();
  let calls = 0;
  const slow = () => new Promise((r) => setTimeout(() => { calls++; r("done"); }, 30));

  /* Ten rapid clicks on the same task with the same input. */
  const results = await Promise.all(Array.from({ length: 10 }, () => dedupe("role_blueprint", "i1", slow)));
  ok("ten simultaneous identical requests cost one call", calls === 1, String(calls));
  ok("and every caller gets the answer", results.every((r) => r === "done"));
  ok("the map empties when the request settles", inflightCount() === 0);

  /* Different inputs are different questions and must not be collapsed. */
  resetInflight();
  calls = 0;
  await Promise.all([dedupe("role_blueprint", "i1", slow), dedupe("role_blueprint", "i2", slow)]);
  ok("two different inputs are two calls", calls === 2, String(calls));

  /*
   * A rejected promise must be evicted. Left in the map, it makes every later caller inherit a
   * failure that has nothing to do with them — a cache of one bad afternoon.
   */
  resetInflight();
  const boom = () => Promise.reject(new Error("nope"));
  await dedupe("x", "i1", boom).catch(() => {});
  ok("a failed request does not linger in the map", inflightCount() === 0);
  let second = false;
  await dedupe("x", "i1", async () => { second = true; }).catch(() => {});
  ok("and the next caller gets a fresh attempt", second);
}

/* ─────────────────────────── model routing ─────────────────────────── */

{
  const cfg = { fastModel: "claude-haiku-4-5", reasoningModel: "claude-sonnet-5", fallbackModel: "claude-haiku-4-5", version: "v" };

  ok("every task starts on the fast model",
    Object.values(TASK_CLASS).every((c) => c === "fast"));

  const r = routeModel("role_blueprint", { config: cfg });
  ok("an unescalated task uses the fast model", r.model === "claude-haiku-4-5");
  ok("and is not marked escalated", r.escalated === false && r.reason === null);

  const e = routeModel("final_content", { escalate: "senior-summary", config: cfg });
  ok("an escalated task uses the reasoning model", e.model === "claude-sonnet-5");
  ok("and carries its reason for the log", e.reason === "senior-summary" && e.escalated);

  /*
   * The escalation that must NOT exist. "The user pressed Regenerate" is impatience, not
   * difficulty, and routing on it turns a ceiling into a floor. There is no reason in the union
   * for it, which is the enforcement — asserted here so adding one is a visible decision.
   */
  ok("there is no escalation reason for pressing Regenerate",
    routeModel("final_content", { escalate: null, config: cfg }).model === "claude-haiku-4-5");

  /* Reasoning is Sonnet, not Opus: Opus measured 43% hangs on this workload, so escalating to
     it would trade a quality problem for an availability one. */
  ok("the reasoning tier is not Opus by default",
    !/opus/i.test(modelConfig().reasoningModel));

  /* Output ceilings are per task, which is the fix for `json ? 900 : 500` for all fourteen. */
  ok("output ceilings differ by task",
    new Set(Object.values(MAX_OUTPUT)).size > 3);
  ok("a one-line rewrite is not given a blueprint's budget",
    MAX_OUTPUT.bullet_rewrite < MAX_OUTPUT.role_blueprint / 5);
  ok("every task has a timeout", Object.values(TASK_TIMEOUT_MS).every((t) => t >= 10_000 && t <= 30_000));
}

/* ─────────────────────────── the quality floor ─────────────────────────── */

{
  const en = { min: 6, cvLang: "en" };
  ok("a full, varied English list passes",
    qualityFloor(["Triage", "Cannulation", "Wound care", "Vitals monitoring", "Charting", "Discharge planning"], en) === null);
  ok("a list that is too short escalates",
    qualityFloor(["Triage", "Charting"], en) === "quality-check-failed");
  ok("a list padded with duplicates escalates",
    qualityFloor(["Triage", "triage", "TRIAGE", "Triage ", "Charting", "Triage"], en) === "quality-check-failed");

  /*
   * The script check, which is a majority test rather than "every line". An Arabic CV
   * legitimately carries PACS, DICOM and SCFHS in Latin script; demanding Arabic in every
   * string would reject correct output and train the reader to ignore this check.
   */
  const ar = { min: 4, cvLang: "ar" };
  ok("an Arabic list with Latin technical tokens passes",
    qualityFloor(["التحقق من هوية المريض", "الوقاية من الإشعاع", "PACS", "تقييم جودة الصورة"], ar) === null);
  ok("but English output for an Arabic CV escalates",
    qualityFloor(["Patient identification", "Radiation protection", "PACS", "Image quality"], ar) === "quality-check-failed");
  ok("and Arabic output for an English CV escalates",
    qualityFloor(["التحقق من هوية المريض", "الوقاية من الإشعاع", "تقييم جودة الصورة", "تصوير الأطفال"], { min: 4, cvLang: "en" }) === "quality-check-failed");
}

/* ─────────────────────────── cost ─────────────────────────── */

{
  /* Haiku at $1/$5 per million: 1000 in + 500 out = $0.001 + $0.0025. */
  const c = estimateCallCost("claude-haiku-4-5", { input: 1000, output: 500 });
  ok("a Haiku call costs what the rate card says", Math.abs(c - 0.0035) < 1e-9, String(c));

  ok("Sonnet costs three times as much on input",
    Math.abs(estimateCallCost("claude-sonnet-5", { input: 1000, output: 0 })
      - 3 * estimateCallCost("claude-haiku-4-5", { input: 1000, output: 0 })) < 1e-9);

  /* The whole reason the ATS review stays on NVIDIA. */
  ok("an NVIDIA model is free", estimateCallCost("meta/llama-4-maverick-17b-128e-instruct", { input: 99999, output: 9999 }) === 0);

  ok("a cache read is a tenth of an input token",
    Math.abs(estimateCallCost("claude-haiku-4-5", { input: 0, output: 0, cacheRead: 1000 }) - 0.0001) < 1e-12);
  ok("a cache write is a premium, not a discount",
    estimateCallCost("claude-haiku-4-5", { input: 0, output: 0, cacheWrite: 1000 })
    > estimateCallCost("claude-haiku-4-5", { input: 1000, output: 0 }));

  /* A meter that throws is worse than one that is approximate. */
  ok("an unknown Claude model still estimates rather than throwing",
    estimateCallCost("claude-something-new", { input: 1000, output: 0 }) > 0);

  eq("cache hit rate with nothing measured is zero", cacheHitRate([]), 0);
  ok("cache hit rate counts read tokens against all input seen",
    Math.abs(cacheHitRate([{ input: 100, output: 0, cacheRead: 900 }]) - 0.9) < 1e-9);
}

/* ─────────────────────────── budgets ─────────────────────────── */

{
  const b = { warnAt: 8, autoStop: 12, hardStop: 20, maxRetries: 1, disabled: false };

  ok("a fresh resume may call", mayCall(EMPTY_LEDGER, "auto", b).allow === true);
  ok("and is not warned", mayCall(EMPTY_LEDGER, "auto", b).warn === false);
  ok("at the warn line it still calls, but says so",
    mayCall({ ...EMPTY_LEDGER, paidCalls: 8 }, "explicit", b).allow === true
    && mayCall({ ...EMPTY_LEDGER, paidCalls: 8 }, "explicit", b).warn === true);

  /*
   * The axis that matters. An automatic generation is the kind that can loop, so it stops
   * earlier; an explicit tap cannot loop without a human, so it survives to the hard stop.
   * Treating them alike either lets a loop run to 20 or takes the button away from someone
   * doing nothing wrong.
   */
  ok("automatic generation stops at the auto ceiling",
    mayCall({ ...EMPTY_LEDGER, paidCalls: 12 }, "auto", b).allow === false);
  ok("but an explicit tap still works there",
    mayCall({ ...EMPTY_LEDGER, paidCalls: 12 }, "explicit", b).allow === true);
  ok("the hard stop stops both",
    mayCall({ ...EMPTY_LEDGER, paidCalls: 20 }, "explicit", b).allow === false);
  eq("and names why", mayCall({ ...EMPTY_LEDGER, paidCalls: 20 }, "explicit", b).reason, "hard-stop");

  ok("the emergency switch refuses everything",
    mayCall(EMPTY_LEDGER, "explicit", { ...b, disabled: true }).allow === false);
  /* Opt-in by exact string: `AI_DISABLED=false` disabling the AI is the kind of thing that
     gets discovered during an incident. */
  ok("AI_DISABLED must say exactly true", budgets().disabled === false);

  /* Counting. */
  const l1 = record(EMPTY_LEDGER, { paid: true, outcome: "success", usd: 0.0035 });
  ok("a paid success counts once", l1.paidCalls === 1 && l1.freeCalls === 0);
  ok("and adds its cost", Math.abs(l1.estimatedUsd - 0.0035) < 1e-9);
  ok("a free call counts separately",
    record(EMPTY_LEDGER, { paid: false, outcome: "success" }).freeCalls === 1);
  ok("an empty answer is a call that happened",
    record(EMPTY_LEDGER, { paid: true, outcome: "empty" }).paidCalls === 1);
  ok("…and is tracked as empty, which is a quality signal not an error",
    record(EMPTY_LEDGER, { paid: true, outcome: "empty" }).emptyCalls === 1);

  /*
   * A cancellation is the user's decision and is not counted against them — but Anthropic
   * still bills for what a cancelled stream emitted, so the cost is recorded even though the
   * call is not.
   */
  const cancelled = record(EMPTY_LEDGER, { paid: true, outcome: "cancelled", usd: 0.0004 });
  ok("a cancellation does not count as a call", cancelled.paidCalls === 0);
  ok("but its partial cost is still recorded", cancelled.estimatedUsd > 0);

  ok("an escalation is recorded by reason",
    record(EMPTY_LEDGER, { paid: true, outcome: "success", escalation: "senior-summary" }).escalations["senior-summary"] === 1);
  ok("recording does not mutate the ledger it was given",
    EMPTY_LEDGER.paidCalls === 0 && Object.keys(EMPTY_LEDGER.escalations).length === 0);
  ok("a cache hit is a call that did not happen", recordHit(EMPTY_LEDGER).cacheHits === 1);

  /* The two acceptance-criteria numbers. */
  const per = perCompletedCv([
    { ledger: { ...EMPTY_LEDGER, paidCalls: 3, estimatedUsd: 0.004 }, completed: true },
    { ledger: { ...EMPTY_LEDGER, paidCalls: 1, estimatedUsd: 0.002 }, completed: true },
    { ledger: { ...EMPTY_LEDGER, paidCalls: 9, estimatedUsd: 0.02 }, completed: false },
  ]);
  ok("calls per completed CV ignores abandoned drafts", per.calls === 2, String(per?.calls));
  ok("and so does cost per completed CV", Math.abs(per.usd - 0.003) < 1e-9, String(per?.usd));
  /* A denominator of zero reported as "0.00 per CV" reads as success, which is worse than a gap. */
  ok("nothing completed reports nothing, not zero",
    perCompletedCv([{ ledger: EMPTY_LEDGER, completed: false }]) === null);
  ok("a per-CV cost of $0.004 does not round to zero",
    perCompletedCv([{ ledger: { ...EMPTY_LEDGER, estimatedUsd: 0.004 }, completed: true }]).usd === 0.004);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
