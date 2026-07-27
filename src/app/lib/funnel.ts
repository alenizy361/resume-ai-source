/**
 * The organic funnel: search → content page → tool → builder → payment.
 *
 * ── what was missing, and why it matters more than the pages ──
 *
 * `docs/seo.md` records 188 indexable pages and, in the "not done" list, this: *"the search → tool
 * → builder → payment path is not yet instrumented end to end."* Twenty-eight `track()` calls live
 * inside the builder and describe what a user does once they are already there. Nothing recorded
 * which page brought them, so the next round of content work would be chosen from a brief rather
 * than from what earned a visitor.
 *
 * That is the expensive kind of blind spot. Three hundred pages is a portfolio; without attribution
 * it is a portfolio with no returns column, and the honest answer to "should we write twenty more
 * profession pages or two more tools?" is *nobody here knows*.
 *
 * ── the design, in one sentence ──
 *
 * The entry page is recorded ONCE, in `sessionStorage`, by whichever page the visitor lands on;
 * every later step reads it and reports itself with that entry attached. So attribution needs no
 * instrumented links, no query parameters appended to internal hrefs, and no tracking of the
 * journey between — just a stamp at the door and a stamp at each till.
 *
 * ── the privacy rule, which is not negotiable ──
 *
 * `stamp()` builds the event payload, and it can only produce the fields declared in `Entry`: a
 * path, a page family, a slug that comes from the URL, a language and a coarse referrer class. CV
 * text, job-description text, an email, a score and a file name are not representable — not
 * "filtered out" somewhere, but absent from the type and from the function that constructs the
 * payload. The classifier also reduces a referrer to one of four words before anything is stored,
 * so a full referring URL never reaches storage or an analytics call.
 *
 * No `next/*` imports and no browser globals at module scope — `ops/funnel.test.mjs` loads this in
 * plain Node.
 */

export type PageFamily =
  | "home" | "sector" | "sector-index" | "profession" | "skills" | "cover-letter"
  | "hub" | "template" | "tool" | "builder" | "pricing" | "other";

/** How the visitor arrived, at the coarsest resolution that still answers the question. */
export type ReferrerClass = "search" | "social" | "external" | "internal" | "direct";

export interface Entry {
  /** The pathname they landed on. No query string — it carries campaign junk and sometimes PII. */
  path: string;
  family: PageFamily;
  /** The last path segment when the family is a templated one: a job slug or a sector slug. */
  slug: string;
  lang: "ar" | "en";
  from: ReferrerClass;
}

export const ENTRY_KEY = "ra_funnel_entry";

/* ─────────────────── classification ─────────────────── */

/* Exported, not just used locally: `funnelBootstrap.ts` reconstructs the client-side entry stamp
   by reading these functions' OWN source via `Function.prototype.toString()`, and a free variable
   referencing an unexported const would vanish from that source — see the header there. */
export const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|ecosia|brave|baidu)\./i;
export const SOCIAL = /(^|\.)(x|twitter|t|facebook|fb|instagram|linkedin|lnkd|reddit|youtube|tiktok|snapchat|whatsapp|telegram|pinterest)\./i;

/**
 * A referring URL reduced to one word.
 *
 * Google's own referrer is `https://www.google.com/` with no query — the search term has not been
 * in a referrer for over a decade — so nothing is lost by keeping only the class, and a full URL
 * from an unknown host can contain anything, which is why it is never stored.
 */
export function referrerClass(referrer: string, selfHost: string): ReferrerClass {
  if (!referrer) return "direct";
  let host: string;
  try { host = new URL(referrer).hostname; } catch { return "direct"; }
  if (!host) return "direct";
  if (selfHost && (host === selfHost || host.endsWith(`.${selfHost}`))) return "internal";
  if (SEARCH.test(host)) return "search";
  if (SOCIAL.test(host)) return "social";
  return "external";
}

/** Which kind of page this is, from its path alone. */
export function pageFamily(path: string): PageFamily {
  const p = path.replace(/^\/ar(?=\/|$)/, "") || "/";
  if (p === "/") return "home";
  if (/^\/resume-examples\/category\/[^/]+$/.test(p)) return "sector";
  if (p === "/resume-examples/category") return "sector-index";
  if (/^\/resume-examples\/[^/]+$/.test(p)) return "profession";
  if (/^\/resume-skills\/[^/]+$/.test(p)) return "skills";
  if (/^\/cover-letter-examples\/[^/]+$/.test(p)) return "cover-letter";
  if (/^\/resume-templates\/[^/]+$/.test(p) || p === "/templates") return "template";
  if (["/resume-examples", "/resume-skills", "/cover-letter-examples", "/resume-templates"].includes(p)) return "hub";
  if (["/optimize", "/linkedin", "/interview", "/interview-live", "/ats-resume-checker", "/free-resume-checker", "/jobscan-alternative"].includes(p)) return "tool";
  if (p === "/builder" || p.startsWith("/builder/")) return "builder";
  if (p === "/pricing") return "pricing";
  return "other";
}

