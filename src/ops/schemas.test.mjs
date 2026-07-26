/**
 * The JSON Schemas for `output_config.format` — valid subset, and the same keys as the prose.
 *
 * ── what this can and cannot prove ──
 *
 * It CAN prove the schemas are inside Anthropic's documented JSON Schema subset, that every object
 * carries `additionalProperties: false` (required, not optional), that no unsupported keyword is
 * present, and — the assertion worth having — that each schema's keys are exactly the keys the prose
 * schema in `aiPrompts.ts` promises and the route's parser reads. A key added to one and not the
 * other is how a structured-output migration silently starts dropping a field.
 *
 * It CANNOT prove that a schema-constrained model still honours the LIMITS prose ("exactly 3
 * summaries", "one improved bullet per line the user wrote and NOT ONE MORE"). Those bounds are not
 * expressible in the subset, so they stay in the prompt and in the route's own validator. Settling
 * that needs one real run — which is why the feature is off by default.
 *
 *   node --experimental-strip-types ops/schemas.test.mjs
 */

import { OUTPUT_SCHEMA, outputConfigFor, structuredOutputsEnabled } from "../app/lib/aiSchemas.ts";
import { TASK_SCHEMA } from "../app/lib/aiPrompts.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const TASKS = ["role_blueprint", "experience_package", "final_content", "jd_delta"];

/* ─────────────── 1. one schema per live task ─────────────── */

console.log("\n── a schema for every task /api/generate accepts ──");

for (const task of TASKS) {
  ok(`${task} has a JSON schema`, Boolean(OUTPUT_SCHEMA[task]));
  ok(`${task} has a prose schema too`, (TASK_SCHEMA[task] ?? "").length > 0);
}
ok("no schema for a task that is routed nowhere",
  !OUTPUT_SCHEMA.occupation_classify && !OUTPUT_SCHEMA.bullet_rewrite);

/* ─────────────── 2. inside the documented subset ─────────────── */

console.log("\n── the documented JSON Schema subset, walked ──");

/*
 * Explicitly NOT supported, per the docs: recursive schemas, numeric constraints (minimum, maximum,
 * multipleOf), string constraints (minLength, maxLength), complex array constraints, and
 * `additionalProperties` set to anything but false. The SDKs strip these client-side; a raw HTTP
 * call — which is what this product makes — does not, so an unsupported keyword reaches the API.
 */
const FORBIDDEN = [
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern",
  "minItems", "maxItems", "uniqueItems", "contains",
  "$ref", "$defs", "definitions", "oneOf", "not", "if", "then", "else",
  "patternProperties", "propertyNames", "dependentSchemas",
];
const ALLOWED = new Set([
  "type", "properties", "items", "required", "additionalProperties", "description",
  "enum", "const", "anyOf", "allOf", "format",
]);

let objects = 0, problems = [];
function walk(node, path) {
  if (!node || typeof node !== "object") return;
  for (const key of Object.keys(node)) {
    if (FORBIDDEN.includes(key)) problems.push(`${path}.${key} is not in the supported subset`);
    else if (!ALLOWED.has(key)) problems.push(`${path}.${key} is not a recognised keyword`);
  }
  if (node.type === "object") {
    objects++;
    /* Required, not optional — the docs list it under "Supported" with the note that it is required
       for all objects. Omitting it is a 400, not a lenient default. */
    if (node.additionalProperties !== false) problems.push(`${path} is missing additionalProperties: false`);
    if (!node.properties || Object.keys(node.properties).length === 0) problems.push(`${path} has no properties`);
    for (const [k, v] of Object.entries(node.properties ?? {})) walk(v, `${path}.${k}`);
  }
  if (node.type === "array") {
    if (!node.items) problems.push(`${path} is an array with no items schema`);
    walk(node.items, `${path}[]`);
  }
}

for (const task of TASKS) walk(OUTPUT_SCHEMA[task], task);

ok("every schema stays inside the supported subset", problems.length === 0, problems.join("; "));
ok("the walk actually visited nested objects", objects >= TASKS.length + 4, `${objects} objects`);

/* Serialisable — a schema that cannot be JSON-stringified cannot be sent. */
for (const task of TASKS) {
  ok(`${task} round-trips through JSON`, (() => {
    try { return JSON.parse(JSON.stringify(OUTPUT_SCHEMA[task])).type === "object"; }
    catch { return false; }
  })());
}

