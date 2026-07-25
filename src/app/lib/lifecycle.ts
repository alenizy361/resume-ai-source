/**
 * What the builder is doing right now, as one value with one meaning per name.
 *
 * ── why the four-state version was not enough ──
 *
 * The builder shipped with `"" | "saving" | "saved" | "failed"`, derived from whether the last
 * write matched the current state. It answered one question — is this written down — and the screen
 * needed answers to three:
 *
 *   · is there anything to show yet (a step rendering "nothing is missing" over an unread draft is
 *     how a finished CV gets announced as empty for 40 milliseconds)
 *   · is the stored copy being upgraded from an older schema
 *   · is the stored copy UNREADABLE — the case that had no state at all, and the dangerous one
 *
 * That last one mattered most and was silent. `readDraft` caught its own `JSON.parse` failure and
 * returned an empty profile, so a corrupted draft looked exactly like a new user, and the next
 * autosave overwrote the damaged blob — destroying the only copy of the CV, without ever saying a
 * word. `invalidResume` exists so that path can be seen, held, and backed up instead.
 *
 * ── what this file is not ──
 *
 * It is not a state machine that anything transitions through. The lifecycle is DERIVED from facts
 * the provider already holds — the same discipline the save indicator has had since it was written:
 * a label stored beside the thing it describes is a label that can disagree with it, and "Saved"
 * printed next to an unwritten draft is the worst available outcome.
 */

export type Lifecycle =
  /** Before the provider has mounted. Nothing has been read, nothing may be claimed. */
  | "uninitialized"
  /** Reading the stored draft. */
  | "loading"
  /** A stored draft from an older schema is being brought forward. */
  | "migrating"
  /** Read, upgraded, and on screen — with nothing written since, because nothing has changed. */
  | "hydrated"
  /** The user has changed something that has not reached the debounce yet. */
  | "editing"
  /** The write is in flight. */
  | "saving"
  /** The current state is the written state. */
  | "saved"
  /** A write was attempted and threw — a full or blocked localStorage. */
  | "saveError"
  /** A draft exists in storage and cannot be parsed. Autosave is HELD in this state. */
  | "invalidResume";

/** States in which the step content must not render its own conclusions about the data. */
export function isReading(l: Lifecycle): boolean {
  return l === "uninitialized" || l === "loading" || l === "migrating";
}

/** Whether a write may proceed. `invalidResume` is the one state that must not overwrite. */
export function mayWrite(l: Lifecycle): boolean {
  return !isReading(l) && l !== "invalidResume";
}

export type LifecycleTone = "quiet" | "warn" | "error";

export function lifecycleTone(l: Lifecycle): LifecycleTone {
  if (l === "invalidResume") return "error";
  if (l === "saveError") return "warn";
  return "quiet";
}

/**
 * The sentence for each state, or "" where the honest answer is to say nothing.
 *
 * Silence is deliberate for `uninitialized`, `loading` and `hydrated`: a reader who has just opened
 * a page does not need to be told it opened, and narrating every internal state is how a status
 * line becomes something people stop reading before the one message that mattered.
 */
const COPY: Record<"ar" | "en", Record<Lifecycle, string>> = {
  en: {
    uninitialized: "",
    loading: "",
    migrating: "Bringing your saved CV forward…",
    hydrated: "",
    editing: "Saving…",
    saving: "Saving…",
    saved: "Saved",
    saveError: "Couldn't save — your work is still on screen",
    invalidResume: "The saved draft could not be read. A copy has been kept; this one starts fresh.",
  },
  ar: {
    uninitialized: "",
    loading: "",
    migrating: "أُحدّث سيرتك المحفوظة…",
    hydrated: "",
    editing: "يحفظ…",
    saving: "يحفظ…",
    saved: "محفوظ",
    saveError: "تعذّر الحفظ — عملك لا يزال أمامك",
    invalidResume: "تعذّرت قراءة المسوّدة المحفوظة. احتفظنا بنسخة منها، وهذه تبدأ من جديد.",
  },
};

export function lifecycleLabel(l: Lifecycle, lang: "ar" | "en"): string {
  return COPY[lang][l] ?? "";
}

/** Every state, for tests that must not go stale when one is added. */
export const LIFECYCLE_STATES: Lifecycle[] = [
  "uninitialized", "loading", "migrating", "hydrated",
  "editing", "saving", "saved", "saveError", "invalidResume",
];
