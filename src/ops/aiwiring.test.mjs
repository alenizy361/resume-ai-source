/**
 * Is every AI stage actually WIRED — and does the live harness still cover all of them?
 *
 * ── the gap between this and `ops/ai-stages.mjs` ──
 *
 * That harness proves the stages work by calling them, and it costs money, so it runs when someone
 * decides to spend. This costs nothing and runs on every `npm test`, and it answers the question
 * that a paid run cannot answer *later*: has anything drifted since?
 *
 * Three kinds of drift, all of which have happened in products of this shape:
 *
 *   1. A client task points at an endpoint that no longer exists. The UI shows a button, the fetch
 *      404s, and the section says "unavailable" — indistinguishable from an outage.
 *   2. A server task name the client sends is not one the server branches on, so it falls through
 *      to a default and returns something plausible for the wrong task.
 *   3. Someone adds a ninth stage and the paid harness still tests eight. The run passes, the
 *      report says ALL PASS, and the new stage has never been called. This is the one that makes a
 *      green test worse than no test.
 *
 *   node --experimental-strip-types ops/aiwiring.test.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { TASKS, TASK_NAMES } from "../app/lib/aiTasks.ts";
import { TASK_SCHEMA } from "../app/lib/aiPrompts.ts";
import {
  MAX_OUTPUT, acceptsTemperature, canDisableThinking, claudeModelOr, modelConfig, outputBudget,
  thinksByDefault,
} from "../app/lib/aiModels.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/* ─────────────────── 1. every client task reaches a real route ─────────────────── */

console.log("\n── every task's endpoint exists ──");

for (const name of TASK_NAMES) {
  const ep = TASKS[name].endpoint;
  /* `/api/suggest` → `app/api/suggest/route.ts`. A task pointing anywhere else is a 404 wearing a
     spinner. */
  const file = `app${ep}/route.ts`;
  ok(`${name} → ${ep}`, existsSync(file), `${file} missing`);
}

/* ─────────────────── 2. the server branches on what the client sends ─────────────────── */

console.log("\n── /api/generate accepts every task it is sent ──");

const generate = read("app/api/generate/route.ts");
ok("/api/generate exists", generate.length > 0);

/*
 * The four server-side tasks, taken from the SCHEMA table rather than from a list written here.
 * A schema is what the prompt sends and what the parser expects, so a task with a schema and no
 * branch is a task that will be answered by the fallback.
 */
const serverTasks = Object.keys(TASK_SCHEMA).filter((k) => (TASK_SCHEMA[k] ?? "").trim().length > 0);
ok("the schema table is not empty", serverTasks.length >= 4, `${serverTasks.length}`);

for (const t of serverTasks) {
  ok(`/api/generate branches on "${t}"`, generate.includes(`task === "${t}"`), "no branch found");
  ok(`"${t}" has a schema the model is shown`, (TASK_SCHEMA[t] ?? "").includes("SCHEMA"));
}

/* Every schema names its keys, because a schema that says "return JSON" and nothing else is the
   reason a parser starts guessing. */
for (const t of serverTasks) {
  const s = TASK_SCHEMA[t] ?? "";
  ok(`"${t}" schema states its keys`, /keys|"[a-z_]+"\s*:/.test(s), s.slice(0, 40));
}

/* ─────────────────── 3. a missing key fails LOUDLY ─────────────────── */

console.log("\n── an absent provider key is reported, not swallowed ──");

/*
 * The failure this checks for is the one that made "is the AI working?" unanswerable from outside:
 * a route that catches its own provider error and returns an empty-but-valid payload. The section
 * then renders "no suggestions" and looks like a model with nothing to say.
 */
for (const [route, file] of [
  ["/api/generate", "app/api/generate/route.ts"],
  ["/api/suggest", "app/api/suggest/route.ts"],
]) {
  const src = read(file);
  ok(`${route} checks for a provider key`, /ANTHROPIC_API_KEY|NVIDIA_API_KEY/.test(src));
  ok(`${route} can answer 503`, /503/.test(src), "no 503 path — a missing key would look like empty output");
}

/* And the health endpoint must refuse to claim health on a half-configured deployment. */
{
  const h = read("app/api/health/ai/route.ts");
  ok("/api/health/ai requires BOTH keys for ok", h.includes("keyPresent && suggestKeyPresent"));
  ok("/api/health/ai answers 404 without a token", h.includes('{ error: "Not found" }'));
  ok("/api/health/ai never returns a secret's value",
    !/process\.env\[[^\]]+\]\s*\}/.test(h) && h.includes("function redact"));
}

