/**
 * The salary claim on every SEO occupation page, as a checklist a person can work through — the
 * `ops/verify-rules.mjs` pattern applied to `jobsVerification.ts`. See that file's header for why
 * the claim is derived from `jobs.ts`/`jobs-ar.ts` live rather than hand-copied, and why recording
 * a verdict is text surgery on the source rather than a side database.
 *
 * `status: "unverified"` here means exactly what `status: "encoded"` means in `countryRules.ts`:
 * written from general knowledge, publishable as this product's own estimate, not yet checked
 * against a real source (a salary survey, Bayt/GOSI data, a sector report). Nothing in the product
 * withholds an unverified salary line — this script only makes it possible to know, and to close,
 * which ones have never been checked.
 *
 *   node --experimental-strip-types ops/verify-jobs.mjs                          # the checklist
 *   node --experimental-strip-types ops/verify-jobs.mjs --json                   # machine-readable
 *   node --experimental-strip-types ops/verify-jobs.mjs --confirm en software-engineer
 *   node --experimental-strip-types ops/verify-jobs.mjs --retire  ar some-slug
 */

import { readFileSync, writeFileSync } from "node:fs";
import { JOB_VERIFICATION, jobVerificationSummary } from "../app/lib/jobsVerification.ts";

const FILE = new URL("../app/lib/jobsVerification.ts", import.meta.url);
const ANCHOR = "  // ENTRY-INSERT-POINT — verify-jobs.mjs adds new lines directly above this one.";
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? "");
};

function record(lang, slug, status, today) {
  const entry = JOB_VERIFICATION.find((v) => v.lang === lang && v.slug === slug);
  if (!entry) {
    console.error(`No ${lang} entry with slug "${slug}". Run without arguments to see the list.`);
    process.exit(1);
  }
  const src = readFileSync(FILE, "utf8");
  if (!src.includes(ANCHOR)) {
    console.error("Could not find the insert point in jobsVerification.ts — it has moved on; edit by hand.");
    process.exit(1);
  }
  const claim = entry.claim.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const line = `  "${lang}:${slug}": { status: "${status}", verifiedAt: "${today}", claimAtRecord: "${claim}" },\n${ANCHOR}`;
  writeFileSync(FILE, src.replace(ANCHOR, line));
  console.log(`${lang}:${slug} → ${status} (${today})`);
  console.log("Commit the change so the provenance is in the history.");
}

const today = flag("--today") || new Date().toISOString().slice(0, 10);

if (flag("--confirm") !== null) { record(flag("--confirm"), args[args.indexOf("--confirm") + 2], "verified", today); process.exit(0); }
if (flag("--retire") !== null) { record(flag("--retire"), args[args.indexOf("--retire") + 2], "retired", today); process.exit(0); }

if (args.includes("--json")) {
  console.log(JSON.stringify({ summary: jobVerificationSummary(), entries: JOB_VERIFICATION }, null, 2));
  process.exit(0);
}

const s = jobVerificationSummary();
console.log(`\nOccupation-page salary claims — ${s.total} total: ${s.verified} verified, ${s.unverified} unverified, ${s.retired} retired`);
console.log(`An "unverified" line is this product's own estimate, publishable as one, not yet checked`);
console.log(`against a real source. Verifying one is: check the figure against a salary survey or`);
console.log(`market data, then run this script with --confirm <lang> <slug> or --retire <lang> <slug>.\n`);

for (const v of JOB_VERIFICATION) {
  const mark = v.status === "verified" ? "✓" : v.status === "retired" ? "✗" : "·";
  console.log(`${mark} ${v.lang}:${v.slug}  [${v.status}${v.verifiedAt ? ` ${v.verifiedAt}` : ""}]`);
  console.log(`   claim:  ${v.claim}`);
  console.log(`   record: node --experimental-strip-types ops/verify-jobs.mjs --confirm ${v.lang} ${v.slug}\n`);
}
