/**
 * One place that knows how to ask the AI for something.
 *
 * The audit's finding, restated: the builder makes model calls from five components and
 * each one invented its own handling. `ExperienceSection` has an abort controller, a
 * `Throttled` error class and a distinct sentence for a 429; `SummarySection` has a busy
 * flag and no cancellation; `AskAi` has neither; the credentials and languages sections
 * have no AI at all. So the same failure looks like four different things depending on
 * which section you are standing in, and two sections cannot fail at all because they
 * never call anything.
 *
 * This module is the contract. Every task declares:
 *
 *   - what it needs, and whether the input is even worth sending  (`validate`)
 *   - what request it becomes                                     (`body`)
 *   - what a usable answer looks like, and what EMPTY looks like   (`parse`)
 *   - how long to wait, and how many times to retry                (`timeoutMs`, `retries`)
 *
 * and `runTask` applies the same policy to all fourteen. The policies are the point, so
 * each one is written down next to the code that enforces it.
 *
 * Deliberately free of React and of `next/*`: `ops/aitasks.test.mjs` drives every task
 * in plain Node with a stub `fetch`, which is how the retry, timeout and cancellation
 * rules get tested without spending a single real token.
 */

/* ─────────────────────────── the lifecycle ─────────────────────────── */

/**
 * Five outcomes, and the two that are usually conflated are the two that matter most.
 *
 * `empty` is a SUCCESSFUL call that produced nothing usable — a 200 whose items array is
 * empty, or whose only suggestion was scrubbed away. Reporting that as an error teaches
 * the user that errors are meaningless, and then they ignore the real one. It gets its own
 * state and its own sentence: "nothing to add here".
 *
 * `cancelled` means the USER stopped it — they navigated, they typed again, they closed
 * the panel. A timeout is NOT cancelled; a timeout is an error, because nobody chose it.
 */
export type TaskState = "idle" | "loading" | "success" | "empty" | "error" | "cancelled";

export interface TaskResult<O> {
  state: TaskState;
  data?: O;
  /**
   * The SERVER's own words, when it gave any — and nothing else, ever.
   *
   * Split from `code` after a 500 with an empty body put the string "http-500" on screen
   * where a sentence belonged. The two are different kinds of thing: this is text written
   * for a human by whoever knew most about the failure, and `code` is a token for the UI to
   * look up. Merging them meant every internal token was one missing lookup away from being
   * shown to a user, and one of them was.
   */
  error?: string;
  /**
   * A machine reason: a validator's verdict, `timeout`, `network`, `rate-limited`,
   * `http-503`. Never displayed as-is — `useAiTask` maps it to a sentence.
   */
  code?: string;
  /**
   * A 429. Separated because it is not a failure and must not be worded like one: "the
   * assistant is busy" invites another click, which is the worst possible response to a
   * rate limit. The honest message is "you have asked a lot in the last few minutes; keep
   * typing, the form works without this".
   */
  throttled?: boolean;
}

/* ─────────────────────────── the tasks ─────────────────────────── */

export type TaskName =
  // experience
  | "duties_draft" | "duty_improve" | "duty_shorter" | "duty_metric_ask"
  // the rest of the sections
  | "skills_groups" | "summary_variants" | "education_format"
  | "credentials_hint" | "languages_hint"
  // cross-cutting
  | "ask_section" | "blueprint_groups"
  // the three that are not the suggest endpoint
  | "job_ad_fetch" | "cv_extract" | "ats_review";

/** Which server bucket a task is charged to. Documentation, and the basis of `costOf`. */
export type Bucket = "suggest" | "fetch" | "extract" | "optimize";

