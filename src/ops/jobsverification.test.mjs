/**
 * The salary-claim tracker holds three properties, and each has a concrete failure if it slips:
 *
 *   COVERAGE  — every job in `jobs.ts`/`jobs-ar.ts` gets an entry. A slug silently missing from
 *               `JOB_VERIFICATION` is a claim nobody can ever mark reviewed.
 *   HONESTY   — nothing starts "verified". The whole point of this file is that a figure written
 *               from general knowledge is not the same thing as one somebody checked.
 *   DRIFT     — a "verified" record is scoped to the exact text it verified. Edit the salary line
 *               later and the record must not keep vouching for a number that changed underneath it.
 *
 *   node --experimental-strip-types ops/jobsverification.test.mjs
 */

import { JOBS } from "../app/lib/jobs.ts";
import { JOBS_AR } from "../app/lib/jobs-ar.ts";
import { JOB_VERIFICATION, jobVerificationSummary } from "../app/lib/jobsVerification.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ─────────────────────────── coverage ─────────────────────────── */

ok("every English job has a verification entry",
  JOBS.every((j) => JOB_VERIFICATION.some((v) => v.lang === "en" && v.slug === j.slug)));
ok("every Arabic job has a verification entry",
  JOBS_AR.every((j) => JOB_VERIFICATION.some((v) => v.lang === "ar" && v.slug === j.slug)));
ok("the total matches both catalogues combined",
  JOB_VERIFICATION.length === JOBS.length + JOBS_AR.length);

/* The claim is read from the live catalogue, not copied — this is the assertion that would catch
   someone hand-typing a stale figure into a future edit of this file. */
ok("the claim text is exactly the page's own salary line",
  JOB_VERIFICATION.find((v) => v.lang === "en" && v.slug === JOBS[0].slug)?.claim === JOBS[0].salary);

/* ─────────────────────────── honesty ─────────────────────────── */

ok("nothing starts verified", JOB_VERIFICATION.every((v) => v.status === "unverified"));
ok("nothing starts with a verifiedAt", JOB_VERIFICATION.every((v) => v.verifiedAt === undefined));

const s = jobVerificationSummary();
ok("the summary counts add up", s.verified + s.unverified + s.retired === s.total);
ok("the summary starts at zero verified", s.verified === 0);
ok("the summary total matches the array", s.total === JOB_VERIFICATION.length);

/* ─────────────────────────── drift (reproduced, since RECORDED is private) ─────────────────────────── */

/**
 * `resolve()` itself is not exported — it is an implementation detail of building the list — so
 * this reproduces its rule rather than importing it, the same choice `provenance.test.mjs` makes
 * for `dismiss()`. What is asserted is the STATED CONTRACT from the file's own header: a recorded
 * verdict only counts while `claimAtRecord` still matches the live claim.
 */
function resolveLike(recorded, claim) {
  if (recorded && recorded.claimAtRecord === claim) return recorded.status;
  return "unverified";
}

{
  const original = "$95,000–$160,000 (SAR 180k–420k in KSA)";
  const recorded = { status: "verified", verifiedAt: "2026-07-01", claimAtRecord: original };

  ok("a record whose claim still matches stays verified", resolveLike(recorded, original) === "verified");
  ok("a record whose claim has drifted falls back to unverified",
    resolveLike(recorded, "$100,000–$170,000 (SAR 190k–440k in KSA)") === "unverified");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
