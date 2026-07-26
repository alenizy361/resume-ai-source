"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * One step broke. The other ten did not.
 *
 * Without this, a throw anywhere inside a step — a malformed stored date, a template that cannot
 * render half-typed input, anything — climbs to `app/error.tsx` and replaces the whole page. The
 * user loses the rail, the preview, and any sense of where they were, and is offered "Back home",
 * which for someone eight steps into a CV is the least useful button on the internet.
 *
 * A boundary at the step segment keeps the failure the size it actually is. The draft is untouched
 * — it lives in `localStorage`, not in the component that crashed — so the honest offer is: try
 * this step again, or go to a different one.
 *
 * The Arabic twin lives under `app/ar/builder/...`; both are needed because Next resolves error
 * boundaries per segment and the two locales are separate segments.
 */
export default function BuilderStepError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Builder step error:", error?.digest ?? "", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-16 text-center">
      <div className="card p-8" style={{ borderColor: "rgba(252,211,77,.35)" }}>
        <h1 className="text-lg font-bold">This step could not be shown</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Your CV is saved on this device and nothing was lost — this is one screen failing to draw,
          not your work. Try it again, or carry on from another step.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-accent px-5 py-2.5 text-sm font-semibold">Try this step again</button>
          <Link href="/builder" className="btn-ghost px-5 py-2.5 text-sm font-semibold" style={{ color: "var(--fg)" }}>
            Back to my CV
          </Link>
        </div>
        {error?.digest && (
          <p className="mt-6 font-mono text-[11px]" style={{ color: "var(--faint)" }}>{error.digest}</p>
        )}
      </div>
    </div>
  );
}
