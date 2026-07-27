/**
 * The optional English version: what may be sent, what must survive, and what makes a result invalid.
 *
 * ── the shape of the feature ──
 *
 * An Arabic CV is authored in Arabic from the first suggestion. At the end, the user MAY ask for an
 * English version. It is a separate localized version hanging off the same confirmed facts — never an
 * overwrite, never automatic, never a second set of career facts.
 *
 * ── what is translated, and what is emphatically not ──
 *
 * Structured confirmed items, each with a stable id. Not rendered HTML, not text extracted from a PDF,
 * not page markup, not conversation history. That is not a style preference: translating rendered
 * output is how a "translation" acquires facts nobody confirmed — a template's placeholder, a
 * suggestion the user rejected, a heading the layout invented. Translating from ids also makes the
 * validation below possible at all, because every English line can be traced to the Arabic line it
 * came from.
 *
 * ── the invariant ──
 *
 *     Translation may change WORDS. It may never change FACTS.
 *
 * Every function here exists to make that checkable rather than hoped for: one source item in, one
 * target item out, same id, and a validator that rejects a result which added an employer, moved a
 * date, altered a number, or produced a line with no Arabic original.
 *
 * Pure and offline — `ops/translate.test.mjs` drives all of it with no model and no network.
 */

import { hashOf } from "./aiCache.ts";
import { GLOSSARY_VERSION, lookup, render } from "./glossary.ts";
import { type Role, rolesToLines } from "./resumeDoc.ts";
import type { BuilderState } from "./builderDoc.ts";

/* ─────────────────────────── the translatable document ─────────────────────────── */

/** One thing to translate, and the id that ties its translation back to it. */
export interface SourceItem {
  id: string;
  /** Which part of the CV it belongs to — the unit of staleness. */
  section: TranslatableSection;
  text: string;
}

export type TranslatableSection =
  | "summary" | "experience" | "achievements" | "skills"
  | "credentials" | "education" | "languages" | "titles";

export const TRANSLATABLE_SECTIONS: TranslatableSection[] = [
  "summary", "experience", "achievements", "skills", "credentials", "education", "languages", "titles",
];

export interface TranslationSource {
  sourceLanguage: "ar" | "en";
  targetLanguage: "ar" | "en";
  items: SourceItem[];
  /**
   * Strings that must appear in the output UNCHANGED.
   *
   * Employer names, institutions, the person's own name, credential numbers. A model translating
   * "مستشفى الملك فهد" into "King Fahad Hospital" is usually right and occasionally invents an English
   * legal name that does not exist, which on a CV is a checkable falsehood about where someone worked.
   * So they are listed, the prompt is told to preserve them, and the validator confirms it.
   */
  protectedNames: string[];
  /** Occupation families present, so only relevant glossary entries are sent. */
  families: string[];
}

/* ─────────────────────────── building the input ─────────────────────────── */

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Which script the CONFIRMED CONTENT is actually written in — as opposed to `target.language`, the
 * dropdown that records what the user WANTS the final document to be.
 *
 * Those two can disagree, and the disagreement is exactly the case this exists for: a user authors a
 * profile in Arabic, then switches `target.language` to English expecting the document to follow.
 * Nothing auto-translates (this product's own rule — see the file header), so the confirmed text is
 * still Arabic. Trusting `target.language` alone for `sourceLanguage` would tell `/api/translate`
 * "translate from English", which is false, and would make `sourceLanguage === targetLanguage` for an
 * English target — the exact condition `/api/translate` rejects outright. Detecting the real script
 * keeps the translator offered, and pointed the right direction, regardless of what the dropdown says.
 *
 * A majority test, same heuristic `validateTranslation`'s own "still untranslated" check already uses —
 * a CV legitimately mixes scripts (an Arabic bullet naming "PACS"), so "contains any Arabic" would
 * misfire on a properly English CV that keeps a handful of Latin technical terms.
 */
function detectScript(items: SourceItem[]): "ar" | "en" | null {
  const text = items.map((i) => i.text).join(" ");
  if (!text) return null;
  const arabic = [...text].filter((ch) => /[؀-ۿ]/.test(ch)).length;
  const latin = [...text].filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (arabic === 0 && latin === 0) return null;
  return arabic >= latin ? "ar" : "en";
}

/**
 * Proper names that must survive translation untouched.
 *
 * Employers and institutions come from the confirmed roles and education; the person's name from
 * `personal`. Deliberately NOT including the city or the country: those have standard English forms
 * ("الرياض" is Riyadh, always) and freezing them would leave Arabic place names in an English CV,
 * which reads as an unfinished translation rather than a preserved fact.
 */
export function protectedNames(s: BuilderState): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => { const t = clean(v); if (t.length > 1) out.add(t); };

  add(s.personal.fullName);
  for (const r of s.profile.roles ?? []) add(r.company);
  for (const c of s.credentials) {
    /* The ISSUER is a named organisation; the credential TITLE is a term the glossary handles. */
    add(c.issuer);
    add(c.credentialNumber);
  }
  /*
   * Education arrives as free text in this schema, so institution names cannot be extracted reliably.
   * Rather than guess at a substring, the whole education block is sent with an instruction to
   * preserve institution names — and the validator checks digits, which catches a changed year.
   */
  return [...out];
}