/** The templated slug, or "" for a page that has none. Taken from the URL, never from content. */
export function pageSlug(path: string): string {
  const family = pageFamily(path);
  if (!["sector", "profession", "skills", "cover-letter", "template"].includes(family)) return "";
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

export const pageLang = (path: string): "ar" | "en" => (/^\/ar(\/|$)/.test(path) ? "ar" : "en");

/**
 * The entry record for a landing.
 *
 * Returns a plain object with five known keys. There is no passthrough parameter and no spread of
 * caller-supplied data, which is what makes the privacy claim above a property of the code rather
 * than a convention someone has to remember.
 */
export function stamp(path: string, referrer: string, selfHost: string): Entry {
  const clean = path.split(/[?#]/)[0] || "/";
  return {
    path: clean,
    family: pageFamily(clean),
    slug: pageSlug(clean),
    lang: pageLang(clean),
    from: referrerClass(referrer, selfHost),
  };
}

/**
 * `stamp`, again — bodily, not by calling it. This is what `funnelBootstrap.ts` extracts.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY A SECOND COPY EXISTS, WHEN THE WHOLE ARCHITECTURE IS BUILT AGAINST DUPLICATION
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The first version of `funnelBootstrap.ts` called `.toString()` on `stamp`, `pageFamily`,
 * `pageSlug`, `pageLang` and `referrerClass` separately and reassembled them under their own names.
 * It read correctly out of plain Node. Built through NEXT'S OWN minifier and inspected in the actual
 * served HTML, it was broken: production minification renames each top-level function's free
 * variables independently, so `stamp`'s compiled body called `pageFamily` under ITS minified name
 * (say `h`), while the reassembled script declared it as `var pageFamily = …` — a name `stamp`'s
 * body never referred to. The result was a script that parsed, ran, and threw `ReferenceError`
 * inside the `try/catch` that wraps it — silently, exactly the failure mode the earlier attempt at
 * this item reported and could not diagnose. Building and reading the REAL output is what caught it
 * here before it shipped a second time.
 *
 * A minifier's scope-aware renaming is only consistent WITHIN one function's own body — nested
 * declarations and their call sites inside a single function are always renamed together, because
 * that is what makes the rename correct at all. So this function inlines every helper `stamp` calls
 * as a value or a local closure, entirely inside its own body, with nothing left at module scope for
 * a per-function extraction to lose track of. `.toString()` on this ONE function is self-contained
 * by construction, independent of whatever the minifier renamed anything to.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT STOPS THIS FROM BEING THE DRIFT THE ORIGINAL DESIGN WARNED AGAINST
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `ops/funnel.test.mjs` runs this function and `stamp` against the same large matrix of inputs —
 * every case in the page-family table, every referrer class, both languages — and asserts
 * byte-identical output. An edit to `pageFamily` that is not mirrored here fails that test
 * immediately, on the next `npm test`, rather than drifting silently into a dashboard where a wrong
 * classification looks exactly like a right one. That is a weaker guarantee than one function no
 * extraction can desync — it is the strongest one available on the far side of a minification
 * boundary that renames per function rather than per module.
 */
export function standaloneEntryStamp(path: string, referrer: string, selfHost: string): Entry {
  const search = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|ecosia|brave|baidu)\./i;
  const social = /(^|\.)(x|twitter|t|facebook|fb|instagram|linkedin|lnkd|reddit|youtube|tiktok|snapchat|whatsapp|telegram|pinterest)\./i;

  const family = (p: string): PageFamily => {
    const q = p.replace(/^\/ar(?=\/|$)/, "") || "/";
    if (q === "/") return "home";
    if (/^\/resume-examples\/category\/[^/]+$/.test(q)) return "sector";
    if (q === "/resume-examples/category") return "sector-index";
    if (/^\/resume-examples\/[^/]+$/.test(q)) return "profession";
    if (/^\/resume-skills\/[^/]+$/.test(q)) return "skills";
    if (/^\/cover-letter-examples\/[^/]+$/.test(q)) return "cover-letter";
    if (/^\/resume-templates\/[^/]+$/.test(q) || q === "/templates") return "template";
    if (["/resume-examples", "/resume-skills", "/cover-letter-examples", "/resume-templates"].includes(q)) return "hub";
    if (["/optimize", "/linkedin", "/interview", "/interview-live", "/ats-resume-checker", "/free-resume-checker", "/jobscan-alternative"].includes(q)) return "tool";
    if (q === "/builder" || q.startsWith("/builder/")) return "builder";
    if (q === "/pricing") return "pricing";
    return "other";
  };

  const lang = (p: string): "ar" | "en" => (/^\/ar(\/|$)/.test(p) ? "ar" : "en");

  const slug = (p: string): string => {
    const f = family(p);
    if (!["sector", "profession", "skills", "cover-letter", "template"].includes(f)) return "";
    const segments = p.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  };

  const from = (referrerUrl: string, selfHostArg: string): ReferrerClass => {
    if (!referrerUrl) return "direct";
    let host: string;
    try { host = new URL(referrerUrl).hostname; } catch { return "direct"; }
    if (!host) return "direct";
    if (selfHostArg && (host === selfHostArg || host.endsWith(`.${selfHostArg}`))) return "internal";
    if (search.test(host)) return "search";
    if (social.test(host)) return "social";
    return "external";
  };

  const clean = path.split(/[?#]/)[0] || "/";
  return { path: clean, family: family(clean), slug: slug(clean), lang: lang(clean), from: from(referrer, selfHost) };
}

/* ─────────────────── event names ─────────────────── */

/**
 * One place, because an analytics dashboard cannot be refactored. A typo in an event name is
 * indistinguishable from an event that never fired, and it is only discovered a month later when
 * someone asks why a funnel step is empty.
 */
export const FUNNEL = {
  landing: "funnel_landing",
  toolOpened: "funnel_tool_opened",
  scanDone: "funnel_scan_done",
  builderStarted: "funnel_builder_started",
  checkoutStarted: "funnel_checkout_started",
  paid: "funnel_paid",
} as const;

/** What a step event carries: where they entered, and where they are now. */
export function stepPayload(entry: Entry | null, path: string): Record<string, string> {
  return {
    from: entry?.from ?? "direct",
    entry_family: entry?.family ?? "none",
    entry_slug: entry?.slug ?? "",
    lang: pageLang(path),
    step_family: pageFamily(path),
  };
}
