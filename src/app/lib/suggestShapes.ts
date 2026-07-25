/**
 * What /api/suggest is allowed to hand back, and the honesty filter every string
 * it returns has to survive.
 *
 * These are here rather than in the route for two mechanical reasons: a route
 * file may only export HTTP handlers and segment config (Next rejects the rest),
 * and the route imports `next/server`, which cannot be loaded by
 * `node --experimental-strip-types`. The rules that decide whether a suggested
 * line is honest are the rules that most need a test, so they live where
 * ops/suggest.test.mjs can reach them.
 *
 * Nothing here may reach for `process.env` or `next/*`.
 */

import { stripPlaceholders } from "./interviewGuards.ts";

export interface Group { label: string; items: string[] }

export const VARIANT_LABELS = ["concise", "professional", "achievement"] as const;
export type VariantLabel = (typeof VARIANT_LABELS)[number];
export interface Variant { label: VariantLabel; text: string }

/**
 * Any figure at all — Western or Arabic-Indic digit, either percent sign.
 *
 * The product's promise is that a percentage, a volume or a headcount on the
 * finished CV came from the user. A suggested duty or skill therefore may not
 * carry one, however plausible: the model has no way to know the user's real
 * numbers, so every number it writes is invented by construction. Deliberately
 * blunt — "ISO 9001" and "CT 128-slice" are casualties, and the user can type
 * them back in, which is the cheap direction of that trade.
 */
export function hasMetric(s: string): boolean {
  return /[0-9٠-٩۰-۹%٪]/.test(s);
}