export interface TaskSpec {
  name: TaskName;
  endpoint: string;
  bucket: Bucket;
  /**
   * How long before giving up. Not one number for all fourteen: a bullet rewrite that
   * takes 20s has already lost the user, while an ATS review of a full CV legitimately
   * takes longer than that and killing it at 20s would mean it never succeeds.
   */
  timeoutMs: number;
  /**
   * How many times to try AGAIN after a NETWORK FAULT OR 5xx — so 0 means one attempt.
   *
   * Zero on the token-spending endpoints: a 5xx is the provider saying it failed, and on a
   * metered model an immediate repeat pays twice for the same refusal.
   */
  retries: number;
  /**
   * How many times to try again after a TIMEOUT, which is a different event.
   *
   * Measured, not assumed. `ops/titles-bench.mjs` ran the drafting prompt against all 111
   * occupations: successful calls returned in 1.2–3.6 s, median 2.2 s, and NOTHING returned
   * between 4 s and the 90 s ceiling. 17 of 111 hit the ceiling — a hung connection, not a
   * slow answer. So the same request, sent again, is very likely to succeed in two seconds,
   * and the old behaviour spent 30 seconds to show an error instead.
   *
   * Kept separate from `retries` because the two failures mean opposite things: a 5xx is a
   * provider that answered "no", a timeout is a provider that never answered at all.
   */
  timeoutRetries: number;
  /** A reason to refuse, or null to proceed. Refusing here costs nothing; asking does. */
  validate: (input: TaskInput) => string | null;
  body: (input: TaskInput) => Record<string, unknown> | FormData;
  /** `null` means the call worked and there is nothing usable in it — the `empty` state. */
  parse: (raw: unknown) => unknown;
}

/**
 * The union of everything any task needs.
 *
 * One loose bag rather than a generic per task. The alternative — fourteen input types
 * threaded through a generic `runTask<I, O>` — reads better in isolation and worse at the
 * call site, where a component holds a `BuilderState` and wants to hand over three fields
 * of it. `validate` is what makes this safe: a task that needs `role` says so, and says it
 * before the request is sent rather than after the model has been paid.
 */
export interface TaskInput {
  lang?: "ar" | "en";
  /** The CV's language, which is not the interface's. Every task that writes CV text uses it. */
  cvLang?: "ar" | "en";
  targetRole?: string;
  role?: string;
  company?: string;
  /** What the user already typed in THIS field. */
  current?: string;
  /** The confirmed CV, for tasks that summarise the whole document. */
  facts?: string;
  /** The user's own question — `ask_section` only. */
  question?: string;
  /** The live posting text. */
  jobAd?: string;
  url?: string;
  file?: File;
  /** Free-text resume, for the review task. */
  resume?: string;
}

/* ── shared parsers ──
 *
 * Written as functions rather than inline so the same "what counts as empty" decision is
 * made once. `[]` and `""` are empty; a missing field is empty; a field of the wrong type
 * is empty rather than a crash, because a model that returned the wrong shape is exactly
 * the case where a thrown TypeError would surface to the user as a blank screen.
 */

const str = (v: unknown): string => typeof v === "string" ? v.trim() : "";

function parseText(raw: unknown): string | null {
  const t = str((raw as { text?: unknown })?.text);
  return t || null;
}

function parseItems(raw: unknown): string[] | null {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;
  const clean = items.map(str).filter(Boolean);
  return clean.length ? clean : null;
}

export interface Group { label: string; items: string[] }

function parseGroups(raw: unknown): Group[] | null {
  const groups = (raw as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) return null;
  const clean: Group[] = [];
  for (const g of groups) {
    const items = Array.isArray((g as { items?: unknown })?.items)
      ? ((g as { items: unknown[] }).items).map(str).filter(Boolean)
      : [];
    if (items.length) clean.push({ label: str((g as { label?: unknown }).label), items });
  }
  return clean.length ? clean : null;
}

export interface Variant { label: string; text: string }

function parseVariants(raw: unknown): Variant[] | null {
  const variants = (raw as { variants?: unknown })?.variants;
  if (!Array.isArray(variants)) return null;
  const clean = variants
    .map((v) => ({ label: str((v as { label?: unknown })?.label), text: str((v as { text?: unknown })?.text) }))
    .filter((v) => v.text);
  return clean.length ? clean : null;
}

export interface MetricAsk { question: string; rewritten: string }

/**
 * The two-step that keeps numbers honest.
 *
 * `bullet_metric` must come back as a QUESTION plus a rewritten shape — never a number.
 * The UI asks the question, the user supplies the real figure, and only then is the line
 * written. A response with a question missing is empty rather than partially usable: a
 * rewritten line with no question is a line the model filled in itself, which is the one
 * thing this product exists not to do.
 */
function parseMetricAsk(raw: unknown): MetricAsk | null {
  const question = str((raw as { question?: unknown })?.question);
  const rewritten = str((raw as { rewritten?: unknown })?.rewritten);
  return question ? { question, rewritten } : null;
}

/* ── validators ── */

