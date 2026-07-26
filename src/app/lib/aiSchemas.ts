/**
 * The four task shapes as JSON Schema, for `output_config.format`.
 *
 * ── what this buys, and it is the largest AI saving left ──
 *
 * Today `/api/generate` ASKS for JSON in prose ("Return STRICT JSON ONLY"), parses what comes back,
 * and when the parse or the validation fails it escalates: `schema-invalid-retry` sends the whole
 * request again to `claude-sonnet-5`. So one malformed brace costs the failed Haiku call PLUS a
 * Sonnet call — measured shapes put `final_content` at $0.005040 + $0.014370 = $0.019410, nearly
 * four times a clean call, for a response whose CONTENT was probably fine.
 *
 * Structured outputs remove that class of failure rather than retrying it. The API constrains the
 * response to the schema, so "the model wrapped its JSON in prose" and "the model dropped a key"
 * stop being possible. Supported on Claude Haiku 4.5 — which matters, because a feature only the
 * expensive tier had would not be a saving.
 *
 * ── what it does NOT buy, and why the prose schemas stay ──
 *
 * Structured outputs enforce SHAPE, not SIZE. The documented JSON Schema subset has no
 * `minItems`/`maxItems`, no `minLength`/`maxLength`, no numeric bounds — so "exactly 3 summaries",
 * "12-15 skills in total", "one improved bullet per line the user wrote and NOT ONE MORE" cannot be
 * expressed here. Those are the rules that stop the model inventing content, and they are the whole
 * point of `TASK_SCHEMA`'s LIMITS blocks. The prose keeps them, the API guarantees the container,
 * and `validate()` in the route still checks both. Three layers, none redundant.
 *
 * Also not free of constraints: `additionalProperties: false` is REQUIRED on every object, recursive
 * schemas are rejected, and a new schema pays a one-time compilation latency (cached 24 hours after
 * that). `ops/schemas.test.mjs` asserts the subset rather than trusting this paragraph.
 *
 * ── ON by default, and what it took to earn that ──
 *
 * A local test can prove these schemas are valid, inside the documented subset, and name exactly the
 * keys the prompts promise and the parsers read. It cannot prove the PROVIDER accepts them. So
 * `GET /api/health/ai?live=1` sends one real generation per schema and reports acceptance, whether the
 * body parsed, whether the keys matched, and `stop_reason`. All four passed on production with the
 * production caps — see `structuredOutputsEnabled` for the numbers.
 *
 * `ANTHROPIC_STRUCTURED_OUTPUTS=0` turns it off without a deploy.
 *
 * No `next/*` imports — the tests load this in plain Node.
 */

import type { AiTaskType } from "./aiModels.ts";

/** The documented subset. Narrow on purpose: a keyword absent here is a keyword the API rejects. */
export interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: false;
  description?: string;
}

/** `["a string"]` — the shape most of these fields are. */
const strings = (description: string): JsonSchema => ({
  type: "array", items: { type: "string" }, description,
});

/** `[{a, b}]` — a pair of strings, both required, nothing else permitted. */
const pairs = (a: string, b: string, description: string): JsonSchema => ({
  type: "array",
  description,
  items: {
    type: "object",
    properties: { [a]: { type: "string" }, [b]: { type: "string" } },
    required: [a, b],
    additionalProperties: false,
  },
});

const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  /* Every key required, matching the prose: "One object, these keys, nothing else". An optional key
     is a key the parser has to defend against, and the parsers here expect all of them. */
  required: Object.keys(properties),
  additionalProperties: false,
});

/**
 * One schema per task, mirroring `TASK_SCHEMA` in `aiPrompts.ts` key for key.
 *
 * The mirroring is asserted, not merely intended: `ops/schemas.test.mjs` extracts the key names from
 * the prose schema and compares the two sets. A key added to one and not the other is how a
 * structured-output migration silently starts dropping a field.
 */