/**
 * Everything confirmed, and nothing else.
 *
 * The exclusions are the point. A rejected suggestion is a decision the user made and translating it
 * would resurrect it in the other language. An unconfirmed suggestion is not a fact yet. Neither has
 * any business in a document that claims to be the same CV in another language.
 */
export function buildTranslationSource(
  s: BuilderState,
  targetLanguage: "ar" | "en",
  families: string[] = [],
): TranslationSource {
  const items: SourceItem[] = [];
  const push = (section: TranslatableSection, id: string, text: unknown) => {
    const t = clean(text);
    if (t) items.push({ id, section, text: t });
  };

  push("titles", "target.title", s.target.title);
  push("summary", "profile.summary", s.profile.summary);

  (s.profile.roles ?? []).forEach((r, i) => {
    const rid = r.id || `role${i}`;
    push("titles", `${rid}.title`, r.title);
    /* The employer is a protected name, not a translatable item — it must not be offered for
       rewriting at all, which is stronger than asking a validator to catch it afterwards. */
    r.bullets.forEach((b, j) => push("experience", `${rid}.b${j}`, b));
  });

  push("education", "profile.education", s.profile.education);
  push("skills", "profile.skills", s.profile.skills);
  push("languages", "profile.languages", s.profile.languages);

  s.credentials
    .filter((c) => c.status === "confirmed")
    .forEach((c) => push("credentials", `cred.${c.id}`, c.title));

  /* The declared language is the fallback for a still-empty draft, where there is no text yet to read
     a script from — not the primary source of truth once real content exists. */
  const sourceLanguage: "ar" | "en" = detectScript(items) ?? (s.target.language === "ar" ? "ar" : "en");

  return {
    sourceLanguage,
    targetLanguage,
    items,
    protectedNames: protectedNames(s),
    families,
  };
}

/* ─────────────────────────── the cache key ─────────────────────────── */

export const TRANSLATION_PROMPT_VERSION = "t1";

/**
 * One translated version's identity.
 *
 * `modelVersion` is in the key for the same reason it is in the pack key: a translation produced by
 * the fast model and one produced by the reasoning model are not interchangeable when the question is
 * whether escalating was worth it.
 */
export function translationKey(opts: {
  sourceLanguage: string; targetLanguage: string; contentHash: string; modelVersion: string;
}): string {
  return [
    "tr", TRANSLATION_PROMPT_VERSION, GLOSSARY_VERSION,
    opts.sourceLanguage, opts.targetLanguage,
    hashOf({ content: opts.contentHash, model: opts.modelVersion }),
  ].join(":");
}

/** Content hash over the ITEMS, so a template or colour change cannot invalidate a translation. */
export function sourceContentHash(src: TranslationSource): string {
  return hashOf(src.items.map((i) => ({ id: i.id, text: i.text })));
}

/** Per-section hash, so changing one bullet does not retranslate a whole CV. */
export function sectionHashes(src: TranslationSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of TRANSLATABLE_SECTIONS) {
    const items = src.items.filter((i) => i.section === section);
    if (items.length) out[section] = hashOf(items.map((i) => ({ id: i.id, text: i.text })));
  }
  return out;
}

export interface TranslatedVersion {
  sourceLanguage: "ar" | "en";
  targetLanguage: "ar" | "en";
  contentHash: string;
  sectionHashes: Record<string, string>;
  promptVersion: string;
  glossaryVersion: string;
  model: string;
  /** id → translated text. Same ids as the source, always. */
  items: Record<string, string>;
  /** Terms or names the model flagged for the user to confirm. */
  needsConfirmation: string[];
  warnings: string[];
  createdAt: number;
  /** Sections whose source moved since this was produced. Empty means fully current. */
  staleSections?: string[];
}

/**
 * Which sections of an existing translation are out of date.
 *
 * This is the mechanism behind "change one bullet, do not retranslate the CV". A section whose hash
 * still matches is reusable verbatim; only the ones that moved need a request, and the brief asks for
 * exactly that.
 */
