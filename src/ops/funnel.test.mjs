/**
 * The funnel classifier, and the promise that no user content can reach analytics.
 *
 * ── why this needs a test at all ──
 *
 * Analytics is the one subsystem that fails silently in both directions. An event that never fires
 * looks exactly like a step nobody reached, and a payload carrying something it should not looks
 * exactly like a payload that does not — until someone opens the dashboard a month later and reads
 * a job description in a property value.
 *
 * So two things are asserted here. First that `pageFamily` puts every real route in the right
 * bucket, including the three cases that are one regex away from being wrong: a sector page against
 * a profession page (both live under `/resume-examples/`), the sector INDEX against a sector, and
 * every Arabic path against its English twin. Second that `stamp` cannot emit anything but the five
 * declared fields, whatever it is handed.
 *
 *   node --experimental-strip-types ops/funnel.test.mjs
 */

import {
  ENTRY_KEY, FUNNEL, pageFamily, pageLang, pageSlug, referrerClass, stamp, standaloneEntryStamp, stepPayload,
} from "../app/lib/funnel.ts";
import { JOB_SLUGS } from "../app/lib/jobs.ts";
import { sectorSlugs } from "../app/lib/sectors.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ─────────────────── page families ─────────────────── */

console.log("\n── which page is this ──");

const CASES = [
  ["/", "home"], ["/ar", "home"],
  ["/resume-examples", "hub"], ["/ar/resume-examples", "hub"],
  ["/resume-skills", "hub"], ["/ar/resume-skills", "hub"],
  ["/cover-letter-examples", "hub"], ["/ar/cover-letter-examples", "hub"],
  ["/resume-examples/category", "sector-index"], ["/ar/resume-examples/category", "sector-index"],
  ["/resume-examples/category/technology", "sector"], ["/ar/resume-examples/category/healthcare", "sector"],
  ["/resume-examples/software-engineer", "profession"], ["/ar/resume-examples/software-engineer", "profession"],
  ["/resume-skills/registered-nurse", "skills"], ["/ar/resume-skills/registered-nurse", "skills"],
  ["/cover-letter-examples/accountant", "cover-letter"], ["/ar/cover-letter-examples/accountant", "cover-letter"],
  ["/resume-templates/ats-pro", "template"], ["/templates", "template"],
  ["/optimize", "tool"], ["/ar/optimize", "tool"], ["/ats-resume-checker", "tool"], ["/interview-live", "tool"],
  ["/builder", "builder"], ["/ar/builder", "builder"], ["/builder/abc123/target", "builder"],
  ["/pricing", "pricing"], ["/ar/pricing", "pricing"],
  ["/login", "other"], ["/account", "other"], ["/privacy", "other"], ["/pay/callback", "other"],
];
for (const [path, want] of CASES) eq(`${path} → ${want}`, pageFamily(path), want);

/*
 * The distinction the whole scheme rests on: a sector page and a profession page differ only in a
 * path segment, and getting it wrong would attribute every sector visit to a profession — silently,
 * and in a direction that argues for writing more of the wrong kind of page.
 */
ok("a sector page is never classified as a profession",
  sectorSlugs("en").every((s) => pageFamily(`/resume-examples/category/${s}`) === "sector"));
ok("a profession page is never classified as a sector",
  JOB_SLUGS.every((s) => pageFamily(`/resume-examples/${s}`) === "profession"));
ok("every Arabic profession path matches its English twin's family",
  JOB_SLUGS.every((s) => pageFamily(`/ar/resume-examples/${s}`) === pageFamily(`/resume-examples/${s}`)));

/* `/arabic-something` must not be mistaken for the Arabic prefix. The regex uses a boundary for
   exactly this, and a boundary is the kind of thing that gets dropped in a refactor. */
eq("/ar-something is not the Arabic prefix", pageLang("/arabic-resume"), "en");
eq("/ar is", pageLang("/ar"), "ar");
eq("/ar/ is", pageLang("/ar/optimize"), "ar");

