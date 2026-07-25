"use client";

/**
 * The last page in the building.
 *
 * `app/error.tsx` catches everything that goes wrong INSIDE the layout. When the root layout itself
 * throws — a font that will not load, a provider that crashes on mount, a bad environment value
 * read at render — that boundary is gone with it, and Next falls back to its own unstyled page:
 * black text on white, one English sentence, no way back.
 *
 * So this one renders its own `<html>` and `<body>` and depends on nothing: no shared components,
 * no CSS variables, no fonts, no Link. Every one of those is a thing that could be the reason we
 * are here. Inline styles and two anchors is the whole page, and it is bilingual because at this
 * point there is no way to know which language the reader chose.
 */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0a0f", color: "#e8e8ef", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 460, textAlign: "center", border: "1px solid rgba(248,113,113,.35)", borderRadius: 20, padding: 32 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>!</div>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#9aa0a6", margin: "0 0 6px" }}>
              Your CV is saved on this device — nothing was lost.
            </p>
            <p dir="rtl" style={{ fontSize: 14, lineHeight: 1.7, color: "#9aa0a6", margin: "0 0 20px" }}>
              سيرتك محفوظة على هذا الجهاز ولم يضِع منها شيء.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={reset}
                style={{ background: "#8b5cf6", color: "#fff", border: 0, borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Try again · حاول مجدداً
              </button>
              {/* A plain anchor, not a router link: the router is part of what may be broken. */}
              <a
                href="/builder"
                style={{ border: "1px solid rgba(255,255,255,.18)", color: "#e8e8ef", borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
              >
                Builder · المنشئ
              </a>
            </div>
            {error?.digest && (
              <p style={{ marginTop: 22, fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#6b7280" }}>
                {error.digest}
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