export function staleSections(prev: TranslatedVersion, next: TranslationSource): string[] {
  const now = sectionHashes(next);
  const stale: string[] = [];
  for (const [section, hash] of Object.entries(now)) {
    if (prev.sectionHashes[section] !== hash) stale.push(section);
  }
  /* A section that DISAPPEARED is also a change — its translated items must not linger. */
  for (const section of Object.keys(prev.sectionHashes)) {
    if (!(section in now)) stale.push(section);
  }
  return [...new Set(stale)];
}

/** Is a stored translation usable as-is? */
export function translationFresh(prev: TranslatedVersion | null, next: TranslationSource): boolean {
  if (!prev) return false;
  if (prev.promptVersion !== TRANSLATION_PROMPT_VERSION) return false;
  if (prev.glossaryVersion !== GLOSSARY_VERSION) return false;
  if (prev.targetLanguage !== next.targetLanguage) return false;
  return staleSections(prev, next).length === 0;
}

/* ─────────────────────────── validation ─────────────────────────── */

export interface ValidationProblem {
  code:
    | "missing-item" | "extra-item" | "empty-item"
    | "digit-changed" | "protected-name-lost" | "untranslated"
    | "new-employer";
  itemId?: string;
  detail?: string;
}

/** Every digit in a string, in order, folded to Western form so ٣٠ and 30 compare equal. */
function digitsOf(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660);           // Arabic-Indic
      if (c >= 0x06f0 && c <= 0x06f9) return String(c - 0x06f0);           // Eastern Arabic-Indic
      return /[0-9]/.test(ch) ? ch : "";
    })
    .join("");
}

/**
 * Does this translation say the same things?
 *
 * Every check answers a specific way a translation can quietly become a different CV:
 *
 *   missing-item        a confirmed line vanished — the English CV is shorter than the Arabic one
 *   extra-item          an id nobody sent came back — the model added a line
 *   empty-item          a line translated to nothing
 *   digit-changed       a date, a duration or a count moved. The single most damaging failure,
 *                       because a wrong year on a CV is a lie the applicant has to defend.
 *   protected-name-lost an employer or the person's own name did not survive
 *   untranslated        the output is still in the source language — a passthrough dressed as work
 *
 * What it does NOT check is whether the English reads well. That is not decidable here, and pretending
 * otherwise would mean rejecting good translations on a heuristic.
 */
