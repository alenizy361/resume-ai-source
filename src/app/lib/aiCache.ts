/**
 * What may be reused, what must be thrown away, and what must never be written.
 *
 * Three separate problems that all reduce to comparing hashes, so they live together:
 *
 *   1. REUSE      — a stage the user revisits must render its existing suggestions, not buy
 *                   them again. Today every visit to a section that has a Suggest button
 *                   offers a fresh call and nothing remembers the last answer.
 *   2. INVALIDATE — changing the phone number must not invalidate the skills. Changing the
 *                   target occupation must invalidate everything about that occupation. The
 *                   middle ground is where money is wasted in both directions: regenerating
 *                   what was still valid, or showing radiology duties to a teacher.
 *   3. REJECT     — a reply that arrives after the context changed must not be written. This
 *                   is not a cost problem, it is a correctness problem, and it is the one that
 *                   produces the worst possible artefact: a CV containing content generated
 *                   for a job the user no longer wants.
 *
 * Everything here is pure and synchronous, with no `next/*` and no React, so
 * `ops/aicache.test.mjs` drives all of it in plain Node.
 *
 * ── on hashing ──
 *
 * FNV-1a over a key-sorted serialisation. Not a cryptographic hash and not trying to be: the
 * question is "did this input change", asked thousands of times a session on both the client
 * and the server, and a 32-bit digest over a few hundred bytes of structured text collides
 * rarely enough that the cost of a collision (one stale suggestion set, user-visible and
 * user-refreshable) is smaller than the cost of importing a crypto implementation into a
 * client bundle. Key sorting is the part that actually matters — without it, two identical
 * contexts hash differently depending on property insertion order, and every cache misses.
 */

/* ─────────────────────────── versions ─────────────────────────── */

/**
 * Bump when a prompt changes in a way that changes the OUTPUT. Part of every cache key, so a
 * bump retires every cached pack without a migration.
 *
 * Not bumped for a typo fix or a comment. Bumped for: a changed limit, a changed schema, a
 * new instruction, a changed doctrine.
 */
export const PROMPT_VERSION = "p1";

/**
 * Bump when the verified country-rules knowledge base changes — a new licence category, a
 * renamed authority, a corrected credential name. Separate from `PROMPT_VERSION` because the
 * two change for unrelated reasons and sharing a number means every prompt tweak also throws
 * away every country-specific pack.
 */
export const RULES_VERSION = "r1";

/* ─────────────────────────── hashing ─────────────────────────── */

/** Stable serialisation: objects key-sorted, arrays in order, undefined dropped. */
function stable(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${k}:${stable(o[k])}`).join(",")}}`;
  }
  return "";
}

