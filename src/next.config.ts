import type { NextConfig } from "next";

const securityHeaders = [
  // Clickjacking protection — nothing on this site needs to be framed.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  /*
   * ── why this flag is on, and what was tried first ──
   *
   * The root layout was split into `app/(en)` and `app/(ar)` so that `lang`/`dir` could be decided by
   * the route group instead of by reading `headers()`. That one dynamic call had opted the entire site
   * out of static generation: 5 static routes became 46, plus 9 prerendered from
   * `generateStaticParams`. For a product growing on organic search alone, that is the difference
   * between HTML on a CDN and a server function per page view.
   *
   * The cost is this: with no layout above the two groups, a URL matching nothing in EITHER group —
   * `/nope`, `/pricing/nope` — has no root layout Next can pick, so it falls back to the framework's
   * own bare error document. Correct 404 status, no stylesheet, none of the designed page.
   *
   * A root-level catch-all was the first attempt, mirroring the one the Arabic side already has at
   * `app/(ar)/ar/[...missing]`. It does not work: the route builds, and a probe page placed there was
   * never reached for `/nope`, `/pricing/nope` or `/a/b/c` — Next cannot assign an unmatched top-level
   * URL to a group, which is the same reason the fallback happens at all. That folder was deleted
   * rather than left in as something that looks like a fix.
   *
   * `globalNotFound` is the framework's documented answer for exactly this case, named in
   * `not-found.md` alongside "your app has multiple root layouts". It is experimental, which is a real
   * cost and worth stating plainly: the flag could change. What it guards is the 404 page — so if it
   * ever regresses, mistyped URLs render plainly again, and no route that anyone reaches on purpose is
   * affected.
   */
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;
