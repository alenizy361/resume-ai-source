import type { Metadata } from "next";
import "./globals.css";

/**
 * The 404 for a URL that matches nothing in either language.
 *
 * ── why this file has its own `<html>` ──
 *
 * `app/(en)/not-found.tsx` and `app/(ar)/ar/not-found.tsx` still handle every 404 that happens INSIDE
 * a route — a resume slug that does not exist, a job page that was removed. Those get their group's
 * root layout and look like the rest of the site.
 *
 * This one is for the other kind: `/nope`, `/pricing/nope`. With two root layouts and nothing above
 * them, Next has no way to decide which group a URL belonging to neither should be rendered in, so it
 * skips layout rendering entirely and returns this file. That is why the document is written out here
 * rather than composed — there is no layout in scope to compose with.
 *
 * `globals.css` is imported explicitly for the same reason: nothing above this file imports it.
 *
 * ── the language question ──
 *
 * `lang="en"`, because a URL that matches no route carries no reliable signal about who typed it, and
 * `/ar`-prefixed mistakes never reach here — `app/(ar)/ar/[...missing]` catches those and renders the
 * Arabic 404 properly inside the Arabic layout. So the only visitors to this page are on English or
 * junk paths, and English is the honest answer for both.
 *
 * ── SEO ──
 *
 * `noindex`. A 404 already tells a crawler not to index; saying it twice costs nothing and protects
 * against a misconfiguration that returns 200 for this body.
 */

export const metadata: Metadata = {
  title: "404 — page not found | Sira",
  description: "That page does not exist. Build a CV, or scan the one you have.",
  robots: { index: false, follow: true },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body style={{ margin: 0, padding: 0 }}>
        <main
          className="relative flex min-h-dvh items-center justify-center px-6"
          style={{ background: "var(--bg)", color: "var(--fg)" }}
        >
          <div
            className="relative w-full max-w-md rounded-3xl p-10 text-center"
            style={{
              background: "rgba(15, 20, 35, 0.048)",
              border: "1px solid rgba(15, 20, 35, 0.14)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="mb-2 font-mono text-sm tracking-[0.3em]" style={{ color: "var(--muted)" }}>404</div>
            <h1 className="text-2xl font-bold">Lost in space</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
              The page you&apos;re looking for drifted off — it doesn&apos;t exist or may have moved.
            </p>
            {/*
              Plain anchors, not `next/link`. This page is returned without the app shell, so there is
              no router in scope to prefetch or soft-navigate with; a `Link` here would be a component
              pretending to do something it cannot.
            */}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href="/" className="btn-accent px-6 py-3">Back home</a>
              <a
                href="/optimize"
                className="rounded-xl px-6 py-3 font-semibold"
                style={{ border: "1px solid rgba(255,255,255,0.18)", color: "var(--fg)" }}
              >
                Scan a resume
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
