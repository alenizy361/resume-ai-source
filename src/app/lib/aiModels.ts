/**
 * Which model answers which question, and what it costs.
 *
 * Before this file the answer was "whatever `ANTHROPIC_MODEL_SUGGEST` says", resolved inline
 * in `/api/suggest` and again in `/api/interview` and a third time in `/api/health/ai` — three
 * copies of the same ladder, already drifted (interview defaults to Opus, suggest to Haiku,
 * and health had to reimplement both to describe them). A fourth copy for every new task is
 * how a cheap task quietly ends up on an expensive model.
 *
 * So: one ladder, one place, named by TASK rather than by route.
 *
 * ── the measurement this is built on ──
 *
 * `ops/titles-bench.mjs` ran the same drafting prompt over 111 occupations on each model,
 * scored identically:
 *
 *   meta/llama-4-maverick   70% clean, 2101 ms median, 0.9% hangs   (free)
 *   claude-haiku-4-5        75% clean, 6586 ms median, no hangs
 *   claude-opus-5            —         ~19000 ms median, 43% hangs
 *
 * Opus is not a "better" choice for a form field; it is an unusable one, and 43% is not a
 * tail. That is why the ladder starts at the bottom and why escalation needs a stated reason
 * rather than a hunch. Production has since measured Haiku at 2715 ms on a real suggestion —
 * one call, not a bench, but it suggests the 6586 ms figure was pessimistic.
 *
 * ── what this file will NOT do ──
 *
 * It will not escalate because a user pressed Regenerate. A regenerate is the same task with
 * a different variation instruction; treating impatience as difficulty is how a cost ceiling
 * becomes a cost floor.
 */

/* ─────────────────────────── task classes ─────────────────────────── */

/**
 * The unit of routing. Named for the WORK, not the endpoint, because two routes can want the
 * same class of thinking and one route can want two.
 */
export type AiTaskType =
  /* the three combined generations that replace per-section calls */
  | "role_blueprint"
  | "experience_package"
  | "final_content"
  /* narrow follow-ups, only after an explicit user action */
  | "occupation_classify"
  | "bullet_rewrite"
  | "achievement_write"
  | "jd_delta"
  | "ask_section";

export type TaskClass = "fast" | "reasoning";

/**
 * Which class each task starts on. Every one of these starts `fast` — the ladder only goes
 * up, and only with a reason from `EscalationReason`.
 *
 * `final_content` is the interesting entry. Synthesising a summary across several senior
 * experiences is genuinely the hardest thing here, and the temptation is to give it the
 * strong model by default. It does not get one: most CVs have one or two experiences and a
 * clear target, which Haiku handles, and `senior-summary` exists to escalate the minority
 * that do not. Defaulting to the strong model would pay for the hard case on every CV.
 */
export const TASK_CLASS: Record<AiTaskType, TaskClass> = {
  role_blueprint: "fast",
  experience_package: "fast",
  final_content: "fast",
  occupation_classify: "fast",
  bullet_rewrite: "fast",
  achievement_write: "fast",
  jd_delta: "fast",
  ask_section: "fast",
};

/**
 * Output ceiling per task, in tokens. NOT one number for all of them.
 *
 * `/api/suggest` used `json ? 900 : 500` for every kind — a bullet rewrite (one line) and a
 * skills-group response (fifteen labels) given the same budget. The ceiling does not cost
 * anything by itself, but it is the only thing standing between a chatty model and a response
 * that has to be trimmed after it has been paid for.
 *
 * Sized from the shapes in Part 3 / Part 17 of the brief, plus JSON overhead:
 *
 *   role_blueprint      15 skills + 8 themes + 6 credentials + 6 questions + 12 keywords
 *   experience_package  6 responsibilities + 5 questions + rewrites of what the user wrote
 *   final_content       3 summaries at CV length + short recommendations
 *   bullet_rewrite      one line
 */
export const MAX_OUTPUT: Record<AiTaskType, number> = {
  role_blueprint: 1400,
  experience_package: 1100,
  final_content: 900,
  occupation_classify: 120,
  bullet_rewrite: 160,
  achievement_write: 400,
  jd_delta: 500,
  ask_section: 400,
};