export function validateTranslation(
  src: TranslationSource,
  out: { items: Record<string, string> },
): { ok: boolean; problems: ValidationProblem[] } {
  const problems: ValidationProblem[] = [];
  const sourceIds = new Set(src.items.map((i) => i.id));

  for (const id of Object.keys(out.items)) {
    if (!sourceIds.has(id)) problems.push({ code: "extra-item", itemId: id });
  }

  for (const item of src.items) {
    const t = clean(out.items[item.id]);
    if (t === "") {
      problems.push({ code: out.items[item.id] === undefined ? "missing-item" : "empty-item", itemId: item.id });
      continue;
    }

    const from = digitsOf(item.text);
    const to = digitsOf(t);
    if (from !== to) {
      problems.push({ code: "digit-changed", itemId: item.id, detail: `${from || "none"} → ${to || "none"}` });
    }

    /*
     * A passthrough check, and it is a MAJORITY test rather than "contains any Arabic".
     *
     * An English CV legitimately keeps Arabic nowhere, but it does keep Latin technical tokens when
     * translating the other way. Requiring zero source-script characters would reject a correct
     * English line containing a preserved Arabic employer name, which is the very thing the protected
     * list asks for.
     */
    if (src.targetLanguage === "en") {
      const arabic = [...t].filter((ch) => /[؀-ۿ]/.test(ch)).length;
      if (arabic > t.length * 0.4) problems.push({ code: "untranslated", itemId: item.id });
    } else {
      const latin = [...t].filter((ch) => /[A-Za-z]/.test(ch)).length;
      if (latin > t.length * 0.6) problems.push({ code: "untranslated", itemId: item.id });
    }
  }

  /*
   * Protected names must appear SOMEWHERE in the output. Per-item would be wrong: an employer name
   * belongs to one bullet, not to all of them, and the role title item may not mention it at all.
   */
  const all = Object.values(out.items).join("  ");
  for (const name of src.protectedNames) {
    /* Only names that were actually in the source text can be expected in the output. A protected
       employer that appears in no translatable item cannot be "lost" by a translation. */
    const inSource = src.items.some((i) => i.text.includes(name));
    if (!inSource) continue;
    if (all.includes(name)) continue;

    /*
     * A name the GLOSSARY knows is not an unverified guess — it is a verified term, and rendering it
     * is the correct outcome rather than a loss.
     *
     * Found by the tests, and it was a real design error rather than a rough edge:
     * "الهيئة السعودية للتخصصات الصحية" is a protected organisation name AND a glossary entry whose
     * English form is "Saudi Commission for Health Specialties (SCFHS)". Demanding that the Arabic
     * survive would have rejected every correct translation of a Saudi health credential — which is
     * most of the credentials this product suggests.
     *
     * The distinction is provenance, not language: an English name from the table is one a person
     * wrote down and versioned; an English name from the model is one it invented. Only the second
     * needs freezing.
     */
    const known = lookup(name, src.sourceLanguage);
    if (known) {
      const bare = src.targetLanguage === "ar" ? known.ar : known.en;
      if (all.includes(render(known, src.targetLanguage, true))
        || all.includes(bare)
        || (known.abbr && all.includes(known.abbr))) continue;
    }

    problems.push({ code: "protected-name-lost", detail: name });
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Should the stronger model be used for this translation?
 *
 * A closed set of reasons, same discipline as `EscalationReason` in `aiModels.ts`: pressing a button
 * again is not one of them. Returns null to stay on the fast tier, which is the normal case — the
 * brief's instruction is explicit that the strongest model must not translate every CV.
 */
export type TranslationEscalation =
  | "senior-achievements" | "mixed-specialties" | "validation-failed" | "user-requested";

export function translationEscalation(
  src: TranslationSource,
  opts: { userRequested?: boolean; validationFailed?: boolean } = {},
): TranslationEscalation | null {
  if (opts.validationFailed) return "validation-failed";
  if (opts.userRequested) return "user-requested";
  /* Several occupation families in one CV means the vocabulary has to switch registers mid-document,
     which is the case a cheap model blends. */
  if (src.families.length > 2) return "mixed-specialties";
  /*
   * Long achievement-bearing content at senior level. Measured crudely on purpose — a token count is a
   * proxy the model does not get to argue with, and the alternative (asking a model whether the job is
   * hard) costs a request to decide whether to make a request.
   */
  const chars = src.items.reduce((n, i) => n + i.text.length, 0);
  if (chars > 6000) return "senior-achievements";
  return null;
}

/* ─────────────────────────── rendering a version ─────────────────────────── */

/**
 * Build the profile a localized version renders as — WORDING SWAPPED, FACTS UNTOUCHED.
 *
 * The item ids that `buildTranslationSource` produced are the map back: `profile.summary` returns to
 * the summary, `r1.b0` to the first bullet of role `r1`. Nothing else moves. Dates, employers,
 * locations and the contact line are copied across verbatim — they were never sent for translation,
 * so there is nothing to swap and no opportunity to swap the wrong thing.
 *
 * A missing translation falls back to the SOURCE line rather than to an empty one. That is the honest
 * failure: a partially translated CV shows the Arabic sentence the translation did not cover, which a
 * user can see and fix, where a blank line silently deletes a job they did.
 *
 * Pure, and deliberately returns a new `Profile` rather than mutating: the Arabic document is the
 * document, and a function that could edit it in place while "rendering a view" is one refactor away
 * from the English version overwriting the Arabic one.
 */
export function applyVersionToProfile<
  P extends {
    role: string; summary: string; education: string; skills: string; languages: string;
    roles: Role[]; wovenLines: string[];
  },
>(profile: P, version: { items: Record<string, string> } | null | undefined): P {
  if (!version) return profile;
  const t = (id: string, fallback: string): string => {
    const v = version.items[id];
    return typeof v === "string" && v.trim() ? v : fallback;
  };

  const roles = profile.roles.map((r, i) => {
    const rid = r.id || `role${i}`;
    return {
      ...r,
      title: t(`${rid}.title`, r.title),
      /* Employer, location and dates are absent from the item map by construction — they were never
         translatable — so they survive without needing a rule that says so. */
      bullets: r.bullets.map((b, j) => t(`${rid}.b${j}`, b)),
    };
  });

  return {
    ...profile,
    role: t("target.title", profile.role),
    summary: t("profile.summary", profile.summary),
    education: t("profile.education", profile.education),
    skills: t("profile.skills", profile.skills),
    languages: t("profile.languages", profile.languages),
    roles,
    /*
     * `assembleResume` — what the preview and every export actually reads — does not read `roles` at
     * all for the experience section; it reads this flat, pre-woven text. Translating `roles` above
     * and stopping there would leave a version whose EVERY other section is English and whose
     * experience section is still verbatim Arabic, in the one place a recruiter reads first. Rederived
     * from the just-translated `roles`, the same way the reducer keeps it in sync after any other edit
     * (see `mergeProfile.ts`'s own `n.wovenLines = rolesToLines(n.roles)`).
     */
    wovenLines: rolesToLines(roles),
  };
}

/** Which language a version renders in — for `dir`, and for choosing the export path. */
export function versionDir(lang: "ar" | "en"): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}
