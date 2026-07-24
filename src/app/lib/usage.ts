/**
 * Token accounting.
 *
 * Every provider returns what a request cost and this codebase threw it away, so
 * "what does a resume cost us?" had no answer that wasn't a guess. Each call now
 * logs one line; Vercel's runtime logs are the ledger.
 *
 * The line is greppable and machine-readable on purpose — `[usage]` then JSON —
 * so a day of real traffic can be summed without adding a database.
 */

export interface UsageLine {
  /** Which endpoint spent it. */
  route: string;
  /** Which sub-operation — turn, draft, gaps, rephrase, optimize. */
  op: string;
  provider: "nvidia" | "anthropic";
  model: string;
  input: number;
  output: number;
  /** Anthropic only: tokens served from cache at ~0.1x, and written at ~1.25x. */
  cacheRead?: number;
  cacheWrite?: number;
  ms: number;
  /** Why a line's counts are untrustworthy, when they are. Absent means clean. */
  note?: string;
}

/** OpenAI-compatible (NVIDIA) usage block. */
export function fromOpenAI(raw: unknown): { input: number; output: number } {
  const u = (raw as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  return {
    input: Number(u.prompt_tokens) || 0,
    output: Number(u.completion_tokens) || 0,
  };
}

/** Anthropic Messages usage block. */
export function fromAnthropic(raw: unknown): {
  input: number; output: number; cacheRead: number; cacheWrite: number;
} {
  const u = (raw as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  return {
    input: Number(u.input_tokens) || 0,
    output: Number(u.output_tokens) || 0,
    cacheRead: Number(u.cache_read_input_tokens) || 0,
    cacheWrite: Number(u.cache_creation_input_tokens) || 0,
  };
}

/**
 * Emit one ledger line. Never throws and never blocks the response — a broken
 * meter must not break the product it is measuring.
 */
export function logUsage(line: UsageLine): void {
  try {
    // Token counts are integers about a request, not user content — nothing here
    // carries what the user wrote.
    console.log("[usage]", JSON.stringify(line));
  } catch { /* accounting is never worth an exception */ }
}

/**
 * Sum a set of ledger lines into a per-resume cost, in USD.
 * Rates are per million tokens. Exported so a test can price a real session
 * instead of quoting a table.
 */
export function priceUsd(
  lines: Array<Pick<UsageLine, "input" | "output" | "cacheRead">>,
  rate: { input: number; output: number; cacheRead?: number },
): number {
  const cacheRate = rate.cacheRead ?? rate.input * 0.1;
  return lines.reduce((sum, l) =>
    sum + (l.input * rate.input + l.output * rate.output + (l.cacheRead ?? 0) * cacheRate) / 1_000_000,
  0);
}
