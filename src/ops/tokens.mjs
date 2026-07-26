/**
 * Measure this product's prompts with `count_tokens` — exactly, per model, for FREE.
 *
 * ── why this exists ──
 *
 * Every cache and model decision in `docs/cost.md` turns on one comparison: is the shared prefix
 * above or below a model's cache floor? The floors are 4096 on Haiku 4.5, 1024 on Sonnet 5 and 512
 * on Opus 5, and this product's prefix is around 2300 — so the answer is different for each model,
 * and being 10% out in the estimate is the difference between "caching is on" and "the markers are
 * silently ignored".
 *
 * `lib/aiEconomics.ts` estimates at 3.594 characters per token, calibrated against one logged call.
 * That is good enough to compare against a floor 1.8× away, and it is still an estimate. This script
 * removes the estimate.
 *
 * **It costs nothing.** `POST /v1/messages/count_tokens` returns a token count and no completion:
 * no output tokens, no input tokens billed, nothing on the invoice. Unlike `ops/ai-stages.mjs`,
 * which spends real credit, this can be run as often as you like.
 *
 * ── and why per model, not once ──
 *
 * Token counts are model-specific. Sonnet 5 uses a newer tokenizer that produces roughly 30% more
 * tokens for the same text than Sonnet 4.6, and Anthropic's migration guidance says plainly: do not
 * apply a blanket multiplier, re-run `count_tokens` against the model you will actually send to.
 * So this asks each model separately rather than measuring once and scaling.
 *
 *   ANTHROPIC_API_KEY=... node --experimental-strip-types ops/tokens.mjs
 */

import { CORE_RULES, TASK_SCHEMA } from "../app/lib/aiPrompts.ts";
import { CACHE_FLOORS, estimateTokens } from "../app/lib/aiEconomics.ts";
import { MAX_OUTPUT } from "../app/lib/aiModels.ts";
import { DRAFTING_DOCTRINE } from "../app/lib/prompts.ts";

const KEY = process.env.ANTHROPIC_API_KEY?.trim();
if (!KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n\n"
    + "This script bills NOTHING — count_tokens returns a count and no completion — but it still\n"
    + "needs a key to authenticate. Without one there is nothing to measure, so it stops here\n"
    + "rather than printing the estimates it exists to replace.",
  );
  process.exit(2);
}

/* The four tasks `/api/generate` actually accepts. The other names in MAX_OUTPUT are routed
   nowhere, and measuring a prompt no call sends would be measuring nothing. */
const LIVE_TASKS = ["role_blueprint", "experience_package", "final_content", "jd_delta"];
const MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"];

/**
 * One count. The system blocks are sent exactly as `/api/generate` sends them, including the
 * `cache_control` markers — a count of a prompt assembled differently would not be a count of this
 * product's prompt.
 */
async function count(model, system, message) {
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, system, messages: [{ role: "user", content: message }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.input_tokens;
}

/* A message of realistic size, so the reported total resembles a real request rather than the
   prefix alone. The prefix is what the floors apply to and it is reported separately. */
const SAMPLE_MESSAGE = [
  "Target role: Radiology Technologist", "Specialisation: CT and MRI",
  "Seniority: Mid", "Country: Saudi Arabia", "CV language: en",
].join("\n");

let failed = 0;
const measured = {};

for (const model of MODELS) {
  console.log(`\n══ ${model}  (cache floor ${CACHE_FLOORS[model]} tokens) ══`);
  measured[model] = {};

  /* CORE_RULES alone: the first cache breakpoint, shared by every task and every user, and the one
     whose floor verdict decides the whole caching question. */
  let core;
  try {
    core = await count(model, [{ type: "text", text: CORE_RULES }], "x");
  } catch (e) {
    console.error(`  ✗ CORE_RULES: ${e.message}`);
    failed++;
    continue;
  }
  /* The count includes the one-character message and whatever the model adds for the envelope, so
     it is an upper bound on CORE_RULES itself — stated, not silently subtracted. */
  const est = estimateTokens(CORE_RULES);
  const drift = ((core - est) / est) * 100;
  console.log(`  CORE_RULES + envelope   ${String(core).padStart(5)} tokens `
    + `(estimate ${est}, ${drift >= 0 ? "+" : ""}${drift.toFixed(1)}%)`);

  for (const task of LIVE_TASKS) {
    const system = [
      { type: "text", text: CORE_RULES, cache_control: { type: "ephemeral" } },
      { type: "text", text: TASK_SCHEMA[task] ?? "", cache_control: { type: "ephemeral" } },
    ];
    let total;
    try {
      total = await count(model, system, SAMPLE_MESSAGE);
    } catch (e) {
      console.error(`  ✗ ${task}: ${e.message}`);
      failed++;
      continue;
    }
    const msg = await count(model, [{ type: "text", text: "" }], SAMPLE_MESSAGE).catch(() => 0);
    const prefix = total - msg;
    const clears = prefix >= CACHE_FLOORS[model];
    measured[model][task] = { prefixTokens: prefix, messageTokens: msg };
    console.log(
      `  ${task.padEnd(20)} prefix ${String(prefix).padStart(5)}`
      + ` + message ${String(msg).padStart(4)} = ${String(total).padStart(5)}`
      + `   ${clears ? "✅ caches" : "❌ BELOW FLOOR — markers ignored"}`
      + `   (output cap ${MAX_OUTPUT[task]})`,
    );
  }
}

/* `/api/suggest`'s only stable text, for the same floor question. It carries no cache_control at
   all today, and the claim in docs/cost.md is that this is correct rather than an oversight. */
console.log("\n══ /api/suggest — its only stable text ══");
for (const model of MODELS) {
  try {
    const n = await count(model, [{ type: "text", text: DRAFTING_DOCTRINE }], "x");
    console.log(`  ${model.padEnd(18)} ${String(n).padStart(5)} tokens`
      + `   ${n >= CACHE_FLOORS[model] ? "would cache" : `below its ${CACHE_FLOORS[model]} floor — nothing to mark`}`);
  } catch (e) {
    console.error(`  ✗ ${model}: ${e.message}`);
    failed++;
  }
}

console.log("\n── measured counts, for aiEconomics.cheapestModelFor({ measured }) ──");
console.log(JSON.stringify(measured, null, 2));

console.log(
  `\nBilled for this run: $0.00 — count_tokens returns a count, not a completion.`
  + `${failed ? `\n${failed} request(s) failed; the figures above are incomplete.` : ""}`,
);
process.exit(failed === 0 ? 0 : 1);
