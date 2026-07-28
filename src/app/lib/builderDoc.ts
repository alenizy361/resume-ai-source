/**
 * The builder's document: confirmed facts, and suggestions that are not facts yet.
 *
 * ONE INVARIANT CARRIES THE PRODUCT'S CENTRAL PROMISE:
 *
 *     `profile` holds only confirmed content.
 *     Unconfirmed suggestions live in `suggestions` and are NEVER in `profile`.
 *
 * The preview, `assembleResume`, /api/optimize, the PDF and the Word export all read
 * `profile`. So an unconfirmed suggestion has no code path to a document — not
 * because a filter remembers to exclude it, but because it was never in the
 * structure those functions read. "Nothing appears until the user confirms it"
 * becomes a property of the data model rather than a rule someone must not forget.
 *
 * Why `Profile` is not replaced: `computeProgress`, `gateFinish`, `mergePatch`,
 * `assembleResume`, `rolesFromProfile` and the entire chat already speak it, and
 * `draftStore` already declares it as the store shared between both doors. A
 * parallel schema plus an adapter would be a second silo — precisely what makes a
 * user who switches doors lose their work.
 */

import { type Profile, EMPTY_PROFILE } from "./mergeProfile.ts";
import {
  type Role, rolesToLines, dedupeBullets, saysTheSame,
  BULLET_CAP_CURRENT, BULLET_CAP_PAST,
} from "./resumeDoc.ts";
import type { GenerationStore } from "./aiCache.ts";
import type { ResumeLedger } from "./aiBudget.ts";
import type { TranslatedVersion } from "./translate.ts";

export const SCHEMA_VERSION = 3;

export type SectionId =
  | "start" | "target" | "blueprint" | "personal" | "experience"
  | "education" | "credentials" | "skills" | "languages"
  | "summary" | "review" | "design";

/** Where a piece of content came from. Provenance is history; it never changes. */
export type ItemSource =
  | "user"            // typed by the person
  | "imported"        // parsed out of a CV they uploaded
  | "job_description" // lifted from the advert they are applying to
  | "occupation"      // a cached role pack for this job title
  | "ai";             // model-generated

export type ItemStatus = "suggested" | "confirmed" | "rejected" | "needs_evidence";

export interface Item {
  id: string;
  section: SectionId;
  /** Sub-kind within a section: "duty", "skill", "summary", "credential"… */
  type: string;
  text: string;
  /** Comparable form — a skill's canonical label, so "CT" and "ct scan" match. */
  normalized: string;
  source: ItemSource;
  /** Where it came from concretely: a role id, a JD keyword, a role-pack name. */
  sourceRef?: string;
  /** 0-1. Only meaningful for imported/AI content; user facts are certain. */
  confidence?: number;
  status: ItemStatus;
  /** Which role this belongs to, for duties and role-scoped achievements. */
  roleId?: string;
  /** Display grouping: "Imaging Modalities", "Systems", "Clinical Skills". */
  group?: string;
  /** Why it was offered, so "explain this suggestion" has a real answer. */
  reason?: string;
  createdAt: number;
  editedAt?: number;
  editedByUser: boolean;
}

/** A credential is not a certification. Conflating them loses real distinctions. */
export type CredentialKind =
  | "licence" | "registration" | "classification"
  | "certification" | "training" | "membership";

export interface Credential {
  id: string;
  kind: CredentialKind;
  title: string;
  issuer: string;
  issueDate: string;
  expiryDate: string;
  credentialNumber?: string;
  credentialUrl?: string;
  status: ItemStatus;
  source: ItemSource;
}

/** Proficiency is always the user's claim. Never defaulted — least of all to fluent. */
export type LanguageLevel = "native" | "fluent" | "professional" | "intermediate" | "basic";

export interface LanguageEntry {
  id: string;
  /** Canonical name; display labels are localized from this, never stored twice. */
  name: string;
  level: LanguageLevel | "";
  status: ItemStatus;
  source: ItemSource;
}