const needTarget = (i: TaskInput): string | null =>
  str(i.targetRole) ? null : "no-target-role";

const needCurrent = (i: TaskInput): string | null =>
  str(i.current) ? null : "no-current-text";

const needRole = (i: TaskInput): string | null =>
  str(i.role) || str(i.company) ? null : "no-role";

/** A suggest request the server would reject anyway. Refused here, before it costs. */
const needSomething = (i: TaskInput): string | null =>
  str(i.targetRole) || str(i.role) || str(i.current) || str(i.question) || str(i.facts)
    ? null : "nothing-to-work-from";

/* ── the registry ── */

const suggest = (
  name: TaskName,
  kind: string,
  mode: "items" | "groups" | "variants" | null,
  parse: (raw: unknown) => unknown,
  opts: {
    timeoutMs?: number; retries?: number; timeoutRetries?: number;
    validate?: (i: TaskInput) => string | null;
  } = {},
): TaskSpec => ({
  name,
  endpoint: "/api/suggest",
  bucket: "suggest",
  /*
   * 15 s, down from 30 s, on the same measurement that justifies the timeout retry: the
   * slowest call that ever SUCCEEDED took 3.6 s. Waiting 30 s only ever bought a longer wait
   * before the same error, and 15 s is still four times the slowest observed success.
   */
  timeoutMs: opts.timeoutMs ?? 15_000,
  retries: opts.retries ?? 0,
  timeoutRetries: opts.timeoutRetries ?? 2,
  validate: opts.validate ?? needSomething,
  parse,
  body: (i) => ({
    kind,
    ...(mode ? { mode } : {}),
    // The CV's language, not the interface's. Passing `lang` here is precisely how Arabic
    // duties ended up on English CVs, so the fallback chain puts cvLang first.
    lang: i.cvLang ?? i.lang ?? "en",
    targetRole: str(i.targetRole),
    role: str(i.role),
    company: str(i.company),
    current: str(i.current),
    facts: str(i.facts),
    question: str(i.question),
    jobAd: str(i.jobAd),
  }),
});

