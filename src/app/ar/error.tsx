"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The Arabic error page.
 *
 * The English one already said the right thing — "your work isn't lost" — to the half of this
 * product's users who read English. An Arabic user whose page crashed got that sentence in a
 * language they did not choose, at the moment they were most likely to give up.
 *
 * The wording is deliberately specific about WHERE the work is. "Nothing was lost" is a promise a
 * user has no reason to believe from a page that just broke; "your CV is saved on this device"
 * is a fact they can check by pressing the button underneath.
 */
export default function ArabicError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    /* The digest is the only thing that joins this screen to a server log. */
    console.error("App error:", error?.digest ?? "", error);
  }, [error]);

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <div className="card w-full max-w-md p-10 text-center" style={{ borderColor: "rgba(248,113,113,0.4)" }}>
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full font-mono text-3xl"
          style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}
        >
          !
        </div>
        <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          سيرتك محفوظة على هذا الجهاز ولم يضِع منها شيء. جرّب مرة أخرى، أو ارجع إلى المنشئ وستجد
          مسوّدتك كما تركتها.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-accent px-6 py-3">حاول مرة أخرى</button>
          <Link href="/ar/builder" className="btn-ghost px-6 py-3 font-semibold" style={{ color: "var(--fg)" }}>
            العودة إلى المنشئ
          </Link>
        </div>
        {error?.digest && (
          <p className="mt-6 font-mono text-[11px]" style={{ color: "var(--faint)" }}>
            {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
