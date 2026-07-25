/**
 * What an answer is ABOUT — and the country bug that made half this file's guarantees inert.
 *
 * ── the bug ──
 *
 * `countryRules.ts` keys its rules `"sa"`. The country field is free text, and what people type
 * into it is "Saudi Arabia", "السعودية", "KSA". `r.country === c` matched none of those, so:
 *
 *   · `credentialsFor` returned nothing, so every credential id the blueprint produced was
 *     filtered out and the credentials step offered nothing at all
 *   · `exclusionsFor` returned nothing, so the ARRT-on-a-Saudi-CV guard — the entire reason that
 *     file exists — never fired for anyone who wrote their country in words
 *
 * Measured before the fix: `credentialsFor("radiology technologist", "Saudi Arabia")` returned 0
 * rules where `"sa"` returned 2. The guard was perfect and unreachable, which is the same failure
 * the PII scrubber had.
 *
 * ── the envelope ──
 *
 * `requestId`, `occupationId`, `countryCode` on every `/api/generate` response. Free text goes in
 * and suggestions come out whose correctness depends entirely on how that text resolved; without
 * these, a wrong credential is unexplainable. And `regulatoryStatus` / `supportedByEvidence` on each
 * credential, because "you must hold this to practise" and "people in this job often have this" are
 * different claims and were rendering identically.
 *
 *   node --experimental-strip-types ops/envelope.test.mjs
 */

import { countryCode, credentialsFor, exclusionsFor, CREDENTIAL_RULES } from "../app/lib/countryRules.ts";
import { resolveOccupation } from "../app/lib/occupations.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ─────────────────────── the country, as people write it ─────────────────────── */

const SAUDI = [
  "sa", "SA", "KSA", "ksa", "Saudi", "Saudi Arabia", "saudi arabia",
  "Kingdom of Saudi Arabia", "السعودية", "السعوديه", "المملكة العربية السعودية",
  "المملكه العربيه السعوديه", "Riyadh, Saudi Arabia",
];
for (const raw of SAUDI) {
  ok(`"${raw}" is Saudi Arabia`, countryCode(raw) === "sa", countryCode(raw));
}

ok("the Emirates, in several spellings",
  ["UAE", "United Arab Emirates", "الإمارات", "الامارات", "Dubai"].every((x) => countryCode(x) === "ae"));
ok("and the other Gulf markets the exclusions name",
  countryCode("Qatar") === "qa" && countryCode("الكويت") === "kw"
  && countryCode("Bahrain") === "bh" && countryCode("سلطنة عمان") === "om");

/*
 * An unrecognised country returns "" and every lookup then finds nothing — the same behaviour as a
 * market with no rules encoded. That is the honest outcome: guessing a jurisdiction for someone's
 * professional licence is worse than admitting none is known.
 */
ok("an unknown country is empty, not guessed", countryCode("Atlantis") === "");
ok("and empty input is empty", countryCode("") === "" && countryCode("   ") === "");

/* ──────────────── the rules the bug made unreachable ──────────────── */

{
  const byCode = credentialsFor("radiology technologist", "sa");
  ok("Saudi radiography has encoded credentials", byCode.length >= 2, `${byCode.length}`);

  /* THE REGRESSION. Every spelling must reach the same rules; before the fix only the code did. */
  for (const raw of ["Saudi Arabia", "السعودية", "KSA", "Riyadh, Saudi Arabia"]) {
    const got = credentialsFor("radiology technologist", raw);
    ok(`"${raw}" reaches the same rules`, got.length === byCode.length, `${got.length} vs ${byCode.length}`);
  }

  /* And the exclusion — the reason the file exists. */
  const excl = exclusionsFor("radiology technologist", "السعودية");
  ok("the wrong-market exclusion fires for an Arabic country name", excl.length > 0);
  ok("and it is the American one", excl.some((e) => /arrt/i.test(e.id) || /arrt/i.test(e.name)));

  /* A market with nothing encoded still returns nothing, which is not a bug. */
  ok("an uncovered market offers no credentials", credentialsFor("radiology technologist", "Egypt").length === 0);
}

/* ──────────────── what the envelope says about an answer ──────────────── */

{
  /*
   * The two fields that explain a suggestion. Computed exactly as the route computes them, from the
   * free text a user actually types — the point being that "Senior Radiology Technologist — CT"
   * and "أخصائي أشعة" must land on the same occupation, or the same CV gets different answers in
   * the two interfaces.
   */
  const en = resolveOccupation("Senior Radiology Technologist — CT", { cvLang: "en" }).occupationId;
  const ar = resolveOccupation("أخصائي أشعة", { cvLang: "ar" }).occupationId;
  ok("a wordy English title resolves to an occupation", Boolean(en), en);
  ok("and the Arabic name resolves to the same one", ar === en, `${ar} vs ${en}`);

  ok("an unrecognised title resolves to nothing rather than to a guess",
    resolveOccupation("Falconry Equipment Specialist", { cvLang: "en" }).occupationId === "");
}

/* ──────────────── required vs common, which were rendering alike ──────────────── */

{
  const rules = credentialsFor("radiology technologist", "Saudi Arabia");
  const mandatory = rules.filter((r) => r.mandatory);
  ok("at least one Saudi credential is legally required", mandatory.length > 0);

  /*
   * The claim comes from the encoded rule, never from the model. A model asked about Saudi
   * radiography has written "SCAFACH" before now; what a credential MEANS is not something to take
   * from a generated answer.
   */
  ok("every rule states whether it is mandatory",
    CREDENTIAL_RULES.every((r) => typeof r.mandatory === "boolean"));
  ok("and carries the source it was written from",
    CREDENTIAL_RULES.every((r) => /^https:\/\//.test(r.sourceUrl)));
  ok("and its own attestation status",
    CREDENTIAL_RULES.every((r) => ["encoded", "verified", "retired"].includes(r.status)));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
