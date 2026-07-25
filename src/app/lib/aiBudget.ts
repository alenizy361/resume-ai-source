/**
 * Ceilings on how much one resume, or one user, or one bad afternoon can spend.
 *
 * The rate limiter in `ratelimit.ts` is not this. It answers "is this person asking too
 * often", which is an abuse question; this answers "is this resume costing more than a resume
 * should", which is a cost question, and the two have different failure modes. A single user
 * filling in one CV can stay comfortably inside every rate limit and still spend twenty calls
 * because a render loop fired the same generation on every commit.
 *
 * The list of ways that happens is not hypothetical — every entry below has bitten a product
 * somewhere, and two have bitten this one:
 *
 *   repeated rendering       an effect with an unstable dependency
 *   duplicate form events    a click handler that also submits the form
 *   browser refresh loops    a redirect that re-triggers the generation it redirected from
 *   failed retries           a retry ladder with no ceiling
 *   multiple open tabs       two tabs, one draft, both generating          ← seen here
 *   double clicks            two requests, the slower one wins             ← seen here
 *
 * The last two are why the counter lives in the RESUME rather than in memory: a per-process
 * counter is per-lambda, and a per-tab counter is per-tab, and neither notices the case it
 * exists for.
 *
 * ── what a ceiling must never do ──
 *
 * Block the form. Every limit here degrades AI and nothing else: navigation, saving, preview,
 * export and payment must work at the ceiling exactly as they work below it. A cost control
 * that can strand a paying user mid-CV has cost more than it saved.
 */

/* ─────────────────────────── the numbers ─────────────────────────── */

/**
 * Read from the environment so a limit can be changed without a deploy, with defaults that
 * come from the intended call flow rather than from a round number.
 *
 * The brief's target journey is 2–3 paid calls for one experience and 3–4 for two. `warnAt: 8`
 * is therefore roughly double the expected worst case — high enough that an honest user with
 * three experiences who regenerates a summary twice never sees it, low enough that a loop is
 * caught within seconds. `hardStop: 20` is the number at which something is definitely wrong;
 * it is not a quota, it is a smoke alarm.
 */
export interface Budgets {
  /** Calls on one resume before the UI says so. Not a block. */
  warnAt: number;
  /** Calls on one resume after which automatic generation stops and only explicit taps work. */
  autoStop: number;
  /** Calls on one resume after which paid generation stops entirely. A loop backstop. */
  hardStop: number;
  /** Retries for a single task, total. */
  maxRetries: number;
  /** Emergency switch: no Anthropic call is made at all. Falls back per Part 20. */
  disabled: boolean;
}

