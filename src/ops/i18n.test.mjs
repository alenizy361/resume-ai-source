/**
 * The two languages must say the same things, in their own script.
 *
 * There is no translation library here. Thirty-one components carry their own
 * `const C = { en: {...}, ar: {...} }`, roughly 1,800 strings, and nothing compares the
 * two halves. That is how `{p.priceSar} ريالاً` shipped — Western digits on an Arabic
 * page — and how a key can exist in one language and not the other, rendering
 * `undefined` to whichever half was forgotten.
 *
 * Moving 1,800 strings into one file would be a large mechanical change that alters no
 * behaviour, with every opportunity for a typo to become a missing label. Enforcing the
 * invariants costs a fraction of that and catches the same defects today:
 *
 *   1. every key exists in both languages
 *   2. no Arabic string carries Western digits
 *   3. no Arabic string is just the English one copied over
 *
 * If the extraction happens later, these assertions keep holding — they are about the
 * strings, not about where they live.
 *
 *   node ops/i18n.test.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ── finding the copy blocks ── */

/** Brace-balanced slice starting at the `{` after `label:`, string-aware. */
function blockAfter(src, label) {
  const m = new RegExp(`\\b${label}\\s*:\\s*\\{`).exec(src);
  if (!m) return null;
  let i = m.index + m[0].length - 1, depth = 0, inStr = false, quote = "", esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (inStr) { if (c === quote) inStr = false; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = true; quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(m.index + m[0].length, i); }
  }
  return null;
}

/**
 * Top-level `key:` names in a block, ignoring anything nested inside braces.
 *
 * Comments are skipped, and that is not a nicety — it was a real hole. A `/** … *\/` note
 * above a key left its words in the identifier buffer, so the key after the comment was
 * never recognised. The failure was silent and ASYMMETRIC: documenting a key in the
 * English block and not the Arabic one made the checker report "en is missing" the key
 * that was plainly there. A parity test that misreports which side is missing something
 * is worse than one that misses the defect, because it sends you to the wrong file.
 */
function topKeys(block) {
  const keys = [];
  let depth = 0, inStr = false, quote = "", esc = false, atKeyPos = true, buf = "";
  let line = false, star = false;
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (line) { if (c === "\n") line = false; continue; }
    if (star) { if (c === "*" && block[i + 1] === "/") { star = false; i++; } continue; }
    if (!inStr && c === "/" && block[i + 1] === "/") { line = true; i++; continue; }
    if (!inStr && c === "/" && block[i + 1] === "*") { star = true; i++; continue; }
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (inStr) { if (c === quote) inStr = false; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = true; quote = c; atKeyPos = false; buf = ""; continue; }
    if (c === "{" || c === "[" || c === "(") { depth++; continue; }
    if (c === "}" || c === "]" || c === ")") { depth--; continue; }
    if (depth !== 0) continue;
    if (c === ",") { atKeyPos = true; buf = ""; continue; }
    if (c === ":") { if (atKeyPos && /^[A-Za-z_$][\w$]*$/.test(buf.trim())) keys.push(buf.trim()); atKeyPos = false; buf = ""; continue; }
    if (/\s/.test(c)) continue;
    buf += c;
  }
  return keys;
}

/** Every double-quoted string in a block, at any depth. */
function strings(block) {
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
};

/*
 * Arabic strings allowed to contain Western digits.
 *
 * Only where the digits are part of a Latin technical token — a version, a format name,
 * a standard. A price, a duration or a count must use Arabic-Indic digits.
 */
const DIGIT_OK = [
  /ISO\s*\d/, /\bA4\b/, /\bCVV\b/, /\bPDF\b/, /\bWord\b/, /\bATS\b/,
  /\bLinkedIn\b/, /\bPACS\b/, /\bSCFHS\b/, /\b\d+px\b/,
];

/**
 * Values that are legitimately Latin-only inside an Arabic copy block.
 *
 * Formats, standards, product names, acronyms, file names, URLs and CSS values are
 * written in Latin script on an Arabic screen too. Anything else with a Latin word in it
 * is an English string that never got translated.
 */
