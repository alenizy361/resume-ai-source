"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trackStep } from "@/app/lib/funnelClient.ts";
import { PLANS, formatPrice } from "@/app/lib/plans";
import BrandOrb from "./BrandOrb";

/**
 * Two-phase checkout:
 *   1. Collect name/email/mobile and create the Paylink invoice (→ transactionNo).
 *   2. Card is paid INLINE on our own dark-themed form via the Paylink JS SDK
 *      (initPayment + submitInvoice) — no redirect for the common card path.
 *      Tamara / Tabby / Apple Pay / STC (which have no embedded SDK) stay one tap
 *      away via the hosted invoice URL.
 * Credentials never touch the client; only the transactionNo + hosted url do.
 */

const SDK_SRC = "https://paylink.sa/assets/js/paylink.js";
const PAY_MODE = process.env.NEXT_PUBLIC_PAY_MODE === "test" ? "test" : "production";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { PaylinkPayments?: any } }

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.PaylinkPayments) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { sdkPromise = null; reject(new Error("sdk")); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export default function CheckoutButton({
  plan, label, variant = "accent", ar = false, className,
}: {
  plan: "single" | "complete"; label: string; variant?: "accent" | "ghost"; ar?: boolean;
  /** Overrides the trigger button's own classes — every existing call site omits this and keeps
      the full-width block button below; a spot that needs a compact inline trigger (a button
      sharing a row with other text, say) can pass its own sizing without a second component. */
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"details" | "card">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const txRef = useRef<string>("");
  const urlRef = useRef<string>("");
  /*
   * The hosted-checkout URL, in state as well as in the ref.
   *
   * The "other ways to pay" link rendered `href={urlRef.current}`. That worked, but only
   * because `setPhase("card")` happens to follow the ref write in the same function, so a
   * re-render was already queued. A ref is not a render input: if that ordering ever
   * changes, the link becomes `href="#"` — a dead Tamara / Tabby / Apple Pay link on the
   * payment modal, at the exact moment a customer is reaching for it. The ref stays for
   * the synchronous fallback read inside `catch`, where state would be stale.
   */
  const [payUrl, setPayUrl] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payRef = useRef<any>(null);

  /*
   * The page beneath holds still while the dialog is open. Without this, a wheel or trackpad
   * scroll OVER the modal scrolled the underlying page (measured: scrollY 0 → 813 with the
   * dialog stationary on top) — disorienting mid-payment, and the buyer loses their place when
   * the dialog closes. Restored on close AND on unmount, so a modal removed any other way cannot
   * leave the page unscrollable.
   */
  useEffect(() => {
    if (!open) return;
    /* BOTH elements: with only body locked, the wheel still scrolled the page through the
       root scroller (measured scrollY 0 → 400 with body already overflow:hidden). */
    const prevBody = document.body.style.overflow;
    const prevRoot = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevRoot;
    };
  }, [open]);

  // Bind the Paylink SDK to the card fields ONLY AFTER they've rendered (phase
  // "card"). Initializing earlier bound to elements that weren't in the DOM yet,
  // so the fields never appeared.
  useEffect(() => {
    if (phase !== "card") return;
    let cancelled = false;
    (async () => {
      try {
        await loadSdk();
        if (cancelled) return;
        /* White to match the light modal — the SDK paints the card fields' own background from
           this, and #101316 left three dark inputs sitting in a white form. */
        const payment = new window.PaylinkPayments({ mode: PAY_MODE, defaultLang: ar ? "ar" : "en", backgroundColor: "#ffffff" });
        await payment.initPayment(`#cn-${uid}`, `#nm-${uid}`, `#yy-${uid}`, `#mm-${uid}`, `#cv-${uid}`);
        if (cancelled) return;
        payRef.current = payment;
      } catch {
        // SDK/init failed — surface it and let the buyer use the hosted link
        // that's already shown below, instead of yanking them away.
        if (!cancelled) setError(ar ? "تعذّر تحميل نموذج البطاقة — استخدم \"طرق أخرى\" بالأسفل." : "Couldn't load the card form — use \"Other ways\" below.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const t = ar
    // The amount comes from the same function /api/pay invoices with, so the modal
    // cannot show one number while the card is charged another.
    ? { planLine: plan === "single"
          ? `مرة واحدة · ${formatPrice("single", "ar")}`
          : `${PLANS.complete.nameAr} · ${formatPrice("complete", "ar")} · دفعة واحدة`,
        title: "إتمام الشراء", sub: "دفع آمن. أدخل بياناتك للمتابعة.", name: "الاسم الكامل",
        email: "البريد الإلكتروني (يُفعَّل عليه وصولك)", mobile: "رقم الجوال", pay: "المتابعة ←",
        starting: "جارٍ التحضير…", cancel: "إلغاء", failed: "تعذّر بدء الدفع، حاول مرة أخرى.",
        cardTitle: "بيانات البطاقة", cardName: "الاسم على البطاقة", cardNo: "رقم البطاقة",
        mm: "شهر", yy: "سنة", cvv: "CVV", payNow: "ادفع الآن", processing: "جارٍ الدفع…",
        other: "طرق أخرى: تمارا · تابي · Apple Pay · STC ←", secure: "🔒 دفع آمن عبر Paylink · ضمان استرجاع ٧ أيام",
        cardErr: "تحقّق من بيانات البطاقة وحاول مرة أخرى." }
    : { planLine: plan === "single"
          ? `One-time · ${formatPrice("single", "en")} (${PLANS.single.priceUsd})`
          : `${PLANS.complete.name} · ${formatPrice("complete", "en")} · one-time (${PLANS.complete.priceUsd})`,
        title: "Checkout", sub: "Secure payment. Enter your details to continue.", name: "Full name",
        email: "Email (unlocks your access)", mobile: "Mobile number", pay: "Continue →",
        starting: "Preparing…", cancel: "Cancel", failed: "Checkout failed. Please try again.",
        cardTitle: "Card details", cardName: "Name on card", cardNo: "Card number",
        mm: "MM", yy: "YY", cvv: "CVV", payNow: "Pay now", processing: "Processing…",
        other: "Other ways: Tamara · Tabby · Apple Pay · STC →", secure: "🔒 Secure via Paylink · 7-day money-back",
        cardErr: "Please check your card details and try again." };

  /* A visible field on white: its own faint fill, a real border that darkens on focus, 16px text
     (any smaller and iOS zooms the page on focus), and a 46px min height for the thumb. */
  const inp = {
    background: "#fbfbfd", border: "1.5px solid var(--line)", color: "var(--fg)",
    fontSize: 16, minHeight: 46, borderRadius: 12,
  } as const;
  const lbl = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 6 } as const;

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !mobile.trim()) { setError(ar ? "فضلاً عبّ كل الحقول." : "Please fill in all fields."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/pay", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, name, email, mobile, locale: ar ? "ar" : "en" }) });
      const data = await res.json();
      if (!res.ok || !data.url || !data.transactionNo) throw new Error(data.error || t.failed);
      txRef.current = String(data.transactionNo);
      urlRef.current = String(data.url);
      setPayUrl(String(data.url));
      // Switch to the card phase — the effect binds the SDK once the fields mount.
      setPhase("card"); setLoading(false);
    } catch (err) {
      // If the SDK fails to load, fall back to the hosted page so checkout never dead-ends.
      if (urlRef.current) { window.location.href = urlRef.current; return; }
      setError(err instanceof Error ? err.message : t.failed); setLoading(false);
    }
  }

  async function payCard() {
    setError(""); setPaying(true);
    try {
      if (!payRef.current) throw new Error("not ready");
      // On success the SDK opens the bank 3DS page, which returns to our callBackUrl.
      await payRef.current.submitInvoice(txRef.current);
    } catch {
      setError(t.cardErr); setPaying(false);
    }
  }

  function reset() { setOpen(false); setPhase("details"); setError(""); setPaying(false); setLoading(false); }

  return (
    <>
      {/* The funnel step for "opened checkout", fired on the click that opens the sheet rather
          than on the invoice call: an abandoned checkout is the number worth knowing, and the
          invoice never gets created for the people who abandon at the first field. */}
      <button onClick={() => { trackStep("checkoutStarted", { plan }); setOpen(true); }}
        className={className ?? (variant === "accent" ? "btn-accent block w-full py-3 text-center" : "btn-ghost block w-full py-3 text-center font-semibold")}
        style={variant === "ghost" ? { color: "var(--fg)" } : undefined}>{label}</button>

      {open && createPortal(
        /* Portalled to <body>. A `position: fixed` overlay is trapped by ANY ancestor with a
           transform/filter/will-change — the pricing card's entrance animation did exactly that,
           dropping the modal 1400px down the page instead of over the viewport. A portal is the
           correct home for a modal regardless. */
        <div className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4"
          /* `--z-dialog`, the top of the one layer scale. */
          style={{ background: "rgba(15,20,35,0.5)", backdropFilter: "blur(3px)", zIndex: "var(--z-dialog)" }}
          onClick={() => !loading && !paying && reset()}>
          {/* A white sheet: a bottom sheet on phones (thumb-reachable), a centered card on desktop. */}
          <div dir={ar ? "rtl" : "ltr"} role="dialog" aria-modal="true" aria-label={t.title}
            className={`relative w-full max-w-md overflow-hidden rounded-t-3xl p-6 sm:rounded-3xl sm:p-7 ${ar ? "text-right" : "text-left"}`}
            style={{ background: "#ffffff", color: "var(--fg)", boxShadow: "0 -8px 40px rgba(15,20,35,0.18), 0 20px 60px rgba(15,20,35,0.22)" }}
            onClick={(e) => e.stopPropagation()}>

            {/* A grabber, so the sheet reads as dismissable on a phone. */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full sm:hidden" style={{ background: "var(--line)" }} aria-hidden />

            {/* Order summary: the plan and its price, stated once, in a soft panel. */}
            <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
              style={{ background: "#f6f7fa", border: "1px solid var(--line)" }}>
              <div className="flex items-center gap-2.5">
                <BrandOrb variant="button" size={28} />
                <span className="text-sm font-bold">{ar ? "سيرة" : "Sira"}</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>{t.planLine}</span>
            </div>

            {phase === "details" ? (
              <div className="relative">
                <h3 className="text-xl font-extrabold">{t.title}</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{t.sub}</p>
                <form onSubmit={createInvoice} className="mt-5 space-y-3.5">
                  <div>
                    <label htmlFor={`buyer-name-${uid}`} style={lbl}>{t.name}</label>
                    <input id={`buyer-name-${uid}`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required className="ck-field w-full px-4 py-3" style={inp} />
                  </div>
                  <div>
                    <label htmlFor={`buyer-email-${uid}`} style={lbl}>{t.email}</label>
                    <input id={`buyer-email-${uid}`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" className={`ck-field w-full px-4 py-3 ${ar ? "text-right" : ""}`} style={inp} />
                  </div>
                  <div>
                    <label htmlFor={`buyer-mobile-${uid}`} style={lbl}>{t.mobile}</label>
                    <input id={`buyer-mobile-${uid}`} autoComplete="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" required dir="ltr" className={`ck-field w-full px-4 py-3 ${ar ? "text-right" : ""}`} style={inp} />
                  </div>
                  {error && <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.2)" }}>{error}</div>}
                  <button type="submit" disabled={loading} className="btn-accent w-full disabled:opacity-50" style={{ padding: "14px", fontSize: 16 }}>{loading ? t.starting : t.pay}</button>
                  <button type="button" onClick={reset} disabled={loading} className="w-full py-1 text-center text-sm" style={{ color: "var(--faint)" }}>{t.cancel}</button>
                </form>
                <TrustRow ar={ar} secure={t.secure} />
              </div>
            ) : (
              <div className="relative">
                <h3 className="text-xl font-extrabold">{t.cardTitle}</h3>
                {/* Inline card form — Paylink SDK binds to these (readonly) fields. */}
                <div className="mt-5 space-y-3.5">
                  <div>
                    <label htmlFor={`nm-${uid}`} style={lbl}>{t.cardName}</label>
                    <input id={`nm-${uid}`} readOnly dir="ltr" className="ck-field w-full px-4 py-3" style={inp} />
                  </div>
                  <div>
                    <label htmlFor={`cn-${uid}`} style={lbl}>{t.cardNo}</label>
                    <input id={`cn-${uid}`} readOnly inputMode="numeric" dir="ltr" className="ck-field w-full px-4 py-3" style={inp} />
                  </div>
                  <div className="flex gap-2.5" dir="ltr">
                    <div className="flex-1">
                      <label htmlFor={`mm-${uid}`} style={lbl}>{t.mm}</label>
                      <input id={`mm-${uid}`} readOnly className="ck-field w-full px-3 py-3 text-center" style={inp} />
                    </div>
                    <div className="flex-1">
                      <label htmlFor={`yy-${uid}`} style={lbl}>{t.yy}</label>
                      <input id={`yy-${uid}`} readOnly className="ck-field w-full px-3 py-3 text-center" style={inp} />
                    </div>
                    <div className="flex-1">
                      <label htmlFor={`cv-${uid}`} style={lbl}>{t.cvv}</label>
                      <input id={`cv-${uid}`} readOnly className="ck-field w-full px-3 py-3 text-center" style={inp} />
                    </div>
                  </div>
                  {error && <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.2)" }}>{error}</div>}
                  <button type="button" onClick={payCard} disabled={paying} className="btn-accent w-full disabled:opacity-50" style={{ padding: "14px", fontSize: 16 }}>{paying ? t.processing : t.payNow}</button>
                  <a href={payUrl || "#"} className="block w-full py-2 text-center text-sm font-semibold" style={{ color: "var(--accent)" }}>{t.other}</a>
                </div>
                <TrustRow ar={ar} secure={t.secure} />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * The trust row under the checkout form.
 *
 * Small security signals lift payment conversion (Stripe/web.dev): the accepted networks named,
 * an explicit "encrypted" line, and the money-back promise. Wordmarks are TEXT, not logo images —
 * a broken or mis-scaled card logo reads as LESS trustworthy than none, and text cannot 404.
 */
function TrustRow({ ar, secure }: { ar: boolean; secure: string }) {
  const nets = ["mada", "VISA", "Mastercard", "Apple Pay"];
  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {nets.map((n) => (
          <span key={n} className="rounded-md px-2 py-1 text-[11px] font-bold" style={{ background: "#f6f7fa", border: "1px solid var(--line)", color: "var(--muted)" }}>{n}</span>
        ))}
      </div>
      <p className="mt-3 text-center text-xs" style={{ color: "var(--faint)" }}>{secure}</p>
    </div>
  );
}
