/**
 * /api/suggest is allowed to phrase, never to claim.
 *
 * The route itself cannot be loaded here — it imports `next/server` and `@/…`
 * aliases, neither of which resolves under `node --experimental-strip-types` — so
 * everything that DECIDES what leaves the endpoint lives in app/lib/suggestShapes.ts
 * and is asserted directly. That is the whole point of the split: the honesty rule
 * is the part that must never regress silently, so it is the part that is testable.
 *
 * Two failures from the live product are pinned here:
 *  - a suggested duty came back as "Performed 30 examinations per shift". Nobody
 *    told the model 30. It is a number on a document the user has to defend in an
 *    interview, so any figure in a suggested duty or skill is dropped.
 *  - the metric helper answered with a figure instead of a question. It now returns
 *    the QUESTION plus the ___ slot, and no digit can survive the parser.
 *
 *   node --experimental-strip-types ops/suggest.test.mjs
 */

import { readFileSync } from "node:fs";
import {
  hasMetric, stripNumbers, scrubSuggestion, cleanItems, cleanGroups, flattenGroups,
  extractJsonValue, parseItems, parseGroups, parseVariants, parseMetricAsk, VARIANT_LABELS,
} from "../app/lib/suggestShapes.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

/* ── the metric predicate: every way a fabricated figure arrives ── */
{
  ok("a Western digit is a metric", hasMetric("Performed 30 examinations per shift"));
  ok("an Arabic-Indic digit and ٪ are a metric", hasMetric("خفّض الأخطاء ٣٠٪"));
  ok("a headcount is a metric", hasMetric("Managed a team of 8"));
  ok("a bare percent sign is a metric", hasMetric("Improved throughput by a wide %"));
  ok("Eastern Arabic-Indic digits count too", hasMetric("۱۲ حالة"));
  ok("a clean duty is not a metric", !hasMetric("Performed diagnostic imaging examinations to approved protocols"));
  ok("a clean Arabic duty is not a metric", !hasMetric("تشغيل أجهزة الأشعة المقطعية وفق البروتوكولات المعتمدة"));
}

/* ── the filter drops the offender, keeps the response ── */
{
  const items = cleanItems([
    "Performed 30 examinations per shift",
    "Performed diagnostic imaging examinations to approved protocols",
    "خفّض الأخطاء ٣٠٪",
    "Managed a team of 8",
    "Prepared patients and positioned them for radiographic procedures",
  ], { forbidMetrics: true });
  eq("only the honest lines survive", items, [
    "Performed diagnostic imaging examinations to approved protocols",
    "Prepared patients and positioned them for radiographic procedures",
  ]);
  ok("one bad item does not fail the whole response", items.length === 2);
  ok("the empty case is empty, not an exception — the route turns it into a 502",
    cleanItems(["Performed 30 exams", "Cut errors 20%"], { forbidMetrics: true }).length === 0);
}
{
  // Education and the bullet rewrites are NOT metric-filtered: a graduation year
  // and the user's own figure are facts they gave us.
  eq("without forbidMetrics a real year passes through",
    cleanItems(["BSc Radiologic Technology — King Saud University, 2021"]),
    ["BSc Radiologic Technology — King Saud University, 2021"]);
}
{
  eq("the leading bullet marker and bold are removed once",
    cleanItems(["- **Operated CT scanners** to protocol"]),
    ["Operated CT scanners to protocol"]);
  eq("near-duplicates collapse", cleanItems(["PACS", "pacs.", "- PACS!"]), ["PACS"]);
  eq("the cap holds", cleanItems(["aaa", "bbb", "ccc", "ddd"], { cap: 2 }), ["aaa", "bbb"]);
  eq("non-strings are ignored, not stringified", cleanItems([null, undefined, {}, "Real line here"]), ["Real line here"]);
}

/* ── the placeholder contradiction this change existed to fix ── */
{
  eq("a bracketed [add …] placeholder never leaves the endpoint",
    scrubSuggestion("Reduced report turnaround [add your real number: % improvement]"),
    "Reduced report turnaround");
  eq("the Arabic placeholder goes too",
    scrubSuggestion("خفّض زمن التقارير [أضف رقمك الحقيقي]"),
    "خفّض زمن التقارير");
  ok("a placeholder-bearing item is not merely trimmed to nothing and kept",
    cleanItems(["[add your real number]"]).length === 0);
}

