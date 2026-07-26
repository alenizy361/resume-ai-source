import { notFound } from "next/navigation";

/**
 * Why an Arabic 404 needs a route of its own.
 *
 * `app/ar/not-found.tsx` exists, and for an unmatched URL it was never reached: Next renders a
 * segment's `not-found` boundary when something INSIDE that segment calls `notFound()`, and a URL
 * like `/ar/anything-wrong` matches no segment at all — so the ROOT boundary answered, in English,
 * to a reader who had asked for Arabic. Measured, not assumed: `ops/failures.test.mjs` caught the
 * English page being served at an `/ar` address.
 *
 * A catch-all that does nothing but call `notFound()` is the fix. It matches only what no real
 * route claimed — catch-alls have the lowest priority in the router — and it puts the request
 * inside the `/ar` segment, which is what makes the Arabic boundary the one that renders.
 *
 * `dynamic = "force-static"` because there is nothing dynamic here: every request ends in the same
 * 404, and pre-rendering it keeps a mistyped URL from waking a server function.
 */
export const dynamic = "force-static";

export default function ArabicCatchAll(): never {
  notFound();
}