/** Per-task wall-clock ceiling. A form field and a whole-CV synthesis do not wait alike. */
export const TASK_TIMEOUT_MS: Record<AiTaskType, number> = {
  role_blueprint: 25_000,
  experience_package: 25_000,
  final_content: 30_000,
  occupation_classify: 10_000,
  bullet_rewrite: 15_000,
  achievement_write: 20_000,
  jd_delta: 20_000,
  ask_section: 15_000,
};

/* ─────────────────────────── the configured models ─────────────────────────── */

export interface ModelConfig {
  fastModel: string;
  reasoningModel: string;
  fallbackModel: string;
  /** Bumped when any of the three changes, so cache keys stop matching. See `aiCache.ts`. */
  version: string;
}

/**
 * Defaults, used when the environment says nothing.
 *
 * Haiku for `fast` because the bench says it is the cheapest Claude that clears the quality
 * bar. Sonnet — not Opus — for `reasoning`: Opus measured 43% hangs on this workload, so as
 * an escalation target it would trade a quality problem for an availability problem.
 */
const DEFAULTS: Omit<ModelConfig, "version"> = {
  fastModel: "claude-haiku-4-5",
  reasoningModel: "claude-sonnet-5",
  fallbackModel: "claude-haiku-4-5",
};

/**
 * A model id we are willing to send.
 *
 * Deliberately a shape check and not an allowlist of exact names: pinning exact ids here means
 * a new model release is a code change, and the failure mode of a wrong-but-plausible id is a
 * 404 from the provider with a clear message. The failure mode this DOES catch is the one that
 * has already happened in this codebase — an NVIDIA model id (`meta/llama-…`) reaching an
 * Anthropic call, which is a 404 that reads like an outage.
 */
function validClaudeId(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!/^claude-[a-z0-9.\-]+$/i.test(s)) return null;
  return s;
}

/**
 * Resolve the ladder from the environment, once per process.
 *
 * `ANTHROPIC_MODEL_SUGGEST` is honoured as the fast model because it is already set in
 * production and silently ignoring it would change behaviour under someone's feet. It is
 * read second so an explicit `ANTHROPIC_MODEL_FAST` wins.
 *
 * `ANTHROPIC_MODEL` is deliberately NOT consulted. That variable steers `/api/interview`,
 * where the default is Opus, and inheriting it here would put a 19-second median behind a
 * form field — the exact mistake `/api/suggest` was split out to avoid.
 */
export function modelConfig(): ModelConfig {
  const rejected: string[] = [];
  const pick = (name: string, raw: string | undefined, fallback: string): string => {
    const ok = validClaudeId(raw);
    if (raw?.trim() && !ok) rejected.push(name);
    return ok ?? fallback;
  };

  const fastModel = pick(
    "ANTHROPIC_MODEL_FAST",
    process.env.ANTHROPIC_MODEL_FAST || process.env.ANTHROPIC_MODEL_SUGGEST,
    DEFAULTS.fastModel,
  );
  const reasoningModel = pick("ANTHROPIC_MODEL_REASONING", process.env.ANTHROPIC_MODEL_REASONING, DEFAULTS.reasoningModel);
  const fallbackModel = pick("ANTHROPIC_MODEL_FALLBACK", process.env.ANTHROPIC_MODEL_FALLBACK, fastModel);

  if (rejected.length) {
    // Names only. A rejected value is still a configured value and may carry information the
    // operator considers private; the name is enough to fix it.
    console.error(
      `[ai] ignoring ${rejected.join(", ")}: not a Claude model id (expected claude-…). `
      + `Using defaults for those.`,
    );
  }

  return {
    fastModel, reasoningModel, fallbackModel,
    version: `${fastModel}|${reasoningModel}|${fallbackModel}`,
  };
}

/* ─────────────────────────── escalation ─────────────────────────── */

/**
 * Every reason the strong model may be used. A closed union on purpose: "it felt hard" is not
 * in it, and neither is "the user pressed the button again".
 */
export type EscalationReason =
  /** The occupation classifier was not sure enough to build a blueprint on. */
  | "low-confidence"
  /** Structured output failed validation once, safely retried, failed again. */
  | "schema-invalid-retry"
  /** The job advert describes more than one role and they conflict. */
  | "conflicting-jd"
  /** The user asked for advanced tailoring, explicitly. */
  | "user-tailoring"
  /** Content has to be synthesised across scripts, not merely translated. */
  | "multilingual-synthesis"
  /** The summary has to reconcile several senior experiences. */
  | "senior-summary"
  /** The cheap output failed an objective post-check (see `qualityFloor`). */
  | "quality-check-failed";

