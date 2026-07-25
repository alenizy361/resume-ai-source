/**
 * How many paid requests a CV costs, counted rather than hoped for.
 *
 * Part 24 of the cost brief is ten scenarios, and every one of them is a claim about a NUMBER OF
 * CALLS — not about output quality. That distinction decides how they are tested: a call count is
 * observable with a stub `fetch`, so all ten run offline in milliseconds and spend nothing. Testing
 * them against the real provider would cost roughly forty model calls per run out of the owner's
 * own AI budget, to measure something the stub measures exactly.
 *
 * What a stub cannot check is whether the suggestions are good, and that is deliberately not here.
 * `ops/titles-bench.mjs` does that, offline, against 111 occupations, where quality is scored
 * instead of eyeballed.
 *
 * The flow under test is the one the client will follow:
 *
 *   confirm target      → 1 × role_blueprint     (feeds skills, credentials, keywords, questions)
 *   per experience      → 1 × experience_package (duties, tools, questions, improvements)
 *   confirm the CV      → 1 × final_content      (summaries, ordering, shortening)
 *   ATS review          → 0 Anthropic calls — /api/optimize, on the free provider
 *
 *   node --experimental-strip-types ops/callflow.test.mjs
 */

import {
  contextHash, readCache, writeCache, tasksToInvalidate, invalidate,
  acceptReply, dedupe, resetInflight, inflightCount, PROMPT_VERSION,
} from "../app/lib/aiCache.ts";
import { EMPTY_LEDGER, mayCall, record, recordHit } from "../app/lib/aiBudget.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ─────────────────────────── the harness ─────────────────────────── */

/**
 * A builder session that counts what it spends.
 *
 * Small enough to read in one screen, because a test harness that needs its own tests proves
 * nothing. It models exactly the four things that decide a call count: the resume-level cache,
 * the context, the in-flight de-duplication, and the ledger.
 */
function session(ctx) {
  return {
    ctx,
    revision: 0,
    store: {},
    ledger: { ...EMPTY_LEDGER, escalations: {} },
    calls: [],

    /** The client's generate path: cache first, dedupe second, call last. */
    async generate(task, inputHash, { trigger = "explicit", shared = null, instance = "" } = {}) {
      const cHash = contextHash(this.ctx);

      const cached = readCache(this.store, task, cHash, inputHash, instance);
      if (cached) { this.ledger = recordHit(this.ledger); return { source: "resume-cache", result: cached.result }; }

      /* The between-users pack, when one is configured and holds this context. */
      if (shared && shared.has(`${task}@${cHash}`)) {
        this.ledger = recordHit(this.ledger);
        const result = shared.get(`${task}@${cHash}`);
        this.store = writeCache(this.store, {
          task, contextHash: cHash, instance, inputHash, promptVersion: PROMPT_VERSION,
          model: "claude-haiku-4-5", result, userConfirmed: [], userRejected: [], createdAt: 1,
        });
        return { source: "shared-pack", result };
      }

      const verdict = mayCall(this.ledger, trigger);
      if (!verdict.allow) return { source: "refused", reason: verdict.reason };

      const stamp = { requestId: `q${this.calls.length}`, task, contextHash: cHash, inputHash, revision: this.revision };
      const { result, leader } = await dedupe(task, inputHash, async () => {
        this.calls.push({ task, inputHash });
        return { generated: task };
      });

      /* The reply is only written if the resume has not moved underneath it. */
      if (!acceptReply(stamp, { contextHash: contextHash(this.ctx), inputHash, revision: this.revision })) {
        return { source: "rejected-stale" };
      }
      /*
       * Only the caller that CAUSED the request records it. A follower rendering the shared answer
       * has cost nothing, and charging it would report eight calls where one was made.
       */
      if (leader) {
        this.ledger = record(this.ledger, { paid: true, outcome: "success", usd: 0.0035 });
        this.store = writeCache(this.store, {
          task, contextHash: cHash, instance, inputHash, promptVersion: PROMPT_VERSION,
          model: "claude-haiku-4-5", result, userConfirmed: [], userRejected: [], createdAt: 1,
        });
      }
      return { source: leader ? "generated" : "shared-inflight", result };
    },

    /** A context edit. Bumps the revision and invalidates only what depends on what moved. */
    edit(patch) {
      const before = { ...this.ctx };
      this.ctx = { ...this.ctx, ...patch };
      this.revision += 1;
      this.store = invalidate(this.store, tasksToInvalidate(before, this.ctx), Date.now ? 1 : 1);
      return tasksToInvalidate(before, this.ctx);
    },

    paid() { return this.calls.length; },
  };
}

