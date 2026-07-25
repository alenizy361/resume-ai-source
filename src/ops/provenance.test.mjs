/**
 * "Where did this come from?" and "no, thank you" — the two decisions a chip could not express.
 *
 * Until now a suggestion was a single button: tap to add. Everything else was invisible. A user who
 * scrolled past ten wrong skills and one who found ten right ones produced identical data, so the
 * acceptance rate was unmeasurable, and "Suggest more" had no idea what it had already got wrong.
 *
 * Two things were added, and both are asserted here rather than in the component, because both are
 * claims about content and not about pixels:
 *
 *   WHY     — every source must have a sentence, in both languages, and the Arabic one must be
 *             Arabic. The failure this repo has seen more than once is an English string reaching an
 *             Arabic screen through a fallback nobody looked at.
 *
 *   REJECT  — a dismissal has to SURVIVE. The chips it applies to are derived, not stored: the
 *             blueprint slices are recomputed from a cached answer on every visit, and the
 *             credential offers are `pack.credentials` minus what is on the list. Hiding one in
 *             local state forgets it on the next mount. So the components write the dismissal into
 *             the suggestion bag — offered, then rejected — and the property that has to hold is
 *             that `filterFresh` then refuses to re-offer the same text.
 *
 *   node --experimental-strip-types ops/provenance.test.mjs
 */

import { SOURCE_SENTENCE, WHY_LABEL, whySentence, sharedWhy } from "../app/lib/provenance.ts";
import { EMPTY_BUILDER, newItem, rejectItem, rejected, filterFresh, normalizeLabel } from "../app/lib/builderDoc.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const SOURCES = ["user", "imported", "job_description", "occupation", "ai"];
const hasArabic = (s) => /[؀-ۿ]/.test(s);
const hasLatinWord = (s) => /[A-Za-z]{3,}/.test(s);

/* ─────────────────────────── the explanation ─────────────────────────── */

for (const src of SOURCES) {
  ok(`"${src}" can explain itself in English`, (SOURCE_SENTENCE.en[src] || "").length > 10);
  ok(`"${src}" can explain itself in Arabic`, hasArabic(SOURCE_SENTENCE.ar[src] || ""));
}

/*
 * No English leaking into the Arabic side.
 *
 * Not a style rule. The whole Arabic-first brief rests on a user who chose Arabic never being handed
 * an English sentence mid-flow, and a `Record` with a missing key silently returns `undefined` —
 * which a fallback then answers in English. This is the assertion that catches that.
 */
for (const src of SOURCES) {
  ok(`the Arabic sentence for "${src}" is not an English one`, !hasLatinWord(SOURCE_SENTENCE.ar[src]));
}
ok("the Arabic control labels are Arabic", hasArabic(WHY_LABEL.ar.why) && hasArabic(WHY_LABEL.ar.reject));

/*
 * A source with no sentence must not produce a blank note. A chip that invites the question "why
 * this?" and then answers with nothing is worse than one that never asked.
 */
ok("an unknown source still answers", whySentence("ar", undefined).length > 0);
ok("and answers in the reader's language", hasArabic(whySentence("ar", undefined)));

/* The specific reason wins over the generic sentence — otherwise a role pack and a model
   suggestion would both say the same thing and the explanation would carry no information. */
{
  const specific = "مطلوب لهذه المهنة في السعودية";
  ok("a written reason is preferred over the source's sentence",
    whySentence("ar", "occupation", specific) === specific);
  ok("whitespace is not a reason",
    whySentence("en", "occupation", "   ") === SOURCE_SENTENCE.en.occupation);
}

/* ────────────────── one sentence, or one button per chip ────────────────── */

/*
 * A phone screenshot of the Arabic skills step decided this: twenty-five chips, each with its own
 * "why" button, each opening the SAME sentence, because a single role pack produced all of them.
 * Twenty-five controls carrying one fact is clutter, and clutter is what makes someone stop reading
 * the thing you wanted them to read. So a uniform group says it once and a mixed group does not.
 */
{
  const pack = [
    { source: "occupation", reason: "شائع في هذا المسمى" },
    { source: "occupation", reason: "شائع في هذا المسمى" },
  ];
  ok("a group that would say one thing says it once", sharedWhy(pack, "ar") === "شائع في هذا المسمى");

  /* The mixed case is not hypothetical: after a CV import some skills are the user's own and some
     are the pack's, and there the per-chip button is the only way to tell them apart. */
  const mixed = [
    { source: "imported", reason: "" },
    { source: "occupation", reason: "شائع في هذا المسمى" },
  ];
  ok("a mixed group keeps its per-chip buttons", sharedWhy(mixed, "ar") === null);

  /* Same source, different specific reasons — still mixed, because the sentences differ. */
  const sameSource = [
    { source: "ai", reason: "مطلوب في الإعلان" },
    { source: "ai", reason: "شائع في هذه المهنة" },
  ];
  ok("differing reasons under one source count as mixed", sharedWhy(sameSource, "ar") === null);

  /* No reasons at all: the source sentence is shared, so the group is uniform. That is the blueprint
     strip, which is where most of the twenty-five came from. */
  ok("a group with no written reasons shares its source's sentence",
    sharedWhy([{ source: "ai" }, { source: "ai" }], "en") === SOURCE_SENTENCE.en.ai);

  ok("an empty group has nothing to say", sharedWhy([], "en") === null);
}

