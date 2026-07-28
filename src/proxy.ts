import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AR_SLUGS } from "@/app/lib/jobs-ar";
import { JOB_SLUGS } from "@/app/lib/jobs";

// Next 16 renamed `middleware` -> `proxy` (runtime is nodejs, not edge).
//
// ONE job now: ONE i18n system: locale lives in the PATH (/ar/*). Legacy ?lang=ar/en
// parameters 308-redirect to the matching path — but only when a twin actually exists,
// so English-only tools are never sent to a 404.
//
// It used to have a second: set `x-pathname` so the root layout could read the path and serve
// <html lang="ar" dir="rtl"> on Arabic routes. That header is gone, and with it the `headers()`
// call that consumed it — which was opting the ENTIRE SITE out of static generation, because a
// dynamic API in the root layout makes every route beneath it dynamic. The path is now answered by
// the route group (`app/(ar)` vs `app/(en)`), which the build knows without a request. 5 static
// routes became 46, plus 9 prerendered from generateStaticParams.
//
// Removing it also means this proxy no longer rewrites the request on every page view. It only
// redirects legacy `?lang=` URLs and otherwise gets out of the way.
/*
 * `/interview` and `/linkedin` are deliberately NOT in this list, and that is not an omission —
 * they were here once and it produced a live infinite-redirect loop. Both have a real `/ar/*`
 * ROUTE but no real `/ar/*` PAGE: `app/(ar)/ar/interview/page.tsx` and `.../ar/linkedin/page.tsx`
 * are one-line stubs whose only job is `redirect("/interview?lang=ar")`. With these two in
 * AR_TWINS, that redirect landed back here, matched the rule, and bounced straight back to
 * `/ar/interview` — forever. A visitor clicking `HubLinks`' own "تحضير المقابلة" link (which
 * points at `/ar/interview`) hit `ERR_TOO_MANY_REDIRECTS` instead of the interview page. The
 * canonicalization this list exists for only makes sense for a route with distinct Arabic
 * content to canonicalize TO — these two have none, so leaving `?lang=ar` alone and letting the
 * shared component's own `useLang()` read it is correct, not a gap.
 *
 * `/login` is the third member of that club, removed for the same reason AFTER repeating the
 * same loop: `app/(ar)/ar/login/page.tsx` is a one-line stub doing `redirect("/login?lang=ar")`,
 * and with `/login` listed here that redirect bounced straight back to `/ar/login`, forever.
 * The victims were real: the builder's own "سجّل الدخول لتحتفظ بهذه السيرة" header link on every
 * Arabic step points at `/ar/login`, so every anonymous Arabic user who tried to keep their CV
 * hit ERR_TOO_MANY_REDIRECTS. The rule to carry forward: a route goes in this list ONLY if its
 * `/ar/*` page renders real content — a redirect stub disqualifies it, structurally.
 */
const AR_TWINS: RegExp[] = [
  /^\/$/,
  /^\/optimize$/,
  /^\/account$/,
  /^\/build$/,
  /^\/builder$/,
  /^\/journey$/,
  /^\/pricing$/,
  /^\/templates$/,
  /^\/v1$/,
  /* /score is NOT here — fourth member of the stub-loop club (after /interview, /linkedin,
     /login): app/(ar)/ar/score/[id] is a redirect stub back to /score/{id}?lang=ar, so listing
     it here made the Arabic "Share my score" link — and every shared Arabic score URL — an
     infinite 308/307 loop. The rule stands: only routes whose /ar page renders real content. */
  /*
   * These four were missing, and the two directions disagreed because of it: `/ar/privacy?lang=en`
   * redirected to `/privacy`, while `/privacy?lang=ar` did nothing — although `/ar/privacy` is a
   * real, fully Arabic page answering 200. Each one below was checked against the rule this list
   * states rather than assumed: all four render content, none is a redirect stub, so none can join
   * the loop club.
   */
  /^\/privacy$/,
  /^\/terms$/,
  /^\/jd-keyword-extractor$/,
  /^\/pdf-readability-checker$/,
  /* The three catalog HUBS only. Their children are decided by `hasArTwin` below, because a
     prefix pattern here claimed 85 twins where 62 exist. */
  /^\/resume-examples$/,
  /^\/cover-letter-examples$/,
  /^\/resume-skills$/,
];

