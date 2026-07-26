/**
 * Titles that fit, on pages whose titles are built from data.
 *
 * ── the problem, measured ──
 *
 * Every templated title on this site interpolates a job name, and job names differ by 25
 * characters: "Accountant" against "Customer Service Representative". One template therefore
 * produces titles from 46 to 73 characters, and the crawl in `docs/seo.md` found five past the
 * point where Google truncates — always the same handful of long professions, and always cut at
 * the end, which is where the year and the keyword phrase sit.
 *
 * A single shorter template is the obvious fix and the wrong one: it would strip "& ATS Keywords"
 * from fifty titles that had room for it in order to serve five that did not.
 *
 * ── what this does instead ──
 *
 * The title is declared as a required base plus optional parts in priority order, and each part is
 * appended only if the result still fits. The long professions lose the year; the short ones keep
 * everything; nothing is truncated mid-word.
 *
 * `continue` rather than `break` is deliberate: the parts are ordered by value, not by length, so a
 * part that does not fit should not prevent a shorter, less important one from being added. A
 * profession whose name eats the budget for " — ATS Keywords" can usually still carry " (2026)".
 *
 * No `next/*` imports — `ops/sectors.test.mjs` loads this in plain Node.
 */

/** Where Google truncates a title in practice. Not a rule from the spec — a measured limit. */
export const TITLE_LIMIT = 65;

/** Same, for a meta description. */
export const DESC_LIMIT = 165;

export function fitTitle(base: string, ...optional: string[]): string {
  let out = base;
  for (const part of optional) {
    const next = `${out}${part}`;
    if (next.length <= TITLE_LIMIT) out = next;
  }
  return out;
}