/* ─────────────────────────── the dismissal ─────────────────────────── */

/**
 * Exactly what `BlueprintStrip.drop` and `useDismissals.drop` do, in two dispatches: an item is
 * offered, then rejected. Reproduced here rather than imported because the components are `.tsx`
 * and the point of the test is the STATE the pattern leaves behind, not the JSX around it.
 */
function dismiss(state, section, text) {
  const item = newItem({ section, type: "skill", text, source: "ai" });
  const offered = { ...state, suggestions: [...state.suggestions, item] };
  return rejectItem(offered, item.id);
}

{
  const s0 = { ...EMPTY_BUILDER, suggestions: [] };
  const s1 = dismiss(s0, "skills", "Magnetic Resonance Imaging");

  ok("a dismissal is recorded, not deleted", rejected(s1, "skills").length === 1);
  ok("nothing was added to the CV", !String(s1.profile.skills || "").includes("Magnetic"));

  /*
   * THE ASSERTION. The blueprint is cached: the identical answer is read on every later visit. If a
   * dismissal did not survive into `filterFresh`, the chip would come back on the next read and the
   * product would be visibly not listening.
   */
  const seen = { confirmed: [], pending: [], rejected: rejected(s1, "skills") };
  ok("and the same suggestion is not offered again",
    filterFresh(["Magnetic Resonance Imaging"], seen).length === 0);

  /* Casing differs between a grouped list and a blueprint slice; they are one decision. */
  ok("nor a differently-cased version of it",
    filterFresh(["magnetic resonance imaging"], seen).length === 0);

  /* And it must not swallow anything else — a rejection is about one suggestion. */
  ok("a different suggestion still comes through",
    filterFresh(["Computed Tomography"], seen).length === 1);
}

/*
 * Rejections are scoped to their section.
 *
 * `useDismissals` is used by credentials and by languages, and both read `rejected(state, section)`.
 * Declining "English" as a language must not remove an English-language credential; the sections
 * share one bag and only the section key keeps them apart.
 */
{
  const s = dismiss({ ...EMPTY_BUILDER, suggestions: [] }, "languages", "English");
  ok("a language dismissal stays in languages", rejected(s, "languages").length === 1);
  ok("and does not reach credentials", rejected(s, "credentials").length === 0);
}

/*
 * Why credentials match EXACTLY and blueprint chips match by containment.
 *
 * Measured, not assumed: `filterFresh` collapses "…Health Specialties classification" into
 * "…Health Specialties registration" — they share every content word but one, which is precisely
 * `saysTheSame`'s threshold. For a skill that is the wanted behaviour ("Mammography" and
 * "Mammography imaging" are one skill). For a credential it is a real loss: SCFHS classification and
 * SCFHS registration are different documents with different requirements, and `glossary.ts` carries
 * a note not to merge them.
 *
 * So `useDismissals` compares exact normalized labels. This test is what stops someone "unifying"
 * the two paths later without seeing what it costs.
 */
{
  const long = "Saudi Commission for Health Specialties classification";
  const sibling = "Saudi Commission for Health Specialties registration";
  const asItem = newItem({ section: "credentials", type: "credential", text: long });

  ok("containment matching WOULD hide the sibling credential — the reason it is not used here",
    filterFresh([sibling], { confirmed: [], pending: [], rejected: [asItem] }).length === 0);

  const hidden = new Set([asItem.normalized]);
  ok("exact matching keeps them apart", !hidden.has(normalizeLabel(sibling)));
  ok("and still hides the one actually declined", hidden.has(normalizeLabel(long)));
}

/* The filter the components apply is `normalized`, so what is stored must be the normalized form —
   a rejected item whose `normalized` did not round-trip would hide nothing. */
{
  const s = dismiss({ ...EMPTY_BUILDER, suggestions: [] }, "skills", "  PACS Administration  ");
  const hidden = new Set(rejected(s, "skills").map((i) => i.normalized));
  ok("the stored form matches what the chip filter computes",
    hidden.has(normalizeLabel("PACS Administration")));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
