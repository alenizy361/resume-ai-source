"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import CheckoutButton from "./CheckoutButton";

/**
 * Session-aware nav links. Shows "Sign in" when logged out, and the user's
 * email + Account link when logged in — so clicking a magic link visibly DOES
 * something. Renders nothing auth-related until /api/auth/me answers (no flash).
 */
export default function AuthNav({ ar = false }: { ar?: boolean }) {
  const [me, setMe] = useState<{ signedIn: boolean; email?: string; unlimited?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ signedIn: false }));
  }, []);

  if (!me) return <span className="w-24" />; // reserve space, no flash

  /* Was `href={ar ? "/ar#pricing" : "/#pricing"}` — a dead anchor, no such element exists on the
     homepage. Buying the Complete Pack directly from wherever this nav renders needs no separate
     pricing page in between.

     It said "Unlimited", which this product does not sell: both plans are one-time passes with an
     end date, and /pricing's own footer line promises "No subscription, ever". A word that means
     "forever" over a button that buys 90 days is the kind of claim a customer screenshots. */
  const unlockButton = (
    <CheckoutButton ar={ar} plan="complete" label={ar ? "افتح الوصول الكامل ←" : "Unlock full access →"} variant="accent" className="btn-accent px-4 py-2 text-sm" />
  );

  if (me.signedIn) {
    return (
      <>
        <Link href={ar ? "/ar/account" : "/account"} className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          <span className="max-w-40 truncate" dir="ltr">{me.email}</span>
        </Link>
        {me.unlimited ? (
          <Link href={ar ? "/ar/account" : "/account"} className="btn-ghost px-4 py-2 text-sm font-semibold" style={{ color: "var(--accent-deep)" }}>
            {ar ? "غير محدود ✓" : "Unlimited ✓"}
          </Link>
        ) : unlockButton}
      </>
    );
  }

  return (
    <>
      {/* 44px — this measured 20px tall, the same gap the language toggle beside it just closed. */}
      <Link href={ar ? "/ar/login" : "/login"} className="inline-flex min-h-11 items-center text-sm" style={{ color: "var(--muted)" }}>{ar ? "تسجيل الدخول" : "Sign in"}</Link>
      {unlockButton}
    </>
  );
}
