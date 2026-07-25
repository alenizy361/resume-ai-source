/**
 * Scoring a flat resume with the same code that scores a built one.
 *
 * The optimizer's "ATS match score" was a number the MODEL typed into a `SCORE:` line,
 * pulled out with `parseInt(grab("SCORE"))`. Not a computation — an opinion, rendered as
 * a metric, on the page the product charges from. And `afterScore`, sold as before/after
 * proof, was manufactured when the model omitted it:
 *
 *     afterScore = clampedScore + Math.min(12, Math.max(4, (100 - score) * 0.2))
 *
 * That is a promised improvement invented by arithmetic, in a product whose central
 * claim is that it never invents anything. Meanwhile `lib/reviewChecks.ts` already scores
 * deterministically, explains every deduction, and refuses to say "match" without a job
 * advert — but only the builder could reach it, because it speaks `BuilderState` and the
 * optimizer holds flat text.
 *
 * This is the adapter. `parseCv` (40 tests) turns the text into structure and `review`
 * scores it, so both halves of the product answer with one function. The before/after
 * becomes real: score the input, score the model's rewrite, report both.
 *
 * Nothing here may import `next/*` — `ops/scoretext.test.mjs` runs it in plain Node.
 */

import { type BuilderState, EMPTY_BUILDER, newId } from "./builderDoc.ts";
import { parseCv } from "./importCv.ts";
import { type QualityReport, type MatchReport, review } from "./reviewChecks.ts";

/**
 * Build the document `review` reads out of a flat resume.
 *
 * Everything parsed is treated as CONFIRMED, which is right here and wrong in the
 * builder: this text is a resume the user already has, so its contents are facts about
 * their CV rather than suggestions awaiting approval. Nothing is added — the parse only
 * ever rearranges what was written.
 */
export function stateFromText(text: string, jobAd = ""): BuilderState {
  const p = parseCv(text);

  const roles = p.roles.map((r) => ({
    id: newId("r"),
    title: r.title,
    company: r.company,
    location: r.location,
    department: "",
    start: r.start,
    end: r.end,
    bullets: r.bullets,
  }));

  return {
    ...EMPTY_BUILDER,
    target: {
      ...EMPTY_BUILDER.target,
      // The target title is the most recent role. A CV being scanned has no separate
      // "job I am aiming for" field, and the alternative — leaving it blank — would cost
      // the user completeness points for a field the flow never asked them for.
      title: roles[0]?.title || "",
      jobAdText: jobAd,
    },
    personal: {
      ...EMPTY_BUILDER.personal,
      fullName: p.name,
      email: p.email,
      phone: p.phone,
      linkedin: p.linkedin,
    },
    profile: {
      ...EMPTY_BUILDER.profile,
      name: p.name,
      role: roles[0]?.title || "",
      summary: p.summary,
      contact: [p.phone, p.email, p.linkedin].filter(Boolean).join(" · "),
      education: p.education.join("\n"),
      certifications: p.certifications.join("\n"),
      languages: p.languages.join(", "),
      skills: p.skills.join(", "),
      roles,
      wovenLines: [],
      jobAd,
    },
  };
}

export interface TextScore {
  /** "quality" with no advert, "match" with one. Named by the data, never by the caller. */
  kind: "quality" | "match";
  score: number;
  report: QualityReport | MatchReport;
}

/**
 * Score a resume that exists as text.
 *
 * `referenceDate` is passed in rather than read from the clock, so the same resume and
 * advert always produce the same number. A score that drifts while nothing was edited
 * cannot be trusted, and a test that reads the clock passes today and fails in a year.
 */
export function scoreFlatResume(text: string, jobAd = "", referenceDate = ""): TextScore {
  const state = stateFromText(text, jobAd);
  const report = review(state, referenceDate);
  return { kind: report.kind, score: report.score, report };
}

/**
 * The honest before/after: the same function applied to the original and the rewrite.
 *
 * `after` can come back LOWER, and that is allowed. The previous code clamped the
 * projection so it could never fall below the original ("a rewrite only helps"), which
 * meant a rewrite that dropped a section still reported an improvement. If the rewrite
 * is worse, the number should say so — that is what makes the pair evidence rather than
 * marketing.
 */
export function beforeAfter(
  original: string,
  rewritten: string,
  jobAd = "",
  referenceDate = "",
): { before: number; after: number } {
  return {
    before: scoreFlatResume(original, jobAd, referenceDate).score,
    after: scoreFlatResume(rewritten, jobAd, referenceDate).score,
  };
}