/** FNV-1a, 32-bit, hex. Deterministic across client and server — that is the requirement. */
export function hashOf(v: unknown): string {
  const s = stable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* ─────────────────────────── the career context ─────────────────────────── */

/**
 * The facts that decide what a suggestion should say.
 *
 * Deliberately narrow, and every field here earns its place by CHANGING THE ANSWER:
 *
 *   occupation     — obviously
 *   specialization — a CT radiographer and a mammographer share a title and not a toolkit
 *   seniority      — "assisted with" against "led"
 *   country        — SCFHS is a Saudi credential; offering ARRT to a Riyadh applicant is
 *                    worse than offering nothing, because it looks authoritative
 *   cvLang         — the language the CONTENT is written in, which is not the interface's.
 *                    Conflating those two is how an English CV got Arabic duties.
 *
 * What is absent is the point of Part 16: no name, no phone, no employer, no template, no
 * education, no export settings. None of them change what a radiographer's duties are, and
 * every one of them would make the context hash churn and the cache useless.
 */
export interface CareerContext {
  occupation: string;
  specialization: string;
  seniority: string;
  country: string;
  cvLang: "ar" | "en";
}

/** Lower-cased and trimmed, so "Radiology Technologist " and "radiology technologist" share. */
export function normalizeContext(c: Partial<CareerContext>): CareerContext {
  const s = (v: string | undefined) => (v ?? "").trim().toLowerCase();
  return {
    occupation: s(c.occupation),
    specialization: s(c.specialization),
    seniority: s(c.seniority),
    country: s(c.country),
    cvLang: c.cvLang === "ar" ? "ar" : "en",
  };
}

export function contextHash(c: Partial<CareerContext>): string {
  return hashOf(normalizeContext(c));
}

/* ─────────────────────────── the shared occupation pack key ─────────────────────────── */

/**
 * The key for a pack that can be reused ACROSS USERS.
 *
 * Every component is a reason two users' answers would legitimately differ. Leave one out and
 * the cache serves the wrong content confidently; add something user-specific and the cache
 * never hits, which is the same as not having one.
 *
 * `modelVersion` is in the key for a reason that is easy to miss: a pack generated by Haiku
 * and a pack generated by Sonnet are not interchangeable when we are trying to MEASURE
 * whether the strong model is worth its price. Sharing them across a model change would make
 * the comparison in Part 23 impossible.
 *
 * `jdCategory` is a COARSE bucket, never the advert text. A pack keyed by the exact posting is
 * a pack that is never reused, which defeats the purpose; the posting's specifics are handled
 * as a delta on top (see `jdDeltaKey`).
 */
export interface PackKeyParts extends CareerContext {
  modelVersion: string;
  jdCategory?: string;
}

export function packKey(p: PackKeyParts): string {
  const c = normalizeContext(p);
  return [
    "pack", PROMPT_VERSION, RULES_VERSION,
    hashOf({ ...c, modelVersion: p.modelVersion, jdCategory: (p.jdCategory ?? "generic").toLowerCase() }),
  ].join(":");
}

/**
 * The key for the job-advert delta.
 *
 * Keyed by the advert's own hash AND the pack it is layered on, because the same posting
 * against a different occupation pack yields a different delta. This is the mechanism that
 * makes Part 9's rule real: a pasted advert must not regenerate the occupation pack, only the
 * difference between the advert and it.
 */
export function jdDeltaKey(pack: string, jobAd: string): string {
  return `${pack}:jd:${hashOf(jobAd.trim().toLowerCase())}`;
}

/* ─────────────────────────── the resume-level cache ─────────────────────────── */

/**
 * One generated result, stored inside the resume so a revisit is free.
 *
 * `userConfirmed` / `userRejected` live here rather than in the suggestion bag because they are
 * facts about THIS GENERATION: they are what makes "Suggest more" able to avoid re-offering
 * something already declined, without a second call to find out what was declined.
 */
export interface CachedGeneration<T = unknown> {
  task: string;
  contextHash: string;
  /**
   * WHICH one, for a task that has more than one per context.
   *
   * Found by `ops/callflow.test.mjs` rather than by design: with the slot keyed on task and
   * context alone, generating a package for experience 2 OVERWROTE experience 1's, and analysing
   * a second job advert threw away the first. Both then looked like cache misses and bought a
   * fresh call each time the user went back — a caching bug whose symptom is spending money.
   *
   * `role_blueprint` and `final_content` have exactly one per context and leave this empty. The
   * per-instance tasks set it to the experience id or the advert hash.
   */
  instance?: string;
  inputHash: string;
  promptVersion: string;
  /** Which model produced it — needed to compare quality per model without re-generating. */
  model: string;
  result: T;
  userConfirmed: string[];
  userRejected: string[];
  createdAt: number;
  /** Set when superseded, rather than deleted, so "why did this regenerate" is answerable. */
  invalidatedAt?: number;
}

export type GenerationStore = Record<string, CachedGeneration>;

/**
 * The slot a task's result occupies. One per task per context per INSTANCE — not per visit.
 *
 * The instance suffix uses `#` so `invalidate`'s `startsWith(`${task}@`)` still matches every
 * instance of a task at once, which is what an occupation change needs: all experiences die
 * together, not just the one that happens to be open.
 */
export function slotOf(task: string, contextHash: string, instance?: string): string {
  const base = `${task}@${contextHash}`;
  return instance ? `${base}#${instance}` : base;
}

/**
 * Read a cached generation, or null if it may not be reused.
 *
 * Four ways to miss, and the third is the one that matters: an entry whose INPUT hash differs
 * is stale even though its context matches. The user added two more confirmed tools since the
 * experience package was generated; the context (occupation, country, level, language) has not
 * moved, but the answer would.
 */
export function readCache<T>(
  store: GenerationStore | undefined,
  task: string,
  contextHash: string,
  inputHash: string,
  instance?: string,
): CachedGeneration<T> | null {
  const hit = store?.[slotOf(task, contextHash, instance)];
  if (!hit) return null;
  if (hit.invalidatedAt) return null;
  if (hit.inputHash !== inputHash) return null;
  if (hit.promptVersion !== PROMPT_VERSION) return null;
  return hit as CachedGeneration<T>;
}

export function writeCache<T>(
  store: GenerationStore | undefined,
  entry: CachedGeneration<T>,
): GenerationStore {
  return {
    ...(store ?? {}),
    [slotOf(entry.task, entry.contextHash, entry.instance)]: entry as CachedGeneration,
  };
}

/* ─────────────────────────── invalidation ─────────────────────────── */

/**
 * Which tasks depend on which part of the context. This table IS Part 11.
 *
 * Written as dependencies rather than as a list of consequences per field, because the
 * consequence list is what drifts: someone adds a task, updates two of the five "on change"
 * branches, and a stale suggestion survives an occupation change. Declaring what a task
 * DEPENDS ON makes the new task's author answer the question once.
 */
const DEPENDS_ON: Record<AiCacheTask, Array<keyof CareerContext>> = {
  role_blueprint: ["occupation", "specialization", "seniority", "country", "cvLang"],
  experience_package: ["occupation", "specialization", "seniority", "country", "cvLang"],
  final_content: ["occupation", "specialization", "seniority", "country", "cvLang"],
  jd_delta: ["occupation", "specialization", "country", "cvLang"],
  /* Country-independent: rewriting a line the user wrote is about their words, not the market. */
  bullet_rewrite: ["cvLang"],
  achievement_write: ["cvLang"],
};

export type AiCacheTask =
  | "role_blueprint" | "experience_package" | "final_content"
  | "jd_delta" | "bullet_rewrite" | "achievement_write";

export const AI_CACHE_TASKS: AiCacheTask[] = [
  "role_blueprint", "experience_package", "final_content",
  "jd_delta", "bullet_rewrite", "achievement_write",
];

/** Which context fields actually differ between two contexts. */
export function changedFields(
  prev: Partial<CareerContext>,
  next: Partial<CareerContext>,
): Array<keyof CareerContext> {
  const a = normalizeContext(prev), b = normalizeContext(next);
  return (Object.keys(a) as Array<keyof CareerContext>).filter((k) => a[k] !== b[k]);
}

/**
 * Which tasks must be regenerated after a context change.
 *
 * The assertions this exists to make true, verbatim from the brief and each one a test:
 *
 *   template change            → nothing
 *   contact-information change → nothing
 *   employer-name change       → nothing (it is not in `CareerContext` at all, which is why)
 *   country change             → credentials and country-dependent suggestions
 *   occupation change          → everything profession-dependent
 *
 * The first three are true BY CONSTRUCTION rather than by a rule: none of those fields is part
 * of the context, so they cannot appear in `changedFields`, so they cannot invalidate anything.
 * That is a stronger guarantee than a branch that remembers not to fire.
 */
export function tasksToInvalidate(
  prev: Partial<CareerContext>,
  next: Partial<CareerContext>,
): AiCacheTask[] {
  const changed = changedFields(prev, next);
  if (!changed.length) return [];
  return AI_CACHE_TASKS.filter((t) => DEPENDS_ON[t].some((f) => changed.includes(f)));
}

/**
 * Apply an invalidation: mark, do not delete.
 *
 * A deleted entry cannot answer "why is this regenerating", and the answer matters when the
 * complaint is "it charged me twice for the same thing". A marked entry also means a failed
 * regeneration can still show the previous content rather than an empty section — Part 20's
 * rule that a failure must not erase what is already there.
 */
export function invalidate(
  store: GenerationStore | undefined,
  tasks: AiCacheTask[],
  at: number,
): GenerationStore {
  if (!store || !tasks.length) return store ?? {};
  const out: GenerationStore = {};
  for (const [slot, entry] of Object.entries(store)) {
    const isTarget = tasks.some((t) => slot.startsWith(`${t}@`));
    out[slot] = isTarget && !entry.invalidatedAt ? { ...entry, invalidatedAt: at } : entry;
  }
  return out;
}

/* ─────────────────────────── stale-response protection ─────────────────────────── */

/**
 * The stamp a request carries and its reply must still match.
 *
 * `revision` is the counter that catches what the hashes cannot: the user edited something,
 * edited it BACK, and the context hash returned to its old value while a request generated in
 * between is still in flight. Hashes alone would accept that reply. A monotonic revision
 * refuses it, because the resume has moved on twice even though it looks unchanged.
 */
export interface RequestStamp {
  requestId: string;
  task: string;
  contextHash: string;
  inputHash: string;
  revision: number;
}

/** Monotonic, collision-free enough for one session, and not `Math.random` — see below. */
let seq = 0;
export function newRequestId(): string {
  seq += 1;
  return `r${seq.toString(36)}`;
}

/**
 * May this reply be written?
 *
 * Every clause is a real way to corrupt a resume, and they are checked in the order that
 * fails fastest. `revision` is `<` and not `!==` deliberately: a reply generated at revision 4
 * is valid at revision 4 and stale at 5, but a resume cannot go backwards, so a stamp from a
 * FUTURE revision is a bug rather than staleness and is refused too.
 */
export function acceptReply(
  stamp: RequestStamp,
  now: { contextHash: string; inputHash: string; revision: number },
): boolean {
  if (stamp.contextHash !== now.contextHash) return false;
  if (stamp.inputHash !== now.inputHash) return false;
  if (stamp.revision !== now.revision) return false;
  return true;
}

/* ─────────────────────────── in-flight de-duplication ─────────────────────────── */

/**
 * Two components asking the same question at the same time must cost one request.
 *
 * `useAiTask` already single-flights WITHIN one component instance — a second click cancels the
 * first. What it cannot do is notice that a different component is already asking the same
 * thing, because each `useAiTask` call has its own controller. The skills section and the
 * blueprint panel both want the role blueprint; mounting both is two identical calls.
 *
 * Keyed by task + input hash, so two callers asking for DIFFERENT things still get their own
 * request. The entry is removed when the promise settles, whichever way it settles — a
 * rejected promise left in the map would make every later caller inherit an old failure.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * The result, plus whether THIS caller is the one that caused the request.
 *
 * `leader` is not a nicety and it was not in the first version of this function. `ops/callflow.test.mjs`
 * pressed Generate eight times and found one request and EIGHT ledger entries: the de-duplication
 * shared the request correctly and then every follower independently wrote the result and charged
 * the resume for it. So the cost ledger reported eight calls where one was made, the budget ceiling
 * would trip after three honest clicks, and the "no duplicate billing" claim was false in the only
 * place that counts — the number the product reports.
 *
 * De-duplicating a request means de-duplicating its CONSEQUENCES. Followers get the answer to
 * render; only the leader records it.
 */
export interface DedupeResult<T> { result: T; leader: boolean }

export function dedupe<T>(
  task: string,
  inputHash: string,
  run: () => Promise<T>,
): Promise<DedupeResult<T>> {
  const key = `${task}:${inputHash}`;
  const existing = inflight.get(key);
  if (existing) return (existing as Promise<T>).then((result) => ({ result, leader: false }));
  const p = run().finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p.then((result) => ({ result, leader: true }));
}

/** How many distinct requests are open. For assertions and for the cost dashboard. */
export function inflightCount(): number { return inflight.size; }

/** Tests only — a shared module-level map would otherwise leak between cases. */
export function resetInflight(): void { inflight.clear(); }