/* ─────────────────── 4. the paid harness covers every stage ─────────────────── */

console.log("\n── ops/ai-stages.mjs still covers every stage ──");

const harness = read("ops/ai-stages.mjs");
ok("ops/ai-stages.mjs exists", harness.length > 0);

/*
 * The anti-rot check. Every server task must be exercised by the paid harness, or a new stage
 * ships untested behind a green run.
 */
for (const t of serverTasks) {
  ok(`the harness calls "${t}"`, harness.includes(`"${t}"`), "add it to ops/ai-stages.mjs");
}

/* The eight stages the product promises a user, each named in the harness so the mapping from
   "what the customer sees" to "what is called" is written down in one place. */
for (const stage of ["occupation", "skills", "duties", "credentials", "achievements", "summary", "review", "translate"]) {
  ok(`the harness names the "${stage}" stage`, new RegExp(stage, "i").test(harness));
}

/* Both languages, or the run proves half a product. */
ok("the harness runs an Arabic persona", /cvLang:\s*"ar"/.test(harness));
ok("the harness runs an English persona", /cvLang:\s*"en"/.test(harness));

/* It must print money. A harness that spends the owner's credit without reporting the total is how
   a test round becomes an unexplained invoice. */
ok("the harness reports what it spent", /TOTAL SPENT/.test(harness));
/* And it must assert the guard, not merely display output. */
ok("the harness asserts no invented numbers", /invented no number/.test(harness));

/* ─────────────────── 5. the endpoints the harness hits are the ones the app hits ─────────────── */

console.log("\n── the harness calls the same routes the app calls ──");

for (const ep of ["/api/generate", "/api/optimize", "/api/translate"]) {
  ok(`the harness posts to ${ep}`, harness.includes(ep));
  ok(`${ep} is a real route`, existsSync(`app${ep}/route.ts`));
}

/* ─────────── the escalation model thinks, and max_tokens caps thinking + text ─────────── */

console.log("\n── reasoning is off on the escalation model ──");

/*
 * The bug this locks down.
 *
 * `max_tokens` is a hard cap on thinking PLUS response text. Every budget in `MAX_OUTPUT` was sized
 * on Haiku, which does not think: 900 tokens for three summaries, 500 for a JD delta. The
 * escalation path routes to `claude-sonnet-5`, which thinks unless told not to — so an escalated
 * call spent part of that budget reasoning, billed the reasoning as output at $15/M, and could
 * return truncated JSON with `stop_reason: "max_tokens"`.
 *
 * Which is the sharp end: the escalation is triggered by `schema-invalid-retry`. The rescue for
 * invalid JSON was a call MORE likely to produce invalid JSON, at three times the price.
 */
{
  const route = readFileSync("app/api/generate/route.ts", "utf8");
  ok("the request disables thinking rather than leaving the default on",
    /thinking:\s*\{\s*type:\s*"disabled"\s*\}/.test(route));
  ok("and only where the model needs it — not blanket",
    /thinksByDefault\(model\)\s*&&\s*canDisableThinking\(model\)/.test(route));
  ok("max_tokens comes from outputBudget, not the raw task cap",
    /outputBudget\(task, route\.model\)/.test(route) && !/route\.maxOutput,/.test(route));

  /* Haiku never thought, so nothing about the cheap path may change. */
  ok("haiku is left alone", !thinksByDefault("claude-haiku-4-5")
    && outputBudget("final_content", "claude-haiku-4-5") === MAX_OUTPUT.final_content);

  /* The configured reasoning tier is the one that needed fixing. */
  ok("the configured reasoning model DOES think by default", thinksByDefault(modelConfig().reasoningModel));
  ok("and it can be told not to", canDisableThinking("claude-sonnet-5") && canDisableThinking("claude-opus-5"));

  /*
   * Fable 5 and Mythos 5 answer HTTP 400 to an explicit disable — thinking is unconditional. Nothing
   * configures them, but `ANTHROPIC_MODEL_REASONING` is an environment variable, so the headroom is
   * there instead of a 400 or a truncation behind a form field.
   */
  ok("an always-thinking model is not sent a disable it would reject",
    !canDisableThinking("claude-fable-5") && !canDisableThinking("claude-mythos-5"));
  ok("and it gets output headroom instead",
    outputBudget("final_content", "claude-fable-5") > MAX_OUTPUT.final_content);

  /* One property, one source. Two id lists would be two chances to disagree about whether a model
     reasons — which is what `acceptsTemperature` already discovered the hard way, via a 400. */
  for (const m of ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"]) {
    ok(`${m}: thinksByDefault is the exact inverse of acceptsTemperature`,
      thinksByDefault(m) === !acceptsTemperature(m));
  }
}

