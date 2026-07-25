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
  type Role, upsertRole, rolesToLines, dedupeBullets, saysTheSame,
  BULLET_CAP_CURRENT, BULLET_CAP_PAST,
} from "./resumeDoc.ts";
import type { GenerationStore } from "./aiCache.ts";
import type { ResumeLedger } from "./aiBudget.ts";
import type { TranslatedVersion } from "./translate.ts";

export const SCHEMA_VERSION = 2;

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
 * Deterministic-ish unique id. `Math.random` is avoided so a workflow replay or a
 * server render produces stable output; the counter plus a caller-supplied stamp
 * is enough, since ids only need to be unique within one document.
 */
export function newId(prefix = "i", stamp = 0): string {
  seq += 1;
  return `${prefix}_${stamp || seq}_${seq}`;
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
    // replace=true so the role's bullets are exactly the confirmed set.
    profile.roles = upsertRole(roles, {
      ...roles[at],
      bullets: [...roles[at].bullets, item.text],
    }, true);
    profile.wovenLines = rolesToLines(profile.roles);
  } else if (item.type === "skill") {
    const have = String(profile.skills || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    if (!have.some((h) => normalizeLabel(h) === item.normalized)) have.push(item.text);
    profile.skills = have.slice(0, 12).join("، ");
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