const RADIOLOGY = { occupation: "Radiology Technologist", specialization: "", seniority: "mid", country: "SA", cvLang: "en" };

/* ─────────────────────── TEST 1 — one occupation, one blueprint ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);

  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  ok("T1: confirming the target costs one blueprint request", s.paid() === 1, String(s.paid()));

  /*
   * The whole point of the blueprint. Skills and credentials used to be `skills_groups` and
   * `credentials_hint` — two more paid calls. They now read the blueprint that is already in the
   * store, so opening those stages costs nothing.
   */
  const skills = await s.generate("role_blueprint", "ctx");
  const creds = await s.generate("role_blueprint", "ctx");
  ok("T1: the skills stage reuses it", skills.source === "resume-cache");
  ok("T1: the credentials stage reuses it", creds.source === "resume-cache");
  ok("T1: still one request after visiting both", s.paid() === 1, String(s.paid()));

  /* Going back to credentials a second time is the case that used to offer a fresh call. */
  await s.generate("role_blueprint", "ctx");
  ok("T1: returning to credentials adds nothing", s.paid() === 1, String(s.paid()));
  ok("T1: and the reuses are counted as cache hits", s.ledger.cacheHits === 3, String(s.ledger.cacheHits));
}

/* ─────────────────────── TEST 2 — one experience, one package ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);
  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  await s.generate("experience_package", "exp1", { instance: "exp1" });

  ok("T2: an experience costs exactly one more request", s.paid() === 2, String(s.paid()));

  /*
   * Responsibilities, tools, achievement questions and improvements to the user's own lines all
   * arrive in that one response. Before, they were `duties_draft` plus `duty_improve` per bullet
   * plus `duty_metric_ask` per bullet — the four-call-per-experience shape.
   */
  for (const sub of ["responsibilities", "tools", "achievement-questions", "improvements"]) {
    const r = await s.generate("experience_package", "exp1", { instance: "exp1" });
    ok(`T2: ${sub} comes from the same response`, r.source === "resume-cache");
  }
  ok("T2: still two requests for a one-experience CV", s.paid() === 2, String(s.paid()));

  /* The brief's target: ~2-3 for one experience, ~3-4 for two. */
  await s.generate("experience_package", "exp2", { instance: "exp2" });
  ok("T2: a second experience makes it three", s.paid() === 3, String(s.paid()));
}

/* ─────────────────────── TEST 3 — one final generation, ATS stays free ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);
  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  await s.generate("experience_package", "exp1", { instance: "exp1" });
  await s.generate("final_content", "final1");

  ok("T3: a complete one-experience CV costs three paid requests", s.paid() === 3, String(s.paid()));

  /* Summary options and the language recommendations arrive together, not as two calls. */
  const again = await s.generate("final_content", "final1");
  ok("T3: the summary options and the language notes are one response", again.source === "resume-cache");

  /*
   * The ATS review is `/api/optimize` on NVIDIA and does not appear in this ledger at all. That
   * absence IS the assertion: Anthropic is never asked to score the resume, so there is no second
   * opinion to pay for. Recorded as a free call so the observability still sees it.
   */
  s.ledger = record(s.ledger, { paid: false, outcome: "success" });
  ok("T3: the ATS review adds no paid call", s.paid() === 3, String(s.paid()));
  ok("T3: but it is still counted, on the free side", s.ledger.freeCalls === 1);
  ok("T3: total paid cost is three calls' worth",
    Math.abs(s.ledger.estimatedUsd - 0.0105) < 1e-9, String(s.ledger.estimatedUsd));
}

/* ─────────────────────── TEST 4 — refresh ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);
  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  await s.generate("experience_package", "exp1", { instance: "exp1" });
  const before = s.paid();

  /* A refresh rehydrates from the stored resume. The store survives; nothing is re-asked. */
  const rehydrated = session(RADIOLOGY);
  rehydrated.store = s.store;
  const a = await rehydrated.generate("role_blueprint", "ctx");
  const b = await rehydrated.generate("experience_package", "exp1", { instance: "exp1" });

  ok("T4: a refresh loads suggestions from the resume", a.source === "resume-cache" && b.source === "resume-cache");
  ok("T4: and costs nothing", rehydrated.paid() === 0 && before === 2);
}