/** Replace every figure with the slot marker. Used where a number must never appear. */
export function stripNumbers(s: string): string {
  return s
    .replace(/[0-9٠-٩۰-۹]+(?:[.,٫٬][0-9٠-٩۰-۹]+)?(?:\s*[%٪])?/g, "___")
    .replace(/[%٪]/g, "")
    .replace(/(?:___[\s,،]*)+___/g, "___")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * One suggested line, made safe to show.
 *
 * `sourceHasDigits: true` and a zero placeholder budget are not a guess about the
 * input — they are how "no [bracketed placeholder], ever" from DRAFTING_DOCTRINE
 * is enforced rather than merely requested. The interview's draft path passes the
 * same pair for the same reason.
 */
export function scrubSuggestion(text: string): string {
  return stripPlaceholders(String(text ?? "").replace(/\*\*/g, "").replace(/^[-•*]\s*/, "").trim(), true, { left: 0 })
    .replace(/\s{2,}/g, " ")
    .trim();
}

const normKey = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Scrub, drop the dishonest, de-duplicate, cap.
 *
 * A metric-bearing line is DROPPED, not rewritten and not fatal: the other five
 * lines are still useful, and silently editing a sentence the model wrote tends
 * to produce a sentence nobody wrote.
 */
export function cleanItems(
  raw: unknown,
  opts: { cap?: number; forbidMetrics?: boolean; minLength?: number } = {},
): string[] {
  const { cap = 10, forbidMetrics = false, minLength = 3 } = opts;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(raw) ? raw : []) {
    if (typeof v !== "string" && typeof v !== "number") continue;
    const s = scrubSuggestion(String(v)).slice(0, 300);
    if (s.length < minLength) continue;
    if (forbidMetrics && hasMetric(s)) continue;
    const k = normKey(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/** Same treatment for grouped items; a group that loses all its items is dropped. */
export function cleanGroups(
  raw: Group[] | null,
  opts: { cap?: number; itemCap?: number; forbidMetrics?: boolean } = {},
): Group[] {
  const { cap = 4, itemCap = 8, forbidMetrics = false } = opts;
  const out: Group[] = [];
  for (const g of raw ?? []) {
    const label = scrubSuggestion(g?.label ?? "").slice(0, 60);
    const items = cleanItems(g?.items, { cap: itemCap, forbidMetrics });
    if (!label || !items.length) continue;
    out.push({ label, items });
    if (out.length >= cap) break;
  }
  return out;
}

export function flattenGroups(groups: Group[]): string[] {
  return cleanItems(groups.flatMap((g) => g.items), { cap: 40 });
}

/**
 * Pull the first balanced JSON object or array out of a model reply.
 *
 * `response_format: {type:"json_object"}` is requested first, but it is not
 * guaranteed to be honoured (and the fallback attempt drops it), so the reply
 * still arrives wrapped in prose or code fences often enough to matter. Strings
 * are tracked so a brace inside a value does not end the scan early.
 */
export function extractJsonValue(raw: string): unknown {
  const s = String(raw ?? "").replace(/```json/gi, "").replace(/```/g, "");
  const starts = [s.indexOf("{"), s.indexOf("[")].filter((i) => i !== -1);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/** `{items:[…]}` or a bare array, either wrapped in prose. `[]` means "caller decides". */
export function parseItems(raw: string): string[] {
  const j = extractJsonValue(raw);
  const arr = Array.isArray(j) ? j : (j as { items?: unknown; lines?: unknown } | null)?.items ?? (j as { lines?: unknown } | null)?.lines;
  return (Array.isArray(arr) ? arr : []).filter((v) => typeof v === "string" || typeof v === "number").map(String);
}

/**
 * `{groups:[{label,items}]}`, a bare array of groups, or the label-keyed object
 * (`{"Modalities":["CT"]}`) that JSON mode produces about as often as the asked
 * shape. Returns null when nothing group-like is in there.
 */
export function parseGroups(raw: string): Group[] | null {
  const j = extractJsonValue(raw);
  if (!j || typeof j !== "object") return null;
  const asGroup = (g: unknown): Group | null => {
    if (!g || typeof g !== "object" || Array.isArray(g)) return null;
    const o = g as Record<string, unknown>;
    const label = o.label ?? o.name ?? o.title ?? o.category;
    const items = o.items ?? o.skills ?? o.values ?? o.list;
    if (typeof label !== "string" || !Array.isArray(items)) return null;
    return { label, items: items.filter((v) => typeof v === "string" || typeof v === "number").map(String) };
  };

  const listed = Array.isArray(j) ? j : (j as { groups?: unknown }).groups;
  if (Array.isArray(listed)) {
    const groups = listed.map(asGroup).filter((g): g is Group => g !== null);
    return groups.length ? groups : null;
  }

  const keyed = Object.entries(j as Record<string, unknown>)
    .filter(([, v]) => Array.isArray(v))
    .map(([label, v]) => ({
      label,
      items: (v as unknown[]).filter((x) => typeof x === "string" || typeof x === "number").map(String),
    }))
    .filter((g) => g.items.length);
  return keyed.length ? keyed : null;
}

/**
 * Three summary options, labelled. Labels are asserted against the fixed set
 * rather than trusted, because the UI renders one tab per label and a model that
 * invents a fourth name breaks the tab strip. Position decides when the model's
 * label is unusable.
 */
export function parseVariants(raw: string): Variant[] | null {
  const j = extractJsonValue(raw);
  if (!j) return null;
  const listed = Array.isArray(j) ? j : (j as { variants?: unknown; options?: unknown }).variants ?? (j as { options?: unknown }).options;
  if (!Array.isArray(listed)) return null;

  const out: Variant[] = [];
  for (const v of listed) {
    const text = typeof v === "string" ? v
      : typeof (v as { text?: unknown })?.text === "string" ? (v as { text: string }).text
      : typeof (v as { summary?: unknown })?.summary === "string" ? (v as { summary: string }).summary
      : "";
    const clean = scrubSuggestion(text).slice(0, 900);
    if (clean.length < 10) continue;
    const claimed = String((v as { label?: unknown })?.label ?? "").toLowerCase().trim();
    const label = (VARIANT_LABELS as readonly string[]).includes(claimed)
      ? (claimed as VariantLabel)
      : VARIANT_LABELS[Math.min(out.length, VARIANT_LABELS.length - 1)];
    if (out.some((o) => o.label === label)) continue;
    out.push({ label, text: clean });
    if (out.length >= VARIANT_LABELS.length) break;
  }
  return out.length ? out : null;
}

/**
 * The metric helper's answer: a question, and the sentence the answer lands in.
 *
 * It returns a QUESTION because the alternative is forgery. The model cannot know
 * how many examinations this radiographer covers per shift, so it asks, and the
 * UI rewrites the bullet only once the user has typed the real figure. Any digit
 * the model slipped in anyway (an "e.g. 30") is replaced by the ___ slot here, so
 * an invented number cannot leave this endpoint even if the prompt is ignored.
 */
export function parseMetricAsk(raw: string, lang: "ar" | "en" = "en"): { question: string; rewritten: string } | null {
  const j = extractJsonValue(raw) as { question?: unknown; rewritten?: unknown; bullet?: unknown } | null;
  if (!j || typeof j !== "object") return null;
  const q = stripNumbers(scrubSuggestion(typeof j.question === "string" ? j.question : "")).slice(0, 220);
  const rewrittenRaw = typeof j.rewritten === "string" ? j.rewritten : typeof j.bullet === "string" ? j.bullet : "";
  const rewritten = stripNumbers(scrubSuggestion(rewrittenRaw)).slice(0, 300);
  if (q.length < 5) return null;
  // A question mark is the affordance that tells the user this is a prompt to
  // answer, not a line to paste — guarantee it rather than hope for it.
  const question = /[?؟]\s*$/.test(q) ? q : `${q}${lang === "ar" ? "؟" : "?"}`;
  return { question, rewritten };
}