/* ─────────────────── slugs ─────────────────── */

console.log("\n── slugs come from the URL and nowhere else ──");

eq("profession slug", pageSlug("/resume-examples/software-engineer"), "software-engineer");
eq("sector slug", pageSlug("/ar/resume-examples/category/healthcare"), "healthcare");
eq("a hub has no slug", pageSlug("/resume-examples"), "");
eq("the sector index has no slug", pageSlug("/resume-examples/category"), "");
eq("a tool has no slug", pageSlug("/optimize"), "");
eq("the builder's resume id is never treated as a slug", pageSlug("/builder/abc123/target"), "");

/* ─────────────────── referrer ─────────────────── */

console.log("\n── how they arrived, at four words of resolution ──");

eq("google", referrerClass("https://www.google.com/", "cv.rabit.sa"), "search");
eq("google.com.sa", referrerClass("https://www.google.com.sa/search?q=x", "cv.rabit.sa"), "search");
eq("bing", referrerClass("https://www.bing.com/", "cv.rabit.sa"), "search");
eq("linkedin", referrerClass("https://www.linkedin.com/feed/", "cv.rabit.sa"), "social");
eq("x.com", referrerClass("https://x.com/someone", "cv.rabit.sa"), "social");
eq("our own domain is internal", referrerClass("https://cv.rabit.sa/resume-examples", "cv.rabit.sa"), "internal");
eq("a subdomain of ours is internal", referrerClass("https://www.cv.rabit.sa/x", "cv.rabit.sa"), "internal");
eq("an unknown host is external", referrerClass("https://some-blog.example/post", "cv.rabit.sa"), "external");
eq("no referrer is direct", referrerClass("", "cv.rabit.sa"), "direct");
eq("a malformed referrer is direct, not a crash", referrerClass("not a url", "cv.rabit.sa"), "direct");
eq("localhost against itself is internal", referrerClass("http://localhost:3141/x", "localhost"), "internal");

/*
 * A near-miss that would leak: `googleusercontent.com` and `notgoogle.com` must not match the
 * search pattern by substring. The pattern is anchored on a label boundary for this reason.
 */
eq("notgoogle.com is not Google", referrerClass("https://notgoogle.com/x", "cv.rabit.sa"), "external");

/* ─────────────────── the privacy property ─────────────────── */

console.log("\n── stamp() cannot emit anything it was not designed to ──");

{
  const entry = stamp("/ar/resume-examples/category/healthcare?utm_source=x&email=a@b.c#frag",
    "https://www.google.com/", "cv.rabit.sa");
  eq("the query string is dropped", entry.path, "/ar/resume-examples/category/healthcare");
  eq("family", entry.family, "sector");
  eq("slug", entry.slug, "healthcare");
  eq("lang", entry.lang, "ar");
  eq("from", entry.from, "search");
  ok("exactly five keys, no more", Object.keys(entry).length === 5, Object.keys(entry).join(","));
  ok("nothing that looks like an email survives", !JSON.stringify(entry).includes("@"));
  ok("no utm parameter survives", !JSON.stringify(entry).toLowerCase().includes("utm"));
}

{
  /* A path carrying something that must never be stored. The fragment and query are where a
     third-party redirect would put it, and `stamp` keeps neither. */
  const nasty = stamp("/optimize?resume=I%20am%20a%20nurse%20at%20King%20Fahad&id=1098765432",
    "https://evil.example/?token=abc", "cv.rabit.sa");
  ok("no resume text in the entry", !JSON.stringify(nasty).toLowerCase().includes("nurse"));
  ok("no national id in the entry", !JSON.stringify(nasty).includes("1098765432"));
  ok("no referring token in the entry", !JSON.stringify(nasty).includes("abc"));
  eq("only the class of the referrer is kept", nasty.from, "external");
}

/* ─────────────────── step payloads ─────────────────── */