/* ── groups: the model returns this three different ways ── */
{
  const want = [
    { label: "Imaging Modalities", items: ["General X-ray", "Computed Tomography"] },
    { label: "Systems", items: ["PACS", "RIS"] },
  ];
  const wrapped = `{"groups":[{"label":"Imaging Modalities","items":["General X-ray","Computed Tomography"]},{"label":"Systems","items":["PACS","RIS"]}]}`;
  eq("the asked shape parses", parseGroups(wrapped), want);
  eq("a bare array of groups parses",
    parseGroups(`[{"label":"Imaging Modalities","items":["General X-ray","Computed Tomography"]},{"label":"Systems","items":["PACS","RIS"]}]`),
    want);
  eq("prose-wrapped JSON parses",
    parseGroups(`Sure! Here are the groups for a radiology role:\n\`\`\`json\n${wrapped}\n\`\`\`\nLet me know if you want more.`),
    want);
  eq("the label-keyed object JSON mode likes to emit parses",
    parseGroups(`{"Imaging Modalities":["General X-ray","Computed Tomography"],"Systems":["PACS","RIS"]}`),
    want);
  ok("a brace inside a string value does not end the scan early",
    parseGroups(`{"groups":[{"label":"Systems {legacy}","items":["PACS"]}]}`)?.[0].label === "Systems {legacy}");

  const clean = cleanGroups(parseGroups(
    `{"groups":[{"label":"Imaging Modalities","items":["General X-ray","Performed 30 CT exams per shift"]},{"label":"Volume","items":["1200 studies"]},{"label":"","items":["Orphan"]}]}`,
  ), { forbidMetrics: true });
  eq("metric items are dropped and a group emptied by that is dropped whole",
    clean, [{ label: "Imaging Modalities", items: ["General X-ray"] }]);
  eq("the flat list mirrors the groups", flattenGroups(want), ["General X-ray", "Computed Tomography", "PACS", "RIS"]);
  eq("2-4 groups is enforced by the cap",
    cleanGroups(parseGroups(`[{"label":"a","items":["x1x"]},{"label":"b","items":["x2x"]},{"label":"c","items":["x3x"]},{"label":"d","items":["x4x"]},{"label":"e","items":["x5x"]}]`)).length, 4);
}

/* ── variants: exactly three, labelled, and text mirrors the first ── */
{
  const raw = `{"variants":[
    {"label":"concise","text":"Radiology Technologist experienced in X-ray and CT imaging."},
    {"label":"professional","text":"Radiology Technologist delivering diagnostic imaging to approved clinical protocols across X-ray and CT."},
    {"label":"achievement","text":"Radiology Technologist trusted with CT and X-ray workload in a busy hospital department."}
  ]}`;
  const v = parseVariants(raw);
  eq("three variants come back", v.length, 3);
  eq("labelled with the fixed set in order", v.map((x) => x.label), [...VARIANT_LABELS]);
  ok("every variant carries text", v.every((x) => x.text.length > 20));

  // What the route returns: `text` mirrors variants[0] so a caller written against
  // the old `{text}` contract keeps working.
  const payload = { text: v[0].text, variants: v };
  ok("text equals variants[0].text", payload.text === payload.variants[0].text);

  const unlabelled = parseVariants(`["Summary one is long enough.","Summary two is long enough.","Summary three is long enough.","Summary four is extra."]`);
  eq("unlabelled variants are labelled by position and capped at three",
    unlabelled.map((x) => x.label), [...VARIANT_LABELS]);
  eq("a model-invented label is replaced, not surfaced",
    parseVariants(`{"variants":[{"label":"punchy","text":"A summary long enough to keep."}]}`)[0].label, "concise");
}

/* ── bullet_metric: a question, and never a number ── */
{
  const a = parseMetricAsk(`{"question":"Roughly how many examinations do you cover per shift","rewritten":"Performed ___ diagnostic examinations per shift to approved protocols"}`);
  ok("a question comes back", /how many/i.test(a.question));
  ok("it is punctuated as a question", /\?$/.test(a.question));
  ok("there is no digit in the question", !/[0-9٠-٩۰-۹]/.test(a.question));
  ok("there is no digit in the rewritten bullet", !/[0-9٠-٩۰-۹]/.test(a.rewritten));
  ok("the slot the real figure goes into is there", a.rewritten.includes("___"));

  // The hard rule, enforced not requested: even when the model ignores the prompt
  // and hands back a figure, no invented number can leave the endpoint.
  const b = parseMetricAsk(`{"question":"How many exams per shift, e.g. 30?","rewritten":"Performed 30 examinations per shift, cutting waits 15%"}`);
  ok("a figure the model slipped in is replaced by the slot", !/[0-9]/.test(b.question) && !/[0-9]/.test(b.rewritten), JSON.stringify(b));
  ok("and the sentence still reads as a shape", b.rewritten.includes("___"));

  const ar = parseMetricAsk(`{"question":"كم فحصاً تنجز في الوردية","rewritten":"إنجاز ___ فحصاً في الوردية"}`, "ar");
  ok("the Arabic question gets the Arabic question mark", ar.question.endsWith("؟"));

  eq("stripNumbers collapses a run of figures to one slot", stripNumbers("30% of 1200 studies"), "___ of ___ studies");
}