export interface Route {
  model: string;
  taskClass: TaskClass;
  escalated: boolean;
  /** Null unless `escalated`. Logged on every escalation, per Part 8. */
  reason: EscalationReason | null;
  maxOutput: number;
  timeoutMs: number;
}

/**
 * Choose the model for one attempt.
 *
 * The signature takes reasons rather than booleans-with-comments so that an escalation cannot
 * happen without one, and so the log line writes itself.
 */
/**
 * May this model be given a `temperature`?
 *
 * ── measured, on production ──
 *
 * An Arabic `experience_package` escalated to `claude-sonnet-5` and the provider answered HTTP 400.
 * The same request body was accepted by `claude-haiku-4-5` twice in the same second. The only
 * per-model difference in that body is `temperature: 0.3`, and the 4.6-and-later models reason by
 * default — extended thinking requires temperature 1, so any other value is rejected outright.
 *
 * So the parameter is sent only where it is both valid and useful: to the fast models, where it
 * keeps schema-shaped JSON stable. Omitting it elsewhere costs nothing — the output is constrained
 * by a schema and validated on arrival, not by sampling.
 *
 * Named as a family test rather than a list of exact ids, because the ids are configurable through
 * environment variables and a list would silently stop covering an override.
 */
export function acceptsTemperature(model: string): boolean {
  const m = model.toLowerCase();
  /* Haiku 4.5 and everything older: no default thinking, temperature honoured. */
  if (m.includes("haiku")) return true;
  if (/-(4-5|4-0|3-7|3-5)/.test(m)) return true;
  /* Sonnet 5, Opus 5, Fable 5, and the 4.6+ line: reasoning is on by default. */
  return false;
}

/**
 * Does this model think unless told not to?
 *
 * The same fact `acceptsTemperature` encodes, read the other way round, and deliberately NOT a
 * second regex: a model rejects `temperature` *because* extended thinking is on, so two
 * independent lists of ids would be two chances to disagree about one property.
 *
 * ── why this matters, and it is not a style question ──
 *
 * `max_tokens` is a hard cap on thinking PLUS response text. Every call in this product sends
 * `max_tokens: MAX_OUTPUT[task]` — 900 for `final_content`, 500 for `jd_delta` — sized for a JSON
 * payload and nothing else, because it was sized on Haiku, which does not think.
 *
 * The escalation path routes to `claude-sonnet-5`, which does. So an escalated call spends part of
 * a 900-token budget on reasoning and returns a truncated answer with `stop_reason: "max_tokens"`
 * — and those reasoning tokens are billed as output, at $15/M. That is the worse half: the
 * escalation is TRIGGERED by `schema-invalid-retry`, so the rescue for invalid JSON was a call
 * more likely to produce invalid JSON, at three times the price.
 */
export const thinksByDefault = (model: string): boolean => !acceptsTemperature(model);

/**
 * May `thinking: {type: "disabled"}` be sent to this model?
 *
 * Fable 5 and Mythos 5 think unconditionally and answer HTTP 400 to an explicit disable — the
 * parameter must be omitted instead. Nothing configures them here, but `ANTHROPIC_MODEL_REASONING`
 * is an environment variable, so "nothing configures them" is not a guarantee, and a 400 behind a
 * form field is exactly the failure this file exists to prevent.
 */
export const canDisableThinking = (model: string): boolean => {
  const m = model.toLowerCase();
  if (m.includes("fable") || m.includes("mythos")) return false;
  return true;
};

/**
 * Multiplier on `max_tokens` for a model that thinks and cannot be told to stop.
 *
 * Only reachable by configuring an always-thinking model as the reasoning tier. Four is not a
 * measurement — no such call has been made here — it is enough room that a truncated answer is
 * unlikely, chosen over leaving a known truncation trap behind a comment. The ceiling costs
 * nothing unless it is used.
 */
export const THINKING_HEADROOM = 4;