/* ─────────── every Anthropic call site, not just the one that was audited ─────────── */

console.log("\n── the same two rules on every route that calls Anthropic ──");

/*
 * `/api/generate` grew `acceptsTemperature` because an escalated call answered HTTP 400 — and the
 * fix was applied in that one route. `/api/translate` escalates to the same reasoning model and kept
 * sending `temperature: 0`, so EVERY escalated translation was a 400 and the retry that exists to
 * rescue a bad translation had never once run. One route learning a lesson is not the product
 * learning it, which is what this loop is for.
 */
const ANTHROPIC_ROUTES = [
  "app/api/generate/route.ts",
  "app/api/translate/route.ts",
  "app/api/optimize/route.ts",
  "app/api/cover-letter/route.ts",
];

/**
 * The request body of the Anthropic call in `src`, brace-matched.
 *
 * Scoped rather than whole-file on purpose: `/api/optimize` and `/api/cover-letter` also call
 * NVIDIA, which accepts `temperature` perfectly well. A file-wide grep would flag the branch that
 * is correct and teach the next person to delete a working parameter.
 */
function anthropicBody(src) {
  const at = src.indexOf("api.anthropic.com");
  if (at < 0) return "";
  const start = src.indexOf("JSON.stringify({", at);
  if (start < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return "";
}

for (const path of ANTHROPIC_ROUTES) {
  const src = readFileSync(path, "utf8");
  const name = path.replace("app/api/", "/api/").replace("/route.ts", "");
  const body = anthropicBody(src);

  ok(`${name}: the Anthropic request body was found`, body.length > 0);
  /* Every `temperature` in the body must be inside an `acceptsTemperature` guard — counted rather
     than pattern-matched at line starts, so writing it inline on one line does not slip through. */
  const temps = (body.match(/temperature:/g) ?? []).length;
  const guarded = (body.match(/acceptsTemperature\(model\)\s*\?\s*\{\s*temperature:/g) ?? []).length;
  ok(`${name}: every temperature on the Anthropic body is guarded`, temps === guarded,
    `${temps} occurrence(s), ${guarded} guarded — a reasoning model rejects any temperature but 1`);

  ok(`${name}: disables thinking where the model permits it`,
    /thinksByDefault\(model\)\s*&&\s*canDisableThinking\(model\)/.test(src),
    "max_tokens caps thinking + response text, and every budget here was sized on Haiku");

  /* `AI_MODEL` names the NVIDIA model for the routes that default to NVIDIA, so forwarding it to
     Anthropic unvalidated is a 404 that reads like an outage. */
  if (/AI_MODEL/.test(src)) {
    const anthropicSection = src.slice(src.indexOf("api.anthropic.com"));
    ok(`${name}: does not hand a raw AI_MODEL to Anthropic`,
      !/process\.env\.AI_MODEL\s*\|\|\s*"claude/.test(src) || /claudeModelOr/.test(src));
    ok(`${name}: reads AI_MODEL through claudeModelOr`, /claudeModelOr\(process\.env\.AI_MODEL/.test(src)
      || !anthropicSection.includes("AI_MODEL"));
  }
}

/* And the guard must actually reject a non-Claude id rather than shrug. */
ok("claudeModelOr rejects an NVIDIA id",
  claudeModelOr("meta/llama-4-maverick-17b-128e-instruct", "claude-sonnet-5") === "claude-sonnet-5");
ok("claudeModelOr keeps a valid Claude id",
  claudeModelOr("claude-haiku-4-5", "claude-sonnet-5") === "claude-haiku-4-5");
ok("claudeModelOr falls back on an empty value",
  claudeModelOr(undefined, "claude-sonnet-5") === "claude-sonnet-5"
  && claudeModelOr("  ", "claude-sonnet-5") === "claude-sonnet-5");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