console.log("\n── step payloads ──");

{
  const entry = stamp("/resume-examples/registered-nurse", "https://www.google.com/", "cv.rabit.sa");
  const p = stepPayload(entry, "/optimize");
  eq("carries the entry family", p.entry_family, "profession");
  eq("carries the entry slug", p.entry_slug, "registered-nurse");
  eq("carries how they arrived", p.from, "search");
  eq("carries where they are now", p.step_family, "tool");
  ok("five keys, all strings", Object.keys(p).length === 5 && Object.values(p).every((v) => typeof v === "string"));
}

{
  /* A direct visit has no entry yet at the moment the first step fires — the payload must still be
     complete rather than carrying undefined, which an analytics backend silently drops. */
  const p = stepPayload(null, "/ar/builder");
  eq("no entry → direct", p.from, "direct");
  eq("no entry → none", p.entry_family, "none");
  eq("no entry → empty slug", p.entry_slug, "");
  eq("still knows the current step", p.step_family, "builder");
  eq("still knows the language", p.lang, "ar");
}

/* ─────────────────── the names ─────────────────── */

console.log("\n── event names ──");

const names = Object.values(FUNNEL);
ok("every funnel event name is unique", new Set(names).size === names.length);
ok("every funnel event is prefixed so it groups in a dashboard", names.every((n) => n.startsWith("funnel_")));
ok("the six steps of the funnel are all named", names.length === 6, `${names.length}`);
eq("the storage key is namespaced like the rest of this product's keys", ENTRY_KEY, "ra_funnel_entry");

/* ─────────────────── standaloneEntryStamp agrees with stamp on everything ─────────────────── */

/**
 * `standaloneEntryStamp` (`lib/funnel.ts`) is a second, deliberately self-contained implementation of
 * `stamp` — inlined, not composed of `pageFamily`/`pageSlug`/`pageLang`/`referrerClass` by calling
 * them — because `funnelBootstrap.ts` extracts it via `Function.prototype.toString()` into a root-
 * layout `<script>`, and Next's production minifier renames each top-level function's free variables
 * independently. A per-function `.toString()` extraction of the COMPOSED version read correctly out
 * of plain Node and threw a silent `ReferenceError` in the actual built HTML — the exact failure this
 * whole item exists to fix, reproduced by an earlier draft of the fix. See the long note beside
 * `standaloneEntryStamp` for the full account.
 *
 * A genuine second implementation is exactly the drift risk this repository's standing rule warns
 * against, so it is not left on trust: every case in `CASES` above, crossed with every referrer class
 * this file already tests, is run through BOTH functions and required to agree byte for byte. An edit
 * to `pageFamily` that is not mirrored in `standaloneEntryStamp` fails here, on the next `npm test` —
 * not months later in a dashboard where a wrong classification looks exactly like a right one.
 */
console.log("\n── standaloneEntryStamp: the version a minifier cannot desync from itself ──");
{
  const REFERRERS = [
    ["", "cv.rabit.sa"],
    ["https://www.google.com/", "cv.rabit.sa"],
    ["https://x.com/someone", "cv.rabit.sa"],
    ["https://cv.rabit.sa/resume-examples", "cv.rabit.sa"],
    ["https://some-blog.example/post", "cv.rabit.sa"],
    ["not a url", "cv.rabit.sa"],
  ];
  let checked = 0;
  for (const [path] of CASES) {
    for (const [referrer, selfHost] of REFERRERS) {
      const a = stamp(path, referrer, selfHost);
      const b = standaloneEntryStamp(path, referrer, selfHost);
      /* `eq` above is `===`, which two distinct objects never satisfy — compared by content instead. */
      eq(`${path} × ${JSON.stringify(referrer)}`, JSON.stringify(b), JSON.stringify(a));
      checked++;
    }
  }
  ok(`a real matrix was actually checked`, checked === CASES.length * REFERRERS.length, String(checked));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
