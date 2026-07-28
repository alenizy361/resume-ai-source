"use client";

/**
 * Sign in. One card, one orb, no cinema.
 *
 * ── what this page used to do ──
 *
 * It rendered `AuroraBlobs` (two 58vmax blurred spheres on a 24s loop), set a full-screen orb
 * scene through `useOrbScene` — a 72px orb flying in on a spring, switching to a `radio-pulse`
 * broadcast animation once the link was sent — read from a SECOND colour palette
 * (`--cosmos-bg`, a different black from every other page), and centred one small card inside
 * `min-h-screen` with `overflow: hidden`.
 *
 * So: an animation to wait through before the email field appeared, a page taller than the
 * screen on iOS because `100vh` excludes the address bar, and a colour scheme that did not
 * match the site. For a form with one input.
 *
 * ── what it does now ──
 *
 * The card and the orb, in the shared shell, painted in the first frame. The orb is the
 * identity and it stays — it simply sits in the card instead of flying across the viewport.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import BrandOrb from "@/app/components/BrandOrb";
import useLang from "@/app/components/useLang";

function LoginInner() {
  const params = useSearchParams();
  const ar = useLang();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  // Survive refresh/back after sending — otherwise users re-request duplicates.
  useEffect(() => {
    try {
      // Arriving via an expired link must show that message in the form — not the
      // stale "Check your inbox" view restored from a previous request.
      if (params.get("error") === "expired") {
        sessionStorage.removeItem("ra_login_sent");
        return;
      }
      const saved = sessionStorage.getItem("ra_login_sent");
      /* `sessionStorage` does not exist on the server, so this cannot be read during render
         without the server and the client disagreeing about which view to show. One extra render
         at mount is the cost, and it buys a user who refreshed not being sent back to the form
         they already submitted. */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) { setEmail(saved); setState("sent"); }
    } catch { /* noop */ }
  }, [params]);
  const [error, setError] = useState(params.get("error") === "expired" ? (ar ? "انتهت صلاحية الرابط — اطلب رابطاً جديداً." : "That link expired — request a new one.") : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setState("sent");
      try { sessionStorage.setItem("ra_login_sent", email); } catch { /* noop */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  return (
    /*
     * `min-h-dvh` and no `overflow: hidden`.
     *
     * `100vh` here made the page taller than an iOS viewport, so a login form that fits on the
     * screen produced a scrollbar; and `overflow: hidden` was there to clip decorative blobs
     * that no longer exist. Removing it also restores the ordinary behaviour when the on-screen
     * keyboard opens and the card needs to scroll into view.
     */
    <main dir={ar ? "rtl" : "ltr"} className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href={ar ? "/ar" : "/"} className="ps-brand mb-6 justify-center">
          {/* The pulsing black orb, at the one place on this page where it belongs. */}
          <BrandOrb size={30} />
          <span>{ar ? "سيرة" : "Sira"}</span>
        </Link>

        <div className="card p-7">
          {state === "sent" ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold">{ar ? "تفقّد بريدك الوارد" : "Check your inbox"}</h1>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {ar ? <>أرسلنا رابط الدخول إلى <strong>{email}</strong>. انقره للمتابعة — تنتهي صلاحيته خلال ١٥ دقيقة.</> : <>We sent a sign-in link to <strong>{email}</strong>. Click it to continue — it expires in 15 minutes.</>}
              </p>
              <button
                onClick={() => { try { sessionStorage.removeItem("ra_login_sent"); } catch { /* noop */ } setEmail(""); setState("idle"); }}
                className="mt-4 text-sm font-semibold" style={{ color: "var(--accent-deep)" }}>
                {ar ? "استخدام بريد آخر ←" : "Use a different email →"}
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">{ar ? "سيرتك بانتظارك" : "Your resume awaits"}</h1>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{ar ? "أدخل بريدك الإلكتروني وسنرسل لك رابط دخول — بلا كلمة مرور." : "Enter your email and we'll send you a magic link — no password."}</p>
              <form onSubmit={submit} className="mt-5 space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  /* 16px, not smaller: iOS Safari zooms the whole page when a focused input's
                     text is under 16px, which then leaves the layout scrolled sideways. */
                  style={{ background: "rgba(15, 20, 35, 0.08)", border: "1px solid var(--line)", color: "var(--fg)", fontSize: 16 }}
                />
                {error && <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "var(--danger)" }}>{error}</div>}
                <button type="submit" disabled={state === "sending"} className="ps-cta w-full justify-center disabled:opacity-50">
                  {state === "sending" ? (ar ? "جارٍ الإرسال…" : "Sending…") : (ar ? "أرسل رابط الدخول" : "Send magic link")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/*
 * The comment above USED to say "the same shape as the page, not a blank screen" — the actual
 * fallback was `<main className="min-h-dvh" />`, which is nothing: no `<h1>`, no card, no input,
 * exactly the empty-server-HTML complaint a launch-readiness crawl reported for this route. A real
 * visitor barely sees it (`LoginInner` mounts within one frame), but a crawler, a screen reader
 * before hydration, or a slow connection got a genuinely blank page. `?lang=ar` (how `/ar/login`
 * reaches this route) is itself only knowable once `useSearchParams` resolves, so this can't be
 * bilingual without the same async dependency it exists to cover for — English, the direct-visit
 * default, same call `AccountClient.tsx`'s equivalent fallback makes for the same reason.
 */
function LoginFallback() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="card p-7 text-center">
          <h1 className="text-2xl font-bold">Your resume awaits</h1>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>Enter your email and we&apos;ll send you a magic link — no password.</p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginInner />
    </Suspense>
  );
}
