"use client";

import Link from "next/link";
import { useEffect } from "react";

/** The Arabic twin of `app/builder/[resumeId]/[step]/error.tsx` — see it for the reasoning. */
export default function ArabicBuilderStepError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Builder step error:", error?.digest ?? "", error);
  }, [error]);

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-5 py-16 text-center">
      <div className="card p-8" style={{ borderColor: "rgba(252,211,77,.35)" }}>
        <h1 className="text-lg font-bold">تعذّر عرض هذه الخطوة</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          سيرتك محفوظة على هذا الجهاز ولم يضِع منها شيء — ما فشل هو رسم هذه الشاشة، لا عملك. جرّبها
          مرة أخرى، أو أكمل من خطوة أخرى.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-accent px-5 py-2.5 text-sm font-semibold">أعد المحاولة</button>
          <Link href="/ar/builder" className="btn-ghost px-5 py-2.5 text-sm font-semibold" style={{ color: "var(--fg)" }}>
            العودة إلى سيرتي
          </Link>
        </div>
        {error?.digest && (
          <p className="mt-6 font-mono text-[11px]" style={{ color: "var(--faint)" }}>{error.digest}</p>
        )}
      </div>
    </div>
  );
}