export const TASKS: Record<TaskName, TaskSpec> = {
  /* ── experience ── */
  duties_draft: suggest("duties_draft", "duties", "items", parseItems, { validate: needRole }),
  duty_improve: suggest("duty_improve", "bullet_improve", null, parseText, { validate: needCurrent }),
  duty_shorter: suggest("duty_shorter", "bullet_shorter", null, parseText, { validate: needCurrent }),
  duty_metric_ask: suggest("duty_metric_ask", "bullet_metric", null, parseMetricAsk, { validate: needCurrent }),

  /* ── the sections that had no AI at all ── */
  skills_groups: suggest("skills_groups", "skills", "groups", parseGroups, { validate: needTarget }),
  summary_variants: suggest("summary_variants", "summary", "variants", parseVariants, {
    /*
     * Longer than a bullet rewrite, and nowhere near the 45 s it used to have.
     *
     * That 45 s was a guess, and the guess did not survive the measurement: the drafting call
     * emits MORE text than this one — eight to ten duties plus ten to fifteen skills against
     * three short paragraphs — and it completed in 3.6 s at its slowest across 94 successful
     * runs. So 20 s is generous for the larger job and lavish for this one. With two timeout
     * retries, a hang now costs ~20 s instead of 45 s and usually resolves on the second try.
     */
    timeoutMs: 20_000, validate: needTarget,
  }),
  education_format: suggest("education_format", "education", "items", parseItems, { validate: needCurrent }),
  credentials_hint: suggest("credentials_hint", "extras", "items", parseItems, { validate: needTarget }),
  languages_hint: suggest("languages_hint", "extras", "items", parseItems, { validate: needTarget }),

  /* ── cross-cutting ── */
  ask_section: suggest("ask_section", "ask", null, parseText, {
    validate: (i) => str(i.question) ? null : "no-question",
  }),
  blueprint_groups: suggest("blueprint_groups", "duties", "groups", parseGroups, { validate: needTarget }),

  /* ── the three that are not /api/suggest ── */

  /**
   * Read a job advert from its URL.
   *
   * Two retries, unlike anything on the suggest bucket: this is a fetch of someone else's
   * page and a transient network fault is the likeliest failure by far. It also costs no
   * tokens, so retrying is cheap in the only currency that matters here.
   */
  job_ad_fetch: {
    name: "job_ad_fetch",
    endpoint: "/api/fetch-job",
    bucket: "fetch",
    timeoutMs: 20_000,
    retries: 2,
    timeoutRetries: 2,
    validate: (i) => /^https?:\/\/\S+$/i.test(str(i.url)) ? null : "not-a-url",
    body: (i) => ({ url: str(i.url) }),
    parse: (raw) => str((raw as { text?: unknown })?.text) || null,
  },

  /**
   * Read an uploaded CV file.
   *
   * FormData, not JSON — which is why `body` may return either. No retry: the upload is
   * the expensive part and repeating it on a flaky connection is how a phone user waits
   * ninety seconds for the same failure.
   */
  cv_extract: {
    name: "cv_extract",
    endpoint: "/api/extract",
    bucket: "extract",
    timeoutMs: 60_000,
    retries: 0,
    // Re-uploading a file on a flaky connection makes a phone user wait twice for the same
    // failure. The upload is the expensive part, so a hang here is surfaced, not repeated.
    timeoutRetries: 0,
    validate: (i) => i.file ? null : "no-file",
    body: (i) => { const fd = new FormData(); fd.append("file", i.file as File); return fd; },
    parse: (raw) => str((raw as { text?: unknown })?.text) || null,
  },

  /**
   * Score a CV against a job advert.
   *
   * The longest wait in the product, and the one users tolerate — it visibly analyses a
   * whole document. One retry, because losing it means retyping nothing but waiting twice.
   */
  ats_review: {
    name: "ats_review",
    endpoint: "/api/optimize",
    bucket: "optimize",
    timeoutMs: 90_000,
    retries: 1,
    timeoutRetries: 1,
    validate: (i) => str(i.resume).length > 40 ? null : "cv-too-short",
    /*
     * ── the key this used to send was both ignored AND wrong ──
     *
     * It was `lang: i.lang ?? "en"`. Two faults, stacked. `/api/optimize` reads `uiLang` and
     * `outLang` and nothing called `lang`, so the field was discarded — and `outLang` then defaulted
     * to English inside the route. Any caller reaching this task through `runTask` got an English
     * rewrite of an Arabic CV.
     *
     * And even the discarded value was the wrong one: `i.lang` is the INTERFACE language, while the
     * CV's own language is `i.cvLang`. `TaskInput`'s own documentation says so.
     *
     * Masked because the two live `/optimize` pages bypass `runTask` and post `outLang` themselves.
     * A defect reachable only through the typed, shared path — the one a new caller would use.
     */
    body: (i) => ({
      resume: str(i.resume),
      jobDescription: str(i.jobAd),
      /* The advice's language follows the reader; the RESUME's follows the document. Two decisions,
         and collapsing them is what returned a fully Arabic CV to an English request once already. */
      uiLang: i.lang ?? "en",
      outLang: i.cvLang ?? i.lang ?? "en",
    }),
    // The optimize route returns a whole result object; the caller reads its fields.
    parse: (raw) => (raw && typeof raw === "object") ? raw : null,
  },
};

/* ─────────────────────────── the runner ─────────────────────────── */

/** Everything a task run needs from the outside. `fetchImpl` exists for the tests. */
export interface RunOptions {
  /** The caller's cancellation — a closed panel, a newer request, a navigation. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Injected in tests so the retry backoff does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Counts only, never content. See `logUsage`'s rule: integers, not text. */
  onEvent?: (e: TaskEvent) => void;
}