const num = (raw: string | undefined, fallback: number): number => {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export function budgets(): Budgets {
  return {
    warnAt: num(process.env.AI_BUDGET_WARN_CALLS, 8),
    autoStop: num(process.env.AI_BUDGET_AUTO_STOP_CALLS, 12),
    hardStop: num(process.env.AI_BUDGET_HARD_STOP_CALLS, 20),
    maxRetries: num(process.env.AI_BUDGET_MAX_RETRIES, 1),
    /*
     * Deliberately opt-IN by exact string. A truthy check would mean `AI_DISABLED=false`
     * disables the AI, which is the kind of thing that gets discovered during an incident.
     */
    disabled: (process.env.AI_DISABLED ?? "").trim().toLowerCase() === "true",
  };
}

/* ─────────────────────────── the per-resume ledger ─────────────────────────── */

/**
 * What one resume has spent. Stored with the resume, so it survives a refresh and is shared
 * between tabs — which is the point, since two tabs on one draft is a listed failure mode.
 *
 * Counts only. No content, ever: this record is the thing most likely to end up in a log or a
 * support ticket, and a cost ledger containing someone's employment history is a leak with a
 * spreadsheet attached.
 */
export interface ResumeLedger {
  /** Paid calls (Anthropic). The number the budgets are about. */
  paidCalls: number;
  /** Free calls (NVIDIA, fetch, extract). Counted for observability, never limited. */
  freeCalls: number;
  /** Calls that produced nothing usable — the `empty` state. Part of the quality metric. */
  emptyCalls: number;
  /** Calls that failed. Charged by the provider or not, they cost latency and trust. */
  failedCalls: number;
  /** Regenerations of something already generated. High means the output is not good enough. */
  regenerations: number;
  /** Escalations to the strong model, by reason. Part 22's escalation rate. */
  escalations: Record<string, number>;
  /** Estimated USD, from `estimateCallCost`. Approximate by construction; see that function. */
  estimatedUsd: number;
  /** Cache hits served instead of a call. The number that proves the caching works. */
  cacheHits: number;
}

export const EMPTY_LEDGER: ResumeLedger = {
  paidCalls: 0, freeCalls: 0, emptyCalls: 0, failedCalls: 0,
  regenerations: 0, escalations: {}, estimatedUsd: 0, cacheHits: 0,
};

export type Verdict =
  /** Go ahead. */
  | { allow: true; warn: boolean }
  /** Refuse, with a reason the UI can word. Never an error — the form still works. */
  | { allow: false; reason: "disabled" | "auto-stop" | "hard-stop" };

/**
 * May this call be made?
 *
 * `trigger` is the axis that matters and it is not a formality. An AUTOMATIC generation — the
 * one blueprint fired when the user confirms their target — is the kind that can loop, so it
 * stops at `autoStop`. An EXPLICIT tap cannot loop without a human tapping, so it survives to
 * `hardStop`. Treating them the same would either let a loop run to 20 or take the Suggest
 * button away from someone doing nothing wrong.
 */
export function mayCall(
  ledger: ResumeLedger,
  trigger: "auto" | "explicit",
  b: Budgets = budgets(),
): Verdict {
  if (b.disabled) return { allow: false, reason: "disabled" };
  if (ledger.paidCalls >= b.hardStop) return { allow: false, reason: "hard-stop" };
  if (trigger === "auto" && ledger.paidCalls >= b.autoStop) return { allow: false, reason: "auto-stop" };
  return { allow: true, warn: ledger.paidCalls >= b.warnAt };
}

/** Record a completed call. Pure — returns the next ledger rather than mutating. */
export function record(
  ledger: ResumeLedger,
  ev: {
    paid: boolean;
    outcome: "success" | "empty" | "error" | "cancelled";
    usd?: number;
    escalation?: string | null;
    regeneration?: boolean;
  },
): ResumeLedger {
  const next: ResumeLedger = {
    ...ledger,
    escalations: { ...ledger.escalations },
  };
  /*
   * A cancellation is not counted against anything. The user stopped it; on Anthropic a
   * cancelled stream is still billed for what it emitted, which is why `usd` is added
   * regardless of outcome while the CALL COUNTS are not.
   */
  if (ev.outcome !== "cancelled") {
    if (ev.paid) next.paidCalls += 1; else next.freeCalls += 1;
    if (ev.outcome === "empty") next.emptyCalls += 1;
    if (ev.outcome === "error") next.failedCalls += 1;
    if (ev.regeneration) next.regenerations += 1;
  }
  if (ev.usd) next.estimatedUsd = Math.round((next.estimatedUsd + ev.usd) * 1e6) / 1e6;
  if (ev.escalation) next.escalations[ev.escalation] = (next.escalations[ev.escalation] ?? 0) + 1;
  return next;
}

/** Record a cache hit — a call that did not happen, which is the whole objective. */
export function recordHit(ledger: ResumeLedger): ResumeLedger {
  return { ...ledger, cacheHits: ledger.cacheHits + 1 };
}

/**
 * Calls per completed CV, and cost per completed CV — the two acceptance-criteria numbers.
 *
 * Returns null rather than 0 for a resume that was never completed. A denominator of zero
 * averaged into a dashboard as "0.00 per CV" is worse than a gap, because it reads as success.
 */
export function perCompletedCv(
  ledgers: Array<{ ledger: ResumeLedger; completed: boolean }>,
): { calls: number; usd: number; n: number } | null {
  const done = ledgers.filter((l) => l.completed);
  if (!done.length) return null;
  const calls = done.reduce((s, l) => s + l.ledger.paidCalls, 0) / done.length;
  const usd = done.reduce((s, l) => s + l.ledger.estimatedUsd, 0) / done.length;
  return { calls: Math.round(calls * 100) / 100, usd: round6(usd), n: done.length };
}

/** Six decimal places, because a per-CV cost of $0.004 rounds to zero at two. */
function round6(v: number): number { return Math.round(v * 1e6) / 1e6; }