export const OUTPUT_SCHEMA: Partial<Record<AiTaskType, JsonSchema>> = {
  role_blueprint: object({
    normalizedOccupation: { type: "string", description: "the canonical title, in the output language" },
    alternativeTitles: strings("at most 3 titles the same job is advertised under"),
    skillGroups: {
      type: "array",
      description: "3-4 groups, 12-15 items in total",
      items: {
        type: "object",
        properties: { label: { type: "string" }, items: { type: "array", items: { type: "string" } } },
        required: ["label", "items"],
        additionalProperties: false,
      },
    },
    commonTools: strings("named tools and equipment"),
    commonSystems: strings("named software and information systems"),
    responsibilityThemes: strings("a theme, 2-5 words, not a full resume line"),
    credentialSuggestions: pairs("id", "why", "only ids given in the request"),
    achievementQuestions: strings("a question whose answer is one concrete figure — NO DIGITS"),
    importantKeywords: strings("a term an ATS scans for"),
    regulatoryWarnings: strings("one clause, only if the request's rules imply one"),
    /* `number`, not `integer`: the prose asks for 0..1 and the bound is unexpressible in this
       subset, so the route's own validator keeps checking it. */
    confidence: { type: "number", description: "0 to 1, your certainty about the occupation" },
  }),

  experience_package: object({
    responsibilitySuggestions: strings("a complete resume line"),
    relevantTools: strings("tools this specific role would use"),
    achievementQuestions: strings("a question whose answer is one figure"),
    improvedUserBullets: pairs("original", "improved", "one per line the user wrote, and not one more"),
    missingEvidenceQuestions: strings("what a recruiter would look for and cannot find"),
    warnings: strings("one clause, only for a real problem"),
  }),

  final_content: object({
    summaries: pairs("label", "text", "exactly 3, each a different angle on the same facts"),
    sectionOrder: strings("section ids present in the request, in order"),
    priorityKeywords: strings("keywords worth surfacing for the target job"),
    shortenSuggestions: pairs("original", "shorter", "the same facts, fewer words"),
    duplicateWarnings: strings("two lines that say the same thing, named"),
    languageFixes: pairs("original", "fixed", "the corrected line"),
  }),

  jd_delta: object({
    requirements: strings("a stated hard requirement of THIS advert"),
    preferred: strings("a stated nice-to-have"),
    vocabulary: strings("a term this advert uses that the generic role vocabulary does not"),
    extraKeywords: strings("an ATS term in the advert and absent from the baseline"),
    conflicts: strings("one clause, when the advert describes two different roles"),
  }),
};

/**
 * Is the API asked to enforce the schema? ON by default, since 2026-07-26.
 *
 * ── what changed, and what it took ──
 *
 * This was off by default while the schemas had never been sent to the provider. They have now been
 * sent, on production, with the production prompt and the production output caps — all four accepted,
 * every body parsed, every key set matched exactly, `stop_reason: "end_turn"` throughout:
 *
 *   role_blueprint      200  373 output tokens of 1400
 *   experience_package  200  351 of 1100
 *   final_content       200  249 of 900
 *   jd_delta            200   48 of 500
 *
 * Getting there took two corrections worth remembering. The first probe tested `jd_delta` alone and
 * printed "safe to turn on" — a verdict about four schemas from evidence about one. The second tested
 * all four but capped output at a flat 300, which starved `role_blueprint` (eleven keys, a nested
 * array-of-objects) into returning truncated JSON that read exactly like a broken schema.
 *
 * ── the off switch stays ──
 *
 * `ANTHROPIC_STRUCTURED_OUTPUTS=0` disables it without a deploy. A feature that changes every
 * generation's request shape needs a way to be switched off by someone watching a graph at 2am, and
 * that person should not have to wait for a build.
 */
export const structuredOutputsEnabled = (): boolean => {
  const raw = (process.env.ANTHROPIC_STRUCTURED_OUTPUTS ?? "").trim();
  if (!raw) return true;                          // default: on
  return !/^(0|false|no|off)$/i.test(raw);        // anything else, including "1", leaves it on
};

/**
 * The `output_config` for one task, or `{}` to spread into a request body that should not carry one.
 *
 * Returning a spreadable object rather than `null` keeps the call site free of a conditional, and
 * keeps "no schema for this task" and "the feature is off" the same safe outcome.
 */
export function outputConfigFor(task: AiTaskType): Record<string, unknown> {
  if (!structuredOutputsEnabled()) return {};
  return schemaRequestFor(task);
}

/**
 * The `output_config` for one task, IGNORING the switch.
 *
 * Exists so the health endpoint can validate the schemas against the real API while the feature is
 * still off — which is the only way the switch ever gets flipped for a stated reason instead of a
 * hope. Nothing on a user path calls this; `outputConfigFor` is the gated door.
 */
export function schemaRequestFor(task: AiTaskType): Record<string, unknown> {
  const schema = OUTPUT_SCHEMA[task];
  if (!schema) return {};
  return { output_config: { format: { type: "json_schema", schema } } };
}