/* ─────────────── 3. the same keys as the prose promises ─────────────── */

console.log("\n── the JSON schema and the prose schema agree, key for key ──");

/*
 * The prose schemas are written as a literal JSON example, so the top-level keys can be read out of
 * them: lines of the form `  "keyName": …` at one level of indentation inside the example block.
 * Deriving them beats listing them here — a list here would be a third place to forget.
 */
function proseKeys(text) {
  const keys = new Set();
  for (const line of text.split("\n")) {
    const m = /^\s{2}"([A-Za-z][A-Za-z0-9_]*)":/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

for (const task of TASKS) {
  const prose = proseKeys(TASK_SCHEMA[task] ?? "");
  const json = new Set(Object.keys(OUTPUT_SCHEMA[task].properties));
  ok(`${task}: the prose example yielded keys`, prose.size >= 5, `${prose.size} found`);

  const missing = [...prose].filter((k) => !json.has(k));
  const extra = [...json].filter((k) => !prose.has(k));
  ok(`${task}: no key in the prose is missing from the schema`, missing.length === 0, missing.join(","));
  ok(`${task}: no key in the schema is absent from the prose`, extra.length === 0, extra.join(","));

  /* "One object, these keys, nothing else" — so every key is required, matching the prose exactly. */
  ok(`${task}: every key is required`,
    OUTPUT_SCHEMA[task].required.length === json.size);
}

/* A couple of shapes checked by hand, because a key-name match would pass even if every value were
   the wrong type. These are the two fields whose shape the parsers depend on most. */
{
  const bp = OUTPUT_SCHEMA.role_blueprint.properties;
  ok("role_blueprint.confidence is a number, not a string", bp.confidence.type === "number");
  ok("role_blueprint.skillGroups is an array of {label, items[]}",
    bp.skillGroups.type === "array"
    && bp.skillGroups.items.properties.items.type === "array"
    && bp.skillGroups.items.properties.items.items.type === "string");

  const fc = OUTPUT_SCHEMA.final_content.properties;
  ok("final_content.summaries is an array of {label, text}",
    fc.summaries.items.required.join(",") === "label,text");

  const ep = OUTPUT_SCHEMA.experience_package.properties;
  ok("experience_package.improvedUserBullets keeps original and improved paired",
    ep.improvedUserBullets.items.required.join(",") === "original,improved");
}

/* ─────────────── 4. off by default, and off means absent ─────────────── */

console.log("\n── the switch ──");

/*
 * Default-off is the whole safety story here: these schemas have never been sent to the API. "Off"
 * therefore has to mean the parameter is ABSENT from the request body, not present-and-empty — a
 * malformed `output_config` would be a 400 on every generation.
 */
delete process.env.ANTHROPIC_STRUCTURED_OUTPUTS;
ok("off when the variable is unset", structuredOutputsEnabled() === false);
ok("and the request carries no output_config at all",
  Object.keys(outputConfigFor("final_content")).length === 0);

for (const v of ["0", "false", "no", "off", "", "  ", "maybe"]) {
  process.env.ANTHROPIC_STRUCTURED_OUTPUTS = v;
  ok(`"${v}" does not enable it`, structuredOutputsEnabled() === false);
}

for (const v of ["1", "true", "yes", "on", "TRUE", " on "]) {
  process.env.ANTHROPIC_STRUCTURED_OUTPUTS = v;
  ok(`"${v}" enables it`, structuredOutputsEnabled() === true);
}

/* And when on, the wire shape must be exactly what the API documents. */
{
  process.env.ANTHROPIC_STRUCTURED_OUTPUTS = "1";
  const cfg = outputConfigFor("final_content");
  ok("the wire shape is output_config.format.type = json_schema",
    cfg.output_config?.format?.type === "json_schema");
  ok("and it carries the schema itself",
    cfg.output_config?.format?.schema?.properties?.summaries?.type === "array");
  /* A task with no schema must still produce a body the API accepts. */
  ok("a task without a schema adds nothing rather than a null format",
    Object.keys(outputConfigFor("ask_section")).length === 0);
  delete process.env.ANTHROPIC_STRUCTURED_OUTPUTS;
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