export interface TargetJob {
  title: string;
  level: string;
  language: "en" | "ar" | "both";
  industry: string;
  country: string;
  city: string;
  employer: string;
  jobAdUrl: string;
  jobAdText: string;
}

export interface BuilderState {
  schemaVersion: number;
  /** The confirmed resume. The ONLY thing any document is rendered from. */
  profile: Profile;
  /** Everything not yet confirmed. Never rendered. */
  suggestions: Item[];
  entry: "new" | "upload" | "saved" | "";
  target: TargetJob;
  personal: {
    fullName: string; professionalTitle: string; city: string; country: string;
    phone: string; email: string; linkedin: string; portfolio: string;
    /** Only when the user explicitly opts in for their local market. */
    nationality?: string; visaStatus?: string;
  };
  credentials: Credential[];
  languages: LanguageEntry[];
  template: string;
  sectionsDone: SectionId[];
  /**
   * The state of the CV at the moment the confirmed summary was written.
   *
   * A summary is a claim about the whole document, so it is the one field that
   * silently rots: add a job after writing it and it now describes someone else.
   * Storing the basis lets the section say "your experience changed — rewrite
   * this?" instead of leaving a stale paragraph at the top of the CV.
   */
  summaryBasis?: string;

  /**
   * Everything the AI has already produced for this resume, so a revisit reads instead of buys.
   *
   * Before this field, every section that offered a Suggest button offered a fresh PAID CALL on
   * every visit, forever. Nothing remembered the last answer, so going back to credentials and
   * forward again cost two calls to see the same six chips. Keyed by task + context + instance;
   * `lib/aiCache.ts` owns the reading and the invalidating.
   *
   * Optional so a v2 draft written before this existed still loads.
   */
  generations?: GenerationStore;

  /**
   * What this resume has SPENT. Counts and an estimate, never content.
   *
   * In the resume rather than in memory on purpose: a per-process counter is per-lambda and a
   * per-tab counter is per-tab, and two tabs on one draft is one of the listed ways a cost
   * ceiling gets bypassed. Surviving a refresh is the whole point.
   */
  ledger?: ResumeLedger;

  /**
   * Monotonic edit counter, for refusing a reply that arrived after the resume moved.
   *
   * Needed because the hashes alone miss one case: the user edits, a request goes out, they edit
   * BACK, and the context hash equals what the in-flight request carried. Hash equality says
   * accept; the resume has moved twice, so this says no.
   */
  revision?: number;

  /**
   * The occupation the user CONFIRMED, when a broad title was clarified.
   *
   * Stored separately from `target.title` because they answer different questions. The title is what
   * the user typed and what appears on their CV; this is what the suggestion engine reasons about. A
   * user who typed "معلم" and answered "معلم لغة إنجليزية" keeps their own words on the document and
   * gets English-teaching suggestions — conflating the two would silently rewrite their CV headline
   * to match a dropdown they touched once.
   *
   * Empty when the title resolved on its own or resolved to nothing. Neither case blocks anything.
   */
  occupationId?: string;

  /**
   * Other language versions of the SAME confirmed facts.
   *
   * Keyed by target language. Wording only: a version holds translated strings by source item id and
   * nothing else, so there is exactly one set of career facts and no way for the English CV to claim
   * something the Arabic one does not. Editing English wording is local; editing a FACT happens in
   * the shared document and marks the affected section stale.
   */
  versions?: Record<string, TranslatedVersion>;

  /**
   * Which version the preview and the exports are currently showing.
   *
   * A VIEW setting, not a fact — it changes which strings are rendered and nothing about what the CV
   * claims. Absent means the authoring language, which is the document itself. Stored with the resume
   * so the choice survives a refresh, because a switcher that silently resets is one the user stops
   * trusting after the first export.
   */
  activeVersion?: string;

  updatedAt: number;