export interface TaskEvent {
  task: TaskName;
  phase: "start" | "retry" | "success" | "empty" | "error" | "cancelled" | "throttled" | "invalid";
  attempt: number;
  ms: number;
  /** HTTP status when there was one. Never a response body. */
  status?: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retry backoff: 400ms, then 1200ms. Fixed rather than exponential-with-jitter because
 * the retry ceiling is two and the difference would be theatre.
 */
const BACKOFF = [400, 1200];

/**
 * Run one task, applying the same policy to all fourteen.
 *
 * The policies, and why each one is a policy rather than a default:
 *
 *  - **A 429 is never retried.** Retrying a rate limit is how a throttle becomes a block,
 *    and on a metered model it spends the user's own credit to be told "no" again.
 *  - **A 4xx is never retried.** The request was wrong; sending it again is wrong twice.
 *  - **A 5xx or a network fault is retried** up to the task's own limit. These are the
 *    only failures where the same request can succeed unchanged.
 *  - **A timeout is an error, not a cancellation.** Nobody chose it. Conflating the two
 *    means the UI shows "cancelled" to a user who is still waiting and wondering.
 *  - **Validation happens before the first request.** An empty form must not be able to
 *    spend a call, and the section can say what is missing instead of what failed.
 *  - **`parse` returning null is `empty`, not `error`.** A 200 with nothing in it worked.
 */
export async function runTask(
  name: TaskName,
  input: TaskInput,
  opts: RunOptions = {},
): Promise<TaskResult<unknown>> {
  const spec = TASKS[name];
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? wait;
  const started = Date.now();
  const emit = (phase: TaskEvent["phase"], attempt: number, status?: number) =>
    opts.onEvent?.({ task: name, phase, attempt, ms: Date.now() - started, status });

  const invalid = spec.validate(input);
  if (invalid) {
    emit("invalid", 0);
    return { state: "error", code: invalid };
  }

  const payload = spec.body(input);
  const isForm = typeof FormData !== "undefined" && payload instanceof FormData;

  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) { emit("cancelled", attempt); return { state: "cancelled" }; }
    emit(attempt === 0 ? "start" : "retry", attempt);

    /*
     * Two reasons to abort, one controller.
     *
     * The task's own timeout and the caller's signal both have to be able to stop the
     * request, and afterwards we have to know WHICH did — a timeout is an error and a
     * cancellation is not. So the timeout is tracked in a local flag rather than inferred
     * from the abort, because by then both look identical.
     */
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, spec.timeoutMs);
    const onOuterAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onOuterAbort);

    try {
      const res = await doFetch(spec.endpoint, {
        method: "POST",
        signal: ctrl.signal,
        ...(isForm
          ? { body: payload as FormData }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
      });

      const raw = await res.json().catch(() => ({}));
      const serverSays = str((raw as { error?: unknown })?.error);

      if (res.status === 429) {
        emit("throttled", attempt, 429);
        // The route's own sentence distinguishes "slow down" from "out of budget"; ours
        // could not, so it is passed through rather than replaced — but only if it exists.
        return { state: "error", throttled: true, code: "rate-limited", ...(serverSays ? { error: serverSays } : {}) };
      }

      if (!res.ok) {
        const retryable = res.status >= 500 && attempt < spec.retries;
        if (retryable) { await sleep(BACKOFF[Math.min(attempt, BACKOFF.length - 1)]); continue; }
        emit("error", attempt, res.status);
        return { state: "error", code: `http-${res.status}`, ...(serverSays ? { error: serverSays } : {}) };
      }

      const data = spec.parse(raw);
      if (data === null || data === undefined) { emit("empty", attempt, res.status); return { state: "empty" }; }
      emit("success", attempt, res.status);
      return { state: "success", data };
    } catch (e) {
      // An abort from the OUTER signal is the user's decision and ends the run here — no
      // retry, no error message, nothing for them to read about a thing they stopped.
      if (opts.signal?.aborted && !timedOut) { emit("cancelled", attempt); return { state: "cancelled" }; }
      if (timedOut) {
        // The timeout budget, not the 5xx one. See `timeoutRetries`.
        if (attempt < spec.timeoutRetries) { await sleep(BACKOFF[Math.min(attempt, BACKOFF.length - 1)]); continue; }
        emit("error", attempt);
        return { state: "error", code: "timeout" };
      }
      if (attempt < spec.retries) { await sleep(BACKOFF[Math.min(attempt, BACKOFF.length - 1)]); continue; }
      emit("error", attempt);
      // The exception's own message ("ECONNRESET", "Failed to fetch") is a machine string
      // too, and telling a jobseeker their socket reset helps nobody. Dropped, not shown.
      void e;
      return { state: "error", code: "network" };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onOuterAbort);
    }
  }
}

/**
 * How many calls a task costs on its bucket. One, always — stated as a function because
 * the interesting part is the bucket, and a UI that wants to warn "you have used a lot of
 * these" needs to know which counter it is looking at.
 */
export function bucketOf(name: TaskName): Bucket {
  return TASKS[name].bucket;
}

/** Every task name, for tests and for the health check. */
export const TASK_NAMES = Object.keys(TASKS) as TaskName[];
