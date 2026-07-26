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

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|ecosia|brave|baidu)\./i;
const SOCIAL = /(^|\.)(x|twitter|t|facebook|fb|instagram|linkedin|lnkd|reddit|youtube|tiktok|snapchat|whatsapp|telegram|pinterest)\./i;

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