  /* ────────────────────── the canonical record fields ──────────────────────
   *
   * The brief names seven things a resume record should carry. Three of them already existed here
   * under other names, and duplicating those would have created two fields that can disagree about
   * the same fact — which is the failure this file spends most of its length preventing. So the
   * mapping is written down rather than the fields being copied:
   *
   *   aiResults   → `generations`, above. Same thing: everything the model has produced for this
   *                 resume, keyed so a revisit reads instead of buying.
   *   sourceType  → `entry`, above. "new" | "upload" | "saved" is exactly the source of this CV.
   *   completion  → `computeProgress(profile)`, derived. Storing it would let a stored number
   *                 contradict the document it describes.
   *
   * What follows is the rest — the ones that genuinely did not exist.
   */

  /**
   * Who this resume belongs to, when anyone is signed in.
   *
   * Empty for the ordinary case, which is a person building a CV without an account: the privacy
   * pledge is that a resume lives in this browser, and that stays true. It is stamped only when
   * `/api/auth/me` already says who the user is, so that a saved CV can later be told apart from
   * another account's on a shared device — the one thing the local-only store cannot otherwise do.
   */
  userId?: string;

  /**
   * How far this resume has got, as a fact about the DOCUMENT rather than about the session.
   *
   * "draft" is the default and needs no explanation. "ready" means the review found nothing
   * critical, which is a claim the review makes and this field only records. "exported" means a
   * file was actually downloaded — an event, and the only one of the three that cannot be
   * recomputed later, which is precisely why it is stored.
   */
  status?: "draft" | "ready" | "exported";

  /**
   * What the CV scored, and WHEN — with the digest of the text it scored.
   *
   * A score without the text it belongs to is the "stale ATS score" problem: a number sitting
   * beside a document it no longer describes, quietly contradicting the preview next to it. The
   * digest is what lets a reader be told "this is for an earlier version" instead of being shown a
   * number that is simply wrong.
   *
   * Written when the user saves or exports, not on every keystroke: it is a measurement of a
   * moment, and a measurement that updates itself is not a measurement.
   */
  snapshot?: {
    qualityScore: number;
    /** Only when a job advert was pasted — there is no match score without something to match. */
    matchScore?: number;
    /** 0-100, from `computeProgress` at the moment of the snapshot. */
    completion: number;
    /** Of the assembled CV text, so a later reader knows whether this still applies. */
    digest: string;
    at: number;
  };

  /**
   * Present only on a resume created via "Duplicate and tailor". Everything else "duplicate and
   * tailor" is supposed to track already exists and is not repeated here: the target employer,
   * the target job title, and the job description itself are `target.employer`/`target.title`/
   * `target.jobAdText` — the same fields the ordinary target-job step fills in, because a tailored
   * version's target job IS an ordinary target job, just one filled in on a copy instead of an
   * original. The match score is `snapshot.matchScore`, for the same reason. Duplicating those
   * into a second location would only create two places that can disagree about the same fact.
   *
   * What genuinely does not exist anywhere else: which resume this one was cloned from, when the
   * clone happened, and whether an application actually went out for it — none of those are a
   * property of the CV's content, so none of them belong in `profile` or `target`.
   */
  tailoredFrom?: {
    sourceResumeId: string;
    tailoredAt: number;
    /** Same vocabulary `localdata.ts`'s job tracker uses — one status vocabulary, not two. */
    applicationStatus?: "saved" | "applied" | "interview" | "offer" | "rejected";
  };
}

export const EMPTY_TARGET: TargetJob = {
  title: "", level: "", language: "en", industry: "",
  country: "", city: "", employer: "", jobAdUrl: "", jobAdText: "",
};

export const EMPTY_BUILDER: BuilderState = {
  schemaVersion: SCHEMA_VERSION,
  profile: { ...EMPTY_PROFILE },
  suggestions: [],
  entry: "",
  target: { ...EMPTY_TARGET },
  personal: {
    fullName: "", professionalTitle: "", city: "", country: "",
    phone: "", email: "", linkedin: "", portfolio: "",
  },
  credentials: [],
  languages: [],
  template: "ats-pro",
  sectionsDone: [],
  updatedAt: 0,
};

