/**
 * The country rules, as a list a person can actually work through — and a way to record the answer.
 *
 * ── why this exists ──
 *
 * Every rule in `countryRules.ts` is `status: "encoded"`, which means: written from general
 * knowledge, source recorded, NOT yet checked against it. The file says so, the health endpoint
 * reports the counts, and nothing pretends otherwise. But "verify the rules" as a task meant
 * reading five licensing authorities' websites and forming a view, which is a research project,
 * so it never happened.
 *
 * Two things change that. Each rule now carries a `claim` — one sentence that is true or false at
 * its own source, not a topic to read around. And this prints them as a checklist, then records the
 * verdict in the file itself.
 *
 * ── why it is not automated ──
 *
 * It cannot be, from here: the sandbox's network policy denies these hosts at the CONNECT gateway
 * (scfhs.org.sa, etec.gov.sa, socpa.org.sa all answer 403 through the proxy, and WebFetch reports
 * the same). More importantly `status: "verified"` is defined in `countryRules.ts` as "an
 * ADMINISTRATOR opened the source and confirmed it on `verifiedAt`" — a scraper agreeing with a
 * page is not that, and quietly redefining the word would make the whole provenance system a
 * decoration. So the reading is a person's job; the bookkeeping is this script's.
 *
 *   node --experimental-strip-types ops/verify-rules.mjs                 # the checklist
 *   node --experimental-strip-types ops/verify-rules.mjs --json          # machine-readable
 *   node --experimental-strip-types ops/verify-rules.mjs --confirm <id>  # record a YES
 *   node --experimental-strip-types ops/verify-rules.mjs --retire <id>   # record a NO
 */

import { readFileSync, writeFileSync } from "node:fs";
import { CREDENTIAL_RULES, EXCLUSION_RULES, ruleProvenance, staleRules } from "../app/lib/countryRules.ts";

const FILE = new URL("../app/lib/countryRules.ts", import.meta.url);
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? "");
};

const ALL = [
  ...CREDENTIAL_RULES.map((r) => ({ ...r, kindOf: "credential" })),
  ...EXCLUSION_RULES.map((r) => ({ ...r, kindOf: "exclusion" })),
];

/* ─────────────────────────── recording an answer ─────────────────────────── */

/**
 * Rewrite one rule's status in place.
 *
 * Text surgery on the source rather than a JSON side-file, deliberately: the rules ARE the source
 * file, they are reviewed in pull requests, and a verification recorded somewhere else would drift
 * away from the thing it describes within one refactor.
 */
function record(id, status, today) {
  const rule = ALL.find((r) => r.id === id);
  if (!rule) {
    console.error(`No rule with id "${id}". Run without arguments to see the list.`);
    process.exit(1);
  }
  const src = readFileSync(FILE, "utf8");
  const anchor = `id: "${id}",`;
  if (!src.includes(anchor)) {
    console.error(`Could not find "${anchor}" in countryRules.ts — the file has moved on; edit by hand.`);
    process.exit(1);
  }

  /*
   * `...base` supplies `status: "encoded"` to every rule, so recording a verdict means adding an
   * override AFTER the spread. Inserting it right below the id keeps it visible at the top of the
   * rule rather than buried under the occupation list.
   */
  const stamp = status === "verified"
    ? `\n    status: "verified", verifiedAt: "${today}", needsVerificationBy: "${plusYear(today)}",`
    : `\n    status: "retired", verifiedAt: "${today}",`;

  const next = src.replace(anchor, `${anchor}${stamp}`);
  writeFileSync(FILE, next);
  console.log(`${id} → ${status} (${today})`);
  console.log(status === "verified"
    ? "Re-check due " + plusYear(today) + ". Commit the change so the provenance is in the history."
    : "Kept in the file as retired, so it is not re-encoded by mistake. Commit it.");
}

function plusYear(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ─────────────────────────── the checklist ─────────────────────────── */

const today = flag("--today") || new Date().toISOString().slice(0, 10);

if (flag("--confirm") !== null) { record(flag("--confirm"), "verified", today); process.exit(0); }
if (flag("--retire") !== null) { record(flag("--retire"), "retired", today); process.exit(0); }

if (args.includes("--json")) {
  console.log(JSON.stringify({
    provenance: ruleProvenance(),
    overdue: staleRules(today),
    rules: ALL.map((r) => ({ id: r.id, status: r.status, sourceUrl: r.sourceUrl, claim: r.claim })),
  }, null, 2));
  process.exit(0);
}

const p = ruleProvenance();
console.log(`\nCountry rules — ${p.total} total: ${p.verified} verified, ${p.encoded} encoded, ${p.retired} retired`);
console.log(`Every "encoded" rule below is USABLE as a suggestion the user confirms, and NOT usable`);
console.log(`as a claim the product makes. Verifying one is: open the link, answer the question,`);
console.log(`then run this script with --confirm <id> or --retire <id>.\n`);

const overdue = staleRules(today);
if (overdue.length) {
  console.log(`⚠ ${overdue.length} rule(s) are past their re-check date and are already being withheld`);
  console.log(`  from users: ${overdue.map((r) => r.id).join(", ")}\n`);
}

for (const r of ALL) {
  const mark = r.status === "verified" ? "✓" : r.status === "retired" ? "✗" : "·";
  console.log(`${mark} ${r.id}  [${r.status}${r.verifiedAt ? ` ${r.verifiedAt}` : ""}]`);
  console.log(`   ${r.kindOf === "exclusion" ? "must NOT be suggested" : r.mandatory ? "required to practise" : "commonly held, not required"}`);
  console.log(`   claim:  ${r.claim}`);
  console.log(`   source: ${r.sourceUrl}`);
  console.log(`   record: node --experimental-strip-types ops/verify-rules.mjs --confirm ${r.id}\n`);
}

console.log(`Note: this environment cannot open those links — the network policy denies them at the`);
console.log(`CONNECT gateway (403), so the reading is a person's job. "verified" means an`);
console.log(`administrator opened the source and confirmed the claim, and nothing else may set it.\n`);