/** `max_tokens` for one call: the task's cap, plus room for reasoning only where it is forced. */
export function outputBudget(task: AiTaskType, model: string): number {
  const cap = MAX_OUTPUT[task];
  if (thinksByDefault(model) && !canDisableThinking(model)) return cap * THINKING_HEADROOM;
  return cap;
}

export function routeModel(
  task: AiTaskType,
  opts: { escalate?: EscalationReason | null; config?: ModelConfig } = {},
): Route {
  const cfg = opts.config ?? modelConfig();
  const reason = opts.escalate ?? null;
  const taskClass: TaskClass = reason ? "reasoning" : TASK_CLASS[task];
  return {
    model: taskClass === "reasoning" ? cfg.reasoningModel : cfg.fastModel,
    taskClass,
    escalated: reason !== null,
    reason,
    maxOutput: MAX_OUTPUT[task],
    timeoutMs: TASK_TIMEOUT_MS[task],
  };
}

/**
 * The objective quality check that can justify one escalation, and nothing softer.
 *
 * Three failures, each of which makes a response worse than useless rather than merely thin:
 *
 *   too short   — a blueprint with two skills is not a cheaper blueprint, it is a wrong one
 *   wrong script — an Arabic CV whose suggestions came back in English, which this product
 *                  has shipped before and which no amount of retrying the same model fixes
 *   duplicated  — the same string repeated to fill the shape
 *
 * Returns a reason to escalate, or null to accept. Note what is absent: no judgement of
 * whether the content is GOOD. That is `ops/titles-bench.mjs`'s job, offline, where it can be
 * scored against 111 occupations instead of guessed at per request.
 */
export function qualityFloor(
  items: string[],
  opts: { min: number; cvLang: "ar" | "en" },
): EscalationReason | null {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  if (clean.length < opts.min) return "quality-check-failed";

  const unique = new Set(clean.map((s) => s.toLowerCase()));
  if (unique.size < clean.length * 0.7) return "quality-check-failed";

  /*
   * Script check, and it is deliberately a MAJORITY test rather than "every string".
   *
   * An Arabic CV legitimately carries Latin tokens — PACS, DICOM, SCFHS, Microsoft Excel — so
   * requiring Arabic in every line would reject correct output. What it catches is the real
   * failure: a response that is English prose with an Arabic word in it, or none at all.
   */
  const arabic = clean.filter((s) => /[؀-ۿ]/.test(s)).length;
  if (opts.cvLang === "ar" && arabic < clean.length * 0.5) return "quality-check-failed";
  if (opts.cvLang === "en" && arabic > clean.length * 0.5) return "quality-check-failed";

  return null;
}

/* ─────────────────────────── cost ─────────────────────────── */

/**
 * Per-million-token rates, for INTERNAL ESTIMATION ONLY.
 *
 * The invoice is the authority; this exists so a log line can carry a number without waiting
 * for a billing cycle, and so "cost per completed CV" is answerable today. Rates are the
 * first-party Anthropic API prices as of 2026-07; an unknown model estimates as the fast tier
 * rather than throwing, because a meter that can crash is worse than one that is approximate.
 *
 * `cacheRead` is 10% of input and `cacheWrite` is 125%, which is the published multiplier
 * shape rather than a per-model figure — the point of the estimate is the order of magnitude.
 */
const RATES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-fable-5": { input: 10, output: 50 },
};

const FREE = 0;

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Estimated USD for one call. NVIDIA's models are free on this plan and return 0 — which is
 * the whole reason the ATS review stays there.
 */
export function estimateCallCost(model: string, t: TokenCounts): number {
  if (!/^claude/i.test(model)) return FREE;
  const rate = RATES[model] ?? RATES["claude-haiku-4-5"];
  const uncachedIn = Math.max(0, t.input);
  return (
    uncachedIn * rate.input
    + t.output * rate.output
    + (t.cacheRead ?? 0) * rate.input * 0.1
    + (t.cacheWrite ?? 0) * rate.input * 1.25
  ) / 1_000_000;
}

/** Cache hit rate for a set of calls: read tokens as a share of all input tokens seen. */
export function cacheHitRate(lines: TokenCounts[]): number {
  let read = 0, total = 0;
  for (const l of lines) {
    read += l.cacheRead ?? 0;
    total += l.input + (l.cacheRead ?? 0);
  }
  return total === 0 ? 0 : read / total;
}