/**
 * The three programmatic catalogs cover different profession sets in the two languages.
 *
 * `AR_TWINS` used to hold `/^\/resume-examples(\/|$)/` and its two siblings — prefix patterns, so
 * they matched all 85 English profession slugs while `AR_SLUGS` holds 62. For the 23 English-only
 * professions (data-scientist, project-manager, web-developer, recruiter, ux-ui-designer, …) a
 * `?lang=ar` URL 308-redirected straight into a 404: a redirect pointing at a page that does not
 * exist, 69 of them across the three trees.
 *
 * No in-product link produces those URLs — the page components already guard their own toggles on
 * `hasAr` — but hand-typed, bookmarked and legacy links do, and answering them with a redirect into
 * a 404 is worse than answering them with the English page they asked for.
 *
 * This is the rule stated at the top of this file finally applied to the catalogs: redirect only
 * when a twin actually exists.
 */
const CATALOGS = ["/resume-examples/", "/cover-letter-examples/", "/resume-skills/"];

/**
 * …and the same question in the other direction, which the first version did not ask.
 *
 * `hasArTwin` guarded `?lang=ar` only. The `/ar/* + ?lang=en` branch stripped `/ar` unconditionally,
 * so an Arabic-only profession — and there are 34 of them across the three catalogs — 308-redirected
 * to an English page that does not exist. Measured: `/ar/resume-examples/medical-doctor?lang=en` →
 * 308 → `/resume-examples/medical-doctor` → 404, while the Arabic page itself answers 200. The same
 * "a redirect pointing at a page that does not exist" defect the fix declared closed, surviving in
 * the direction nobody swept.
 */
function hasEnTwin(arPathname: string): boolean {
  const pathname = arPathname.replace(/^\/ar/, "") || "/";
  if (/^\/resume-examples\/category(\/[a-z0-9-]+)?$/.test(pathname)) return true;
  const catalog = CATALOGS.find((c) => pathname.startsWith(c));
  if (catalog) return JOB_SLUGS.includes(pathname.slice(catalog.length));
  /* Everything outside the catalogs has an English original by construction — the `/ar` tree is
     built from it — so only the programmatic children need asking about. */
  return true;
}

function hasArTwin(pathname: string): boolean {
  /* The SECTOR tree lives under the same prefix and is fully bilingual — identical slugs in both
     languages — so it is matched before the profession check, which would otherwise look up
     "category/technology" in a list of profession slugs and answer no. */
  if (/^\/resume-examples\/category(\/[a-z0-9-]+)?$/.test(pathname)) return true;
  const catalog = CATALOGS.find((c) => pathname.startsWith(c));
  if (catalog) return AR_SLUGS.includes(pathname.slice(catalog.length));
  return AR_TWINS.some((r) => r.test(pathname));
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const lang = searchParams.get("lang");

  if (lang) {
    /*
     * A SEGMENT test, not a prefix test.
     *
     * `startsWith("/ar")` also matches `/artist`, `/arabic-cv`, `/ar-test` — so `?lang=en` on any of
     * them 308-redirected to a truncated path: `/artist?lang=en` → `/tist` → 404. No live route
     * begins with those letters today, so the damage was bounded to hand-typed and crawled URLs, but
     * it is precisely the redirect-into-a-404 defect this block's own header declares closed.
     */
    if (pathname === "/ar" || pathname.startsWith("/ar/")) {
      if (lang === "en" && hasEnTwin(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = pathname.replace(/^\/ar/, "") || "/";
        url.searchParams.delete("lang");
        return NextResponse.redirect(url, 308);
      }
    } else if (lang === "ar" && hasArTwin(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = `/ar${pathname === "/" ? "" : pathname}`;
      url.searchParams.delete("lang");
      return NextResponse.redirect(url, 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Only the `?lang=` redirects are left, and those can only appear on page URLs.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