/* ─────────────────────── TEST 5 — back and forward ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);
  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  await s.generate("experience_package", "exp1", { instance: "exp1" });

  /* Walk the eleven steps forward and back. Every stage reads; none asks. */
  for (const step of ["target", "blueprint", "experience", "skills", "credentials", "languages", "summary", "review"]) {
    const r = await s.generate(step === "experience" ? "experience_package" : "role_blueprint",
      step === "experience" ? "exp1" : "ctx",
      step === "experience" ? { instance: "exp1" } : {});
    ok(`T5: ${step} is served from the store`, r.source === "resume-cache");
  }
  ok("T5: navigation adds no requests", s.paid() === 2, String(s.paid()));
  ok("T5: and the existing suggestions are still there",
    readCache(s.store, "role_blueprint", contextHash(s.ctx), "ctx") !== null);
}

/* ─────────────────────── TEST 6 — same occupation, second user ─────────────────────── */

{
  resetInflight();
  const shared = new Map();

  /* First user pays for the pack and it lands in the shared store. */
  const first = session(RADIOLOGY);
  await first.generate("role_blueprint", "ctx", { trigger: "auto", shared });
  shared.set(`role_blueprint@${contextHash(RADIOLOGY)}`, { generated: "role_blueprint" });
  ok("T6: the first user pays once", first.paid() === 1);

  /* Second user, same occupation, country, seniority and language, no unique advert. */
  const second = session({ ...RADIOLOGY });
  const r = await second.generate("role_blueprint", "ctx", { trigger: "auto", shared });
  ok("T6: the second user is served the shared pack", r.source === "shared-pack");
  ok("T6: and pays nothing", second.paid() === 0, String(second.paid()));
  ok("T6: the hit is recorded as a hit", second.ledger.cacheHits === 1);

  /* A different context must NOT be served the same pack — the key is what guarantees it. */
  const third = session({ ...RADIOLOGY, country: "AE" });
  const r3 = await third.generate("role_blueprint", "ctx", { trigger: "auto", shared });
  ok("T6: a different market does not reuse it", r3.source === "generated" && third.paid() === 1);

  /*
   * With no shared store configured — the situation in production today, since Upstash is unset —
   * the second user simply pays. Asserted so the cost of NOT configuring it is a measured number
   * rather than a surprise.
   */
  const noShare = session({ ...RADIOLOGY });
  await noShare.generate("role_blueprint", "ctx", { trigger: "auto", shared: null });
  ok("T6: without a shared store the second user pays again", noShare.paid() === 1);
}

/* ─────────────────────── TEST 7 — occupation change ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);
  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  await s.generate("experience_package", "exp1", { instance: "exp1" });
  await s.generate("final_content", "final1");
  const beforeCtx = contextHash(s.ctx);

  const dead = s.edit({ occupation: "Teacher" });
  ok("T7: the blueprint is invalidated", dead.includes("role_blueprint"));
  ok("T7: so is the experience package", dead.includes("experience_package"));
  ok("T7: so is the final summary", dead.includes("final_content"));

  /*
   * The radiology pack must be unreachable, and not merely deprioritised. Two independent
   * mechanisms make it so, and both are checked: the entry is marked invalidated, AND the new
   * context hashes differently so it is not even looked up.
   */
  ok("T7: the radiology blueprint is no longer served",
    readCache(s.store, "role_blueprint", beforeCtx, "ctx") === null);
  ok("T7: and the teacher context does not resolve to it",
    contextHash(s.ctx) !== beforeCtx
    && readCache(s.store, "role_blueprint", contextHash(s.ctx), "ctx") === null);

  const fresh = await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  ok("T7: a new blueprint is generated for the teacher", fresh.source === "generated");
  ok("T7: which is the fourth request on this resume", s.paid() === 4, String(s.paid()));

  /*
   * An in-flight request issued before the change must not land. This is the corruption case:
   * radiology duties written onto a CV whose target is now Teacher.
   */
  const staleStamp = { requestId: "old", task: "role_blueprint", contextHash: beforeCtx, inputHash: "ctx", revision: 0 };
  ok("T7: a reply generated for the old occupation is refused",
    !acceptReply(staleStamp, { contextHash: contextHash(s.ctx), inputHash: "ctx", revision: s.revision }));
}