const LATIN_TOKEN_OK = new RegExp(
  "^(?:"
  + "[\\s\\p{P}\\p{S}]*"                                   // punctuation / arrows / emoji only
  + "|(?:↓\\s*)?PDF(?:\\s*\\(.*\\))?"
  + "|(?:↓\\s*)?Word(?:\\s*\\(\\.docx\\))?"
  + "|LinkedIn|ATS|PACS|SCFHS|CVV|MM|YY|A4|Apple Pay|STC|Paylink|Sira|Rabit"
  + "|https?://\\S+"
  + "|[\\w.-]+\\.(?:docx|pdf|txt|md)"
  + "|English|EN|AR"                                       // endonyms: a language names itself
  + "|[a-z]{2}(?:-[A-Z]{2})?"                              // a BCP 47 locale tag ("ar-SA")
  + "|[a-z0-9_.:/@-]+"                                     // identifiers, keys, domains, paths:
                                                           // lowercase-only and no spaces, so
                                                           // "ra_ar_optimize_draft" and
                                                           // "cv.rabit.sa" pass while a
                                                           // capitalised label like "Template"
                                                           // does not
  + "|[A-Za-z]{1,3}"                                       // a stray one-to-three letter token
  + ")$",
  "u",
);

const ENDONYM = new Set(["العربية", "الإنجليزية", "عربي", "إنجليزي", "English", "EN", "AR"]);

/* ── the checks ── */

const files = walk("app").filter((f) => {
  const s = readFileSync(f, "utf8");
  return /\ben\s*:\s*\{/.test(s) && /\bar\s*:\s*\{/.test(s);
});

ok("the copy blocks are found where the audit said they are", files.length >= 10, `${files.length} files`);

const missingKeys = [];
const westernDigits = [];
const untranslated = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const en = blockAfter(src, "en");
  const ar = blockAfter(src, "ar");
  if (!en || !ar) continue;
  const rel = file.replace(/^app\//, "");

  const ke = new Set(topKeys(en));
  const ka = new Set(topKeys(ar));
  for (const k of ke) if (!ka.has(k)) missingKeys.push(`${rel}: ar is missing "${k}"`);
  for (const k of ka) if (!ke.has(k)) missingKeys.push(`${rel}: en is missing "${k}"`);

  const enStrings = new Set(strings(en));
  for (const s of strings(ar)) {
    const hasArabic = /[؀-ۿ]/.test(s);

    if (hasArabic && /[0-9]/.test(s) && !DIGIT_OK.some((r) => r.test(s))) {
      westernDigits.push(`${rel}: "${s.slice(0, 56)}"`);
    }

    /*
     * Untranslated: an English sentence sitting in the Arabic block.
     *
     * The first version of this check only looked at strings CONTAINING Arabic and asked
     * whether the English block had the same one — which caught almost nothing, because
     * the actual defect has no Arabic in it at all. Verified by injecting
     * `pick: "Template"` into an Arabic block: the check passed. It is the likeliest
     * mistake there is and it was the one case being skipped.
     *
     * So now a value with no Arabic and a real Latin word is suspect, unless it is one of
     * the tokens that belong in Latin script on an Arabic screen.
     */
    if (!hasArabic) {
      const words = s.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter((w) => w.length > 1);
      if (words.length && !LATIN_TOKEN_OK.test(s.trim())) {
        untranslated.push(`${rel}: "${s.slice(0, 40)}"`);
      }
      continue;
    }

    // A language's own name is the same string in either interface — an English picker
    // still writes "العربية", because that is what the language calls itself. Flagging it
    // would train the reader to ignore this check.
    if (enStrings.has(s) && !ENDONYM.has(s.trim())) untranslated.push(`${rel}: "${s.slice(0, 40)}"`);
  }
}

ok("every key exists in both languages",
  missingKeys.length === 0, missingKeys.slice(0, 6).join(" · "));

ok("no Arabic string carries Western digits",
  westernDigits.length === 0, westernDigits.slice(0, 6).join(" · "));

ok("no Arabic string is the English one copied over",
  untranslated.length === 0, untranslated.slice(0, 4).join(" · "));

/* The parser must actually be reading something, or the three checks above pass
   vacuously — the most dangerous outcome for a static-analysis test. */
{
  /*
   * The probe file changed when `Builder.tsx` was deleted with the long-page builder, and this
   * test is what caught it — which is the point of having it: without this block the three checks
   * above would have gone on passing over zero files, silently, forever.
   *
   * `DesignSection.tsx` is the replacement because it is the largest bilingual copy block in the
   * builder and it is load-bearing: the export step cannot be deleted without the product losing
   * its downloads.
   */
  const probe = readFileSync("app/components/build/DesignSection.tsx", "utf8");
  const en = blockAfter(probe, "en");
  ok("the block reader finds real content", Boolean(en) && en.length > 500, `${en?.length ?? 0} chars`);
  ok("and the key reader finds real keys", topKeys(en).length > 8, `${topKeys(en).length} keys`);
  ok("and the string reader finds real strings", strings(en).length > 20, `${strings(en).length} strings`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