/**
 * Bring a stored resume forward to the current schema.
 *
 * ── why this is a function and not a spread ──
 *
 * The provider used to write `{ ...EMPTY_BUILDER, ...saved }` inline, which works only for as long
 * as every change to the schema is a NEW OPTIONAL FIELD. The first change that is not — a renamed
 * key, a shape that moved, a default that stopped being safe — would be applied in two places or in
 * none, and the failure would be a user's stored CV quietly losing a section.
 *
 * Named versions, so the history is legible:
 *
 *   v1 → v2  the suggestion bag: unconfirmed content moved out of `profile`, which is what makes
 *            "nothing reaches the CV unconfirmed" true by construction rather than by filtering.
 *   v2 → v3  the record fields — `userId`, `status`, `snapshot` — all optional, so a v2 draft
 *            needs nothing done to it beyond being stamped.
 *
 * Unknown future versions are left alone rather than downgraded. A draft written by a NEWER build
 * (a second tab after a deploy) must not be rewritten by an older one — the older code cannot know
 * what it would be dropping.
 */
export function migrateBuilder(saved: Partial<BuilderState> | null | undefined): {
  state: BuilderState;
  /** True when the stored copy was genuinely older, so the UI can say an upgrade happened. */
  migrated: boolean;
} {
  if (!saved || !saved.schemaVersion) {
    return { state: { ...EMPTY_BUILDER }, migrated: false };
  }
  const from = saved.schemaVersion;
  const state: BuilderState = { ...EMPTY_BUILDER, ...saved, schemaVersion: Math.max(from, SCHEMA_VERSION) };
  return { state, migrated: from < SCHEMA_VERSION };
}

/**
 * The language the DOCUMENT is written in — not the language of the interface.
 *
 * These are two different things and conflating them is the single most damaging bug
 * this product has had: a Saudi applicant using the Arabic interface to build an
 * English CV, and getting Arabic duties, Arabic credential names and Arabic language
 * levels on it. Every string destined for the resume must be chosen with this
 * function; every string the user merely reads follows the interface.
 *
 * "both" resolves to English because English is the primary document in that mode —
 * the same rule the preview's direction already follows.
 */
export function cvLang(target: { language: "en" | "ar" | "both" }): "ar" | "en" {
  return target.language === "ar" ? "ar" : "en";
}

/** Proficiency words, in the language of the CV. Levels are stored as English keys. */
const LEVEL_WORD: Record<LanguageLevel, { en: string; ar: string }> = {
  native: { en: "Native", ar: "اللغة الأم" },
  fluent: { en: "Fluent", ar: "طليق" },
  professional: { en: "Professional", ar: "احترافي" },
  intermediate: { en: "Intermediate", ar: "متوسط" },
  basic: { en: "Basic", ar: "مبتدئ" },
};

export function levelWord(level: LanguageLevel, lang: "ar" | "en"): string {
  return LEVEL_WORD[level][lang];
}

/** "valid to 2027-03" — the CV's own phrasing, not the interface's. */
export function validToWord(lang: "ar" | "en"): string {
  return lang === "ar" ? "سارية حتى" : "valid to";
}

/* ───────────────────────── ids ───────────────────────── */

let seq = 0;
/**
 * Unique id. `Math.random` is avoided so a workflow replay produces stable-shaped output;
 * the counter alone, though, was NOT enough — "unique within one document" was read as
 * "unique within one page load", and those differ: the document is persisted and re-hydrated
 * while the module-level counter restarts at 0. A role added as the first action of one
 * session and a role added as the first action of the next both got `r_1_1`, and every
 * id-addressed action (`role`, `removeRole`, `cred`, `lang`) then patched or deleted BOTH.
 * The clock term makes ids unique across loads; the counter keeps them unique within one
 * millisecond. A caller-supplied stamp (item `createdAt`) still wins when present, so
 * stamped ids keep their meaning.
 */
export function newId(prefix = "i", stamp = 0): string {
  seq += 1;
  return `${prefix}_${(stamp || Date.now()).toString(36)}_${seq}`;
}

/* ─────────────────── normalization ─────────────────── */

