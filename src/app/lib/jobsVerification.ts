/**
 * Provenance tracking for the salary claim on every SEO occupation page — the same problem
 * `countryRules.ts` already solved for licensing rules, applied to the other unsourced factual
 * assertion this product publishes at scale.
 *
 * ── why this exists ──
 *
 * `jobs.ts` (50 entries) and `jobs-ar.ts` (61 entries) each carry a `salary` string presented as
 * fact on a public page — "$95,000–$160,000 (SAR 180k–420k in KSA)" and the like. They were
 * written from general knowledge, the same way the country rules were, and until this file existed
 * there was no bookkeeping distinguishing "written" from "checked against a source" — unlike the
 * credential rules, which have carried `status: "encoded"` since they were written. A reader had
 * no way to tell the difference and neither did this codebase.
 *
 * ── why the claim is derived, not hand-typed ──
 *
 * `countryRules.ts`'s `claim` is authored once per rule because it names a fact from an external
 * source. A salary range has no single source to cite the same way — it is this product's own
 * market estimate. So the claim here IS the text already on the page (`job.salary`), read live from
 * `jobs.ts`/`jobs-ar.ts` rather than copied, which means a salary edited later is automatically
 * unverified again rather than silently kept "verified" against text that no longer matches.
 *
 * ── why verification is text surgery on `RECORDED`, not automatic ──
 *
 * Same reason as `ops/verify-rules.mjs`: `status: "verified"` means an administrator actually
 * checked the figure against a real source (Bayt, GOSI, a sector salary survey) on `verifiedAt`.
 * A script agreeing with a number it already contains is not that. `ops/verify-jobs.mjs` prints the
 * unverified list; a person records the answer.
 */

import { JOBS } from "./jobs.ts";
import { JOBS_AR } from "./jobs-ar.ts";

export type VerificationStatus = "unverified" | "verified" | "retired";

export interface JobVerification {
  slug: string;
  lang: "en" | "ar";
  /** The salary text as it reads on the page right now. */
  claim: string;
  status: VerificationStatus;
  /** ISO date. Present only once `status` is "verified" or "retired". */
  verifiedAt?: string;
}

/**
 * The recorded verdicts, keyed by `"{lang}:{slug}"`. Empty until `ops/verify-jobs.mjs --confirm`
 * or `--retire` writes an entry — this array is the whole point of the file, and everything below
 * it exists to compare a recorded verdict against the LIVE claim text.
 *
 * `claimAtRecord` is what makes a later edit to `salary` fall back to unverified automatically:
 * see `resolve()`.
 */
const RECORDED: Record<
  string,
  { status: VerificationStatus; verifiedAt: string; claimAtRecord: string }
> = {
  // Populated only by `node ops/verify-jobs.mjs --confirm <lang> <slug>` / `--retire`.
  // ENTRY-INSERT-POINT — verify-jobs.mjs adds new lines directly above this one.
};

function resolve(slug: string, lang: "en" | "ar", claim: string): JobVerification {
  const rec = RECORDED[`${lang}:${slug}`];
  if (rec && rec.claimAtRecord === claim) {
    return { slug, lang, claim, status: rec.status, verifiedAt: rec.verifiedAt };
  }
  return { slug, lang, claim, status: "unverified" };
}

export const JOB_VERIFICATION: JobVerification[] = [
  ...JOBS.map((j) => resolve(j.slug, "en", j.salary)),
  ...JOBS_AR.map((j) => resolve(j.slug, "ar", j.salary)),
];

/** Counts for a health endpoint or an admin queue — the same shape `ruleProvenance()` returns. */
export function jobVerificationSummary(): {
  total: number; verified: number; unverified: number; retired: number;
} {
  return {
    total: JOB_VERIFICATION.length,
    verified: JOB_VERIFICATION.filter((v) => v.status === "verified").length,
    unverified: JOB_VERIFICATION.filter((v) => v.status === "unverified").length,
    retired: JOB_VERIFICATION.filter((v) => v.status === "retired").length,
  };
}