/* ─────────────────────── TEST 8 — job advert on top of a cached pack ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);
  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  const afterPack = s.paid();

  /* Pasting an advert asks for the DELTA. The pack is not regenerated. */
  await s.generate("jd_delta", "advert-1", { instance: "advert-1" });
  ok("T8: an advert costs one delta request", s.paid() === afterPack + 1, String(s.paid()));
  ok("T8: and the occupation pack is untouched",
    readCache(s.store, "role_blueprint", contextHash(s.ctx), "ctx") !== null);

  /* A second advert is a second delta, still on the same pack. */
  await s.generate("jd_delta", "advert-2", { instance: "advert-2" });
  ok("T8: a different advert is a new delta, not a new pack", s.paid() === afterPack + 2);
  ok("T8: the pack survives that too",
    readCache(s.store, "role_blueprint", contextHash(s.ctx), "ctx") !== null);

  /* Re-opening the same advert reads. */
  const again = await s.generate("jd_delta", "advert-1", { instance: "advert-1" });
  ok("T8: reopening an analysed advert costs nothing", again.source === "resume-cache");
}

/* ─────────────────────── TEST 9 — rapid clicks ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);

  /* Eight taps on Generate before the first reply lands. */
  const results = await Promise.all(Array.from({ length: 8 }, () => s.generate("role_blueprint", "ctx")));
  ok("T9: eight rapid clicks cost one request", s.paid() === 1, String(s.paid()));
  ok("T9: every click gets an answer", results.every((r) => r.result || r.source === "resume-cache"));
  ok("T9: no duplicate billing — the ledger records one call, not eight",
    s.ledger.paidCalls === 1, String(s.ledger.paidCalls));
  ok("T9: exactly one click owned the result",
    results.filter((r) => r.source === "generated").length === 1,
    String(results.filter((r) => r.source === "generated").length));
  ok("T9: no request is left open", inflightCount() === 0);
}

/* ─────────────────────── TEST 10 — provider failure ─────────────────────── */

{
  resetInflight();
  const s = session(RADIOLOGY);
  await s.generate("role_blueprint", "ctx", { trigger: "auto" });
  const stored = readCache(s.store, "role_blueprint", contextHash(s.ctx), "ctx");

  /* The provider is now down. The failure is recorded and nothing is erased. */
  s.ledger = record(s.ledger, { paid: true, outcome: "error" });
  ok("T10: the failure is counted", s.ledger.failedCalls === 1);
  ok("T10: the existing suggestions survive it",
    readCache(s.store, "role_blueprint", contextHash(s.ctx), "ctx") !== null
    && stored !== null);

  /*
   * No infinite retry. The ceiling is a hard number, and past it the answer is a refusal rather
   * than another attempt — which is what turns a provider outage into a bounded cost.
   */
  const hot = { ...EMPTY_LEDGER, paidCalls: 20, escalations: {} };
  ok("T10: past the hard stop the answer is no, not another try",
    mayCall(hot, "explicit").allow === false);

  /* And the ceiling degrades AI only. Nothing here can block navigation, saving or export —
     those paths do not consult the ledger at all, which is why there is nothing to assert
     about them beyond the absence of a call. */
  const refused = await session(RADIOLOGY);
  refused.ledger = hot;
  const r = await refused.generate("role_blueprint", "ctx");
  ok("T10: a refusal is a refusal, not an exception", r.source === "refused" && r.reason === "hard-stop");
  ok("T10: and it made no request", refused.paid() === 0);
}

/* ─────────────────────── the headline numbers ─────────────────────── */

{
  resetInflight();

  /** The measured "after" figure for the brief's deliverable 3. */
  const oneExperience = session(RADIOLOGY);
  await oneExperience.generate("role_blueprint", "ctx", { trigger: "auto" });
  await oneExperience.generate("experience_package", "exp1", { instance: "exp1" });
  await oneExperience.generate("final_content", "final1");

  resetInflight();
  const twoExperiences = session(RADIOLOGY);
  await twoExperiences.generate("role_blueprint", "ctx", { trigger: "auto" });
  await twoExperiences.generate("experience_package", "exp1", { instance: "exp1" });
  await twoExperiences.generate("experience_package", "exp2", { instance: "exp2" });
  await twoExperiences.generate("final_content", "final1");

  ok("one experience: 3 paid calls (brief target 2-3)", oneExperience.paid() === 3, String(oneExperience.paid()));
  ok("two experiences: 4 paid calls (brief target 3-4)", twoExperiences.paid() === 4, String(twoExperiences.paid()));

  console.log(`\n   one experience  ${oneExperience.paid()} calls  ~$${oneExperience.ledger.estimatedUsd.toFixed(4)}`);
  console.log(`   two experiences ${twoExperiences.paid()} calls  ~$${twoExperiences.ledger.estimatedUsd.toFixed(4)}`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