/** Comparable form of a label, so "CT Scan", "ct-scan" and "CT scan" are one thing. */
export function normalizeLabel(s: string): string {
  return String(s || "")
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ───────────────────── items ───────────────────── */

export function newItem(partial: Omit<Partial<Item>, "id"> & { section: SectionId; type: string; text: string }): Item {
  const text = String(partial.text).replace(/^[-•*]\s*/, "").trim();
  return {
    id: newId("it", partial.createdAt),
    section: partial.section,
    type: partial.type,
    text,
    normalized: normalizeLabel(text),
    source: partial.source ?? "ai",
    sourceRef: partial.sourceRef,
    confidence: partial.confidence,
    status: partial.status ?? "suggested",
    roleId: partial.roleId,
    group: partial.group,
    reason: partial.reason,
    createdAt: partial.createdAt ?? 0,
    editedByUser: false,
  };
}

/**
 * Drop incoming suggestions the user has already seen — confirmed, still pending,
 * or explicitly rejected.
 *
 * Rejected ones matter most: a suggestion someone declined must not come back
 * reworded on the next regenerate. That is the behaviour that makes "reject" feel
 * like a decision rather than a dismissal.
 */
export function filterFresh(
  incoming: string[],
  seen: { confirmed: string[]; pending: Item[]; rejected: Item[] },
): string[] {
  const seenTexts = [
    ...seen.confirmed,
    ...seen.pending.map((i) => i.text),
    ...seen.rejected.map((i) => i.text),
  ];
  // `saysTheSame` needs three content words to judge meaning and falls back to an
  // exact match below that — which is right for duties and wrong for skill labels,
  // where "Mammography" and "Mammography imaging" are one skill. So short labels
  // are compared as labels: normalized, and by containment either way.
  const sameLabel = (a: string, b: string): boolean => {
    const x = normalizeLabel(a), y = normalizeLabel(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const words = Math.min(x.split(" ").length, y.split(" ").length);
    return words <= 3 && (x.includes(y) || y.includes(x));
  };
  const dup = (a: string, b: string) => saysTheSame(a, b) || sameLabel(a, b);

  const out: string[] = [];
  for (const raw of dedupeBullets(incoming)) {
    if (seenTexts.some((s) => dup(s, raw))) continue;
    if (out.some((k) => dup(k, raw))) continue;
    out.push(raw);
  }
  return out;
}

/** How many bullets this role may still take. */
export function bulletRoom(role: Role | undefined): number {
  if (!role) return BULLET_CAP_CURRENT;
  const current = /الآن|حالي|present|current|now/i.test(role.end) || !role.end;
  const cap = current ? BULLET_CAP_CURRENT : BULLET_CAP_PAST;
  return Math.max(0, cap - role.bullets.length);
}

/**
 * Confirm one item into the resume.
 *
 * Returns the item's new state plus the updated profile, or a `blocked` reason the
 * UI must show. Blocking is deliberate: `capBullets` keeps the EARLIEST bullets, so
 * silently accepting a seventh would discard the newest one — the user would watch
 * their click do nothing. Better to say "this role is full, remove one first".
 */
export function confirmItem(
  state: BuilderState,
  itemId: string,
): { state: BuilderState; blocked?: string } {
  const item = state.suggestions.find((i) => i.id === itemId);
  if (!item) return { state };

  const profile = { ...state.profile };

  if (item.type === "duty" && item.roleId) {
    const roles = [...(profile.roles || [])];
    const at = roles.findIndex((r) => r.id === item.roleId);
    if (at === -1) return { state, blocked: "role-missing" };
    if (bulletRoom(roles[at]) === 0) return { state, blocked: "bullet-cap" };
    /*
     * Written IN PLACE, by the index the id resolved to — not through `upsertRole`, which
     * re-resolves by title+company and takes the FIRST match. With two stints at the same
     * employer (a return to Hospital X under the same title), that re-resolution landed the
     * duty on the EARLIER stint and, with replace=true, swapped that stint's own bullets for
     * this one's — cross-role corruption from a single confirm. The id already names the
     * role exactly; nothing needs to be re-found.
     */
    profile.roles = roles.map((r, i) => i === at
      ? { ...r, bullets: [...r.bullets, item.text] }
      : r);
    profile.wovenLines = rolesToLines(profile.roles);
  } else if (item.type === "skill") {
    const have = String(profile.skills || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    if (!have.some((h) => normalizeLabel(h) === item.normalized)) {
      /*
       * Full is BLOCKED, exactly like the bullet cap above — the previous shape pushed and then
       * `slice(0, 12)`-ed, which silently discarded the just-accepted 13th skill while still
       * removing its chip from the bag: the user's click looked like it worked and did nothing.
       * Blocking keeps the chip, so the state of the world is visible.
       */
      if (have.length >= 12) return { state, blocked: "skill-cap" };
      have.push(item.text);
    }
    /* Separator follows the CV's language, not the author's keyboard — `withLangs` already got
       this right for the languages line. An Arabic comma on an English CV is both wrong to read
       and, until `hasArabic` was corrected, enough to delete the PDF download. */
    profile.skills = have.join(cvLang(state.target) === "ar" ? "، " : ", ");
  } else if (item.type === "summary") {
    profile.summary = item.text;
  } else if (item.type === "education") {
    const line = item.text;
    if (!String(profile.education || "").includes(line)) {
      profile.education = profile.education ? `${profile.education}\n${line}` : line;
    }
  } else if (item.type === "extra") {
    profile.extras = [...profile.extras, item.text];
  }

  return {
    state: {
      ...state,
      profile,
      // Confirmed items leave the bag entirely — the resume is now their home.
      suggestions: state.suggestions.filter((i) => i.id !== itemId),
      updatedAt: state.updatedAt,
    },
  };
}

/** Reject: kept, so regenerate cannot re-offer it. Capped so storage cannot grow forever. */
export function rejectItem(state: BuilderState, itemId: string, keep = 40): BuilderState {
  const marked = state.suggestions.map((i) =>
    i.id === itemId ? { ...i, status: "rejected" as ItemStatus } : i);
  const rejected = marked.filter((i) => i.status === "rejected");
  const rest = marked.filter((i) => i.status !== "rejected");
  return { ...state, suggestions: [...rest, ...rejected.slice(-keep)] };
}

/** Edit before confirming. Provenance stays "ai"; the badge becomes "AI · edited". */
export function editItem(state: BuilderState, itemId: string, text: string, stamp = 0): BuilderState {
  return {
    ...state,
    suggestions: state.suggestions.map((i) => i.id === itemId
      ? { ...i, text: text.trim(), normalized: normalizeLabel(text), editedByUser: true, editedAt: stamp }
      : i),
  };
}

/** Pending suggestions for a section, newest last, rejected excluded. */
export function pending(state: BuilderState, section: SectionId, roleId?: string): Item[] {
  return state.suggestions.filter((i) =>
    i.status === "suggested" && i.section === section && (!roleId || i.roleId === roleId));
}

export function rejected(state: BuilderState, section: SectionId): Item[] {
  return state.suggestions.filter((i) => i.status === "rejected" && i.section === section);
}

/**
 * A fingerprint of what a professional summary is a summary OF.
 *
 * Titles, employers and how many bullets each job carries — deliberately not the
 * bullet TEXT. Rewording a duty does not make the summary wrong, and a digest that
 * moved on every keystroke would nag the user out of trusting the notice at all.
 * Adding a job, dropping one, or gaining a whole responsibility does change what
 * the paragraph should say, and each of those moves this string.
 */
export function summaryBasis(p: Profile): string {
  const roles = (p.roles || [])
    .map((r) => `${normalizeLabel(r.title)}|${normalizeLabel(r.company)}|${r.bullets.length}`)
    .join(";");
  const skills = String(p.skills || "").split(/[,،]/).filter((s) => s.trim()).length;
  return `${normalizeLabel(p.role)}#${roles}#${skills}`;
}

/** Nothing unconfirmed may reach a document. Asserted by the tests, not assumed. */
export function hasUnconfirmed(state: BuilderState): boolean {
  return state.suggestions.some((i) => i.status === "suggested");
}
