import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
const AR_TWINS: RegExp[] = [
  /^\/$/,
  /^\/optimize$/,
  /^\/interview$/,
  /^\/account$/,
  /^\/build$/,
  /^\/builder$/,
  /^\/journey$/,
  /^\/linkedin$/,
  /^\/login$/,
  /^\/pricing$/,
  /^\/templates$/,
  /^\/v1$/,
  /^\/score(\/|$)/,
  /^\/resume-examples(\/|$)/,
  /^\/cover-letter-examples(\/|$)/,
  /^\/resume-skills(\/|$)/,
];

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const lang = searchParams.get("lang");

  if (lang) {
    if (pathname.startsWith("/ar")) {
      if (lang === "en") {
        const url = request.nextUrl.clone();
        url.pathname = pathname.replace(/^\/ar/, "") || "/";
        url.searchParams.delete("lang");
        return NextResponse.redirect(url, 308);
      }
    } else if (lang === "ar" && AR_TWINS.some((r) => r.test(pathname))) {
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