/* ── malformed model output degrades, never throws ── */
{
  const junk = [
    "", "   ", "I'm sorry, I can't help with that.", "{", "{\"items\":", "```json\n{oops}\n```",
    "null", "42", "{\"items\":\"not an array\"}", "[[[",
  ];
  let threw = "";
  for (const j of junk) {
    try {
      extractJsonValue(j); parseItems(j); parseGroups(j); parseVariants(j); parseMetricAsk(j); cleanItems(parseItems(j));
    } catch (e) { threw = `${JSON.stringify(j)}: ${e.message}`; }
  }
  ok("no malformed reply throws", threw === "", threw);
  eq("items degrade to an empty array", parseItems("I'm sorry, I can't help with that."), []);
  eq("groups degrade to null", parseGroups("{ not json at all"), null);
  eq("variants degrade to null", parseVariants(`{"variants":"three of them"}`), null);
  eq("the metric ask degrades to null", parseMetricAsk(`{"rewritten":"no question here"}`), null);
  eq("an object that is not the asked shape yields no items", parseItems(`{"result":{"a":1}}`), []);
}

/* ── the items shape, end to end as the route builds it ── */
{
  const raw = `Here you go:\n{"items":["Performed diagnostic X-ray examinations to approved protocols","Managed studies through PACS","Performed 40 exams per shift","- Prepared and positioned patients for imaging"]}`;
  const items = cleanItems(parseItems(raw), { cap: 10, forbidMetrics: true });
  eq("prose-wrapped items parse, scrub and filter in one pass", items, [
    "Performed diagnostic X-ray examinations to approved protocols",
    "Managed studies through PACS",
    "Prepared and positioned patients for imaging",
  ]);
  ok("nothing that survived carries a figure", items.every((i) => !hasMetric(i)));
}

/* ── the misconfiguration log: useful to the operator, silent about the secret ── */

/**
 * The 503 that produced this block returned with nothing written anywhere, so the cause —
 * a provider switch pointing at a provider whose key was absent — had to be inferred from
 * the ABSENCE of the usage line. A log line fixes that, and immediately becomes a place a
 * credential could leak, so both halves are asserted against the source.
 *
 * Read as text rather than imported: the route pulls in `next/server` and `@/…` aliases,
 * neither of which resolves under `--experimental-strip-types`.
 */
{
  const SRC = readFileSync("app/api/suggest/route.ts", "utf8");

  ok("a missing key is written to the log, not just returned as 503",
    /console\.error\(\s*[`"']\[suggest\] misconfigured/.test(SRC));
  ok("and the log names which variable was empty",
    /\$\{keyName\}/.test(SRC));
  ok("and reports which keys the deployment can see, as booleans",
    /ANTHROPIC_API_KEY=\$\{Boolean\(process\.env\.ANTHROPIC_API_KEY\?\.trim\(\)\)\}/.test(SRC)
    && /NVIDIA_API_KEY=\$\{Boolean\(process\.env\.NVIDIA_API_KEY\?\.trim\(\)\)\}/.test(SRC));
  ok("and says that env vars are snapshotted at build time, which is the likeliest cause",
    /snapshotted at build time/.test(SRC));

  /*
   * The leak this guards. `Boolean(process.env.X?.trim())` is safe; the same expression
   * without `Boolean(` prints the key. Asserted by counting every interpolation of a key
   * and requiring each one to be wrapped — a narrower check would pass on
   * `${process.env.ANTHROPIC_API_KEY}` sitting one line below a correct usage.
   */
  const interpolations = [...SRC.matchAll(/\$\{[^}]*process\.env\.(?:ANTHROPIC|NVIDIA)_API_KEY[^}]*\}/g)]
    .map((m) => m[0]);
  ok("every key interpolated into a string is wrapped in Boolean()",
    interpolations.length >= 2 && interpolations.every((s) => s.startsWith("${Boolean(")),
    interpolations.filter((s) => !s.startsWith("${Boolean(")).join(" · "));

  /* A key pasted with a trailing newline is truthy and fails at the provider as a 401 —
     a longer walk to the same answer, so it is rejected here. */
  ok("an all-whitespace key is treated as absent", /!key\?\.trim\(\)/.test(SRC));

  /* The parser must be reading the real route, or the six checks above pass vacuously. */
  ok("the route source was actually read", SRC.length > 4000, `${SRC.length} chars`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
