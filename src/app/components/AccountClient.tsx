"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import useLang from "./useLang";
import { accessExpiresAt, daysRemaining, entitlementFrom } from "@/app/lib/entitlement";
import { toArabicDigits } from "@/app/lib/plans";
import { navCta } from "@/app/lib/brand";
import BrandOrb from "../components/BrandOrb";
import CheckoutButton from "../components/CheckoutButton";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ScoreOrb from "../components/orb/ScoreOrb";
import PageShell from "../components/PageShell";
import {
  getScans, removeScan, type ScanEntry,
  getResumes, removeResume, type SavedResume,
  getJobs, addJob, updateJob, removeJob, type JobEntry, type JobStatus,
} from "../lib/localdata";
import { forgetOwner, ownerKey } from "@/app/lib/resumeStore";
import {
  forgetPersonal, migrateUnowned, readPersonalJson, removePersonal, writePersonal,
} from "@/app/lib/personalStore";

interface Me {
  signedIn: boolean;
  email?: string;
  unlimited?: boolean;
  until?: number;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};
const STATUS_COLORS: Record<JobStatus, string> = {
  saved: "var(--faint)",
  applied: "#60a5fa",
  interview: "#fbbf24",
  offer: "#a78bfa",
  rejected: "#f87171",
};

// Bilingual UI strings — the account page is a shared route, so an Arabic
// visitor (arriving from /ar) must not suddenly hit an English dashboard.
const STRINGS = {
  en: {
    optimizeCta: "Optimize a resume →", welcome: "You're signed in — welcome back!",
    myAccount: "● Career Dashboard", dashboard: "Your career dashboard", loading: "Loading…",
    email: "Email", plan: "Plan", unlimited: "Unlimited — active", free: "Free",
    accessUntil: "Access until", unlockUnlimited: "Unlock unlimited →",
    signOut: "Sign out", signingOut: "Signing out…",
    notSignedIn: "You're not signed in. Your history below lives on this device — sign in to link your paid access.",
    signIn: "Sign in →", jobApps: "Job applications", close: "Close", addJob: "+ Add job",
    company: "Company", jobTitle: "Job title", jobLink: "Job link (optional)", add: "Add",
    jobHint: "Track every application: company, role, and status (saved → applied → interview → offer). Stays on this device.",
    resumeUsed: "Resume used (optional)", noResumePicked: "No resume linked", prepareInterview: "Prepare for this interview →",
    scanHistory: "Scan history", scanHint: "Your last 10 scans will appear here with one-click reopen.",
    savedResumes: "Saved resumes", savedHint: "Resumes you build or unlock are saved here automatically (on this device).",
    open: "Open", builder: "CV Builder", optimizer: "Optimizer",
    ready: "ready to send", draftLbl: "draft", scoreLbl: "score", doneLbl: "filled in",
  },
  ar: {
    optimizeCta: "حسّن سيرتك ←", welcome: "سجّلت دخولك — أهلاً بعودتك!",
    myAccount: "● لوحتك المهنية", dashboard: "لوحة مسيرتك المهنية", loading: "جارٍ التحميل…",
    email: "البريد", plan: "الباقة", unlimited: "كامل — نشط", free: "مجاني",
    accessUntil: "الوصول حتى", unlockUnlimited: "افتح الوصول الكامل ←",
    signOut: "تسجيل الخروج", signingOut: "جارٍ الخروج…",
    notSignedIn: "لم تسجّل الدخول. سجلّك بالأسفل محفوظ على هذا الجهاز فقط — سجّل الدخول لربط وصولك المدفوع.",
    signIn: "تسجيل الدخول ←", jobApps: "طلبات الوظائف", close: "إغلاق", addJob: "+ إضافة وظيفة",
    company: "الشركة", jobTitle: "المسمى الوظيفي", jobLink: "رابط الوظيفة (اختياري)", add: "إضافة",
    jobHint: "تابع كل طلب: الشركة، المسمى، والحالة (محفوظ ← قدّمت ← مقابلة ← عرض). يبقى على هذا الجهاز.",
    resumeUsed: "السيرة المستخدَمة (اختياري)", noResumePicked: "لا توجد سيرة مرتبطة", prepareInterview: "استعد لهذه المقابلة ←",
    scanHistory: "سجل الفحوصات", scanHint: "آخر ١٠ فحوصات تظهر هنا مع إعادة فتح بضغطة.",
    savedResumes: "السير المحفوظة", savedHint: "السير التي تبنيها أو تفتحها تُحفظ هنا تلقائياً (على هذا الجهاز).",
    open: "فتح", builder: "منشئ السيرة", optimizer: "المحسّن",
    ready: "جاهزة للإرسال", draftLbl: "مسوّدة", scoreLbl: "التقييم", doneLbl: "مكتملة",
  },
};

function AccountInner({ initialLang = "en" }: { initialLang?: "en" | "ar" }) {
  const router = useRouter();
  // Follow the SITE language the user chose (via the عربي/English toggle), NOT
  // the browser locale — otherwise a Saudi user browsing the English flow got a
  // fully mirrored RTL account screen. Default English; RTL only on explicit ar.
  // Starts "en" on both server and first client render so hydration matches;
  // the stored/URL language flips in right after mount (one-frame, no mismatch).
  /*
   * The reader's language, from the one place that knows it.
   *
   * This used to be `useState` plus an effect that read the URL and storage and called `setLang` —
   * the same code `useLang` already contains, duplicated, and rendering the English strings once
   * before flipping. `useLang` is now a `useSyncExternalStore` read, so there is no intermediate
   * render and no second copy of the rule about which key wins.
   */
  const arFromBrowser = useLang();
  const lang: "en" | "ar" = initialLang === "ar" || arFromBrowser ? "ar" : "en";
  const t = STRINGS[lang];
  /** When /api/auth/me answered — the reference point for expiry, read outside render. */
  const [knownAt, setKnownAt] = useState(0);
  // Capture the welcome flag once into state — router.replace below strips the
  // param, which flips the reactive searchParams value back to false and would
  // otherwise make the banner flash and immediately vanish.
  const [welcome] = useState(useSearchParams().get("welcome") === "1");
  useEffect(() => {
    if (welcome) router.replace("/account", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [me, setMe] = useState<Me | null>(null);
  const [owned, setOwned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [links, setLinks] = useState<{ slug: string; url: string; token: string }[]>([]);
  const [linkError, setLinkError] = useState<Record<string, string>>({});
  const [scans, setScans] = useState<ScanEntry[]>([]);
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [cloudCvs, setCloudCvs] = useState<{ id: string; title: string; text: string; source: string; savedAt: number }[]>([]);
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [jc, setJc] = useState(""); // company
  const [jt, setJt] = useState(""); // title
  const [ju, setJu] = useState(""); // url
  const [jr, setJr] = useState(""); // linked resume id, "" = none picked

  /*
   * The one mount-time read of everything this browser already knows.
   *
   * `set-state-in-effect` is disabled for this effect deliberately, and the alternative is worse
   * rather than merely longer. These lists live in `localStorage`, which does not exist on the
   * server: reading them in a lazy `useState` initializer would make the server render an empty
   * account page and the client a full one, which is a hydration mismatch on every load. Reading
   * them here costs one extra render at mount, once, for data that then never changes without a
   * user action.
   */
  useEffect(() => {
    // The clock is read HERE, in the promise callback, not during render. `Date.now()` in
    // a render body — even inside useMemo, whose factory also runs during render — makes
    // the server's output differ from the client's. The moment we learned the entitlement
    // is also the honest reference point for "when does it expire".
    fetch("/api/auth/me").then((r) => r.json())
      .then((d) => { setMe(d); setKnownAt(Date.now()); })
      .catch(() => { setMe({ signedIn: false }); setKnownAt(Date.now()); })
      .finally(() => setLoading(false));
    // Cloud-saved CVs (signed-in only) — survive a cleared browser.
    fetch("/api/resumes").then((r) => r.json()).then((d) => { if (d?.ok && d.signedIn && Array.isArray(d.cvs)) setCloudCvs(d.cvs); }).catch(() => {});
  }, []);

  /*
   * ── nothing personal is read until we know whose it is ──
   *
   * These six lists used to be read in the mount effect above, beside the `/api/auth/me` call and
   * therefore BEFORE its answer. They were keyed on nothing, so on a shared browser this page showed
   * the previous account's saved CVs — full text — their scan history, their job applications, their
   * published links WITH the unpublish tokens, and their paid-entitlement flag.
   *
   * The owner comes from the `me` this page already fetched rather than from `useOwner()`, which would
   * be a second request to the same endpoint on the same page. Empty until it resolves, and every
   * reader in `personalStore` returns nothing for an empty owner — so the first render shows an empty
   * dashboard for a moment instead of somebody else's.
   */
  const owner = me ? ownerKey(me.signedIn ? me.email : null) : "";

  useEffect(() => {
    if (!owner) return;
    /* Adopt the pre-scoping values, once. Never overwrites; retires rather than deletes. */
    migrateUnowned(owner);
    /* eslint-disable react-hooks/set-state-in-effect -- see the note above the mount effect. */
    setLinks(readPersonalJson<{ slug: string; url: string; token: string }[]>(owner, "ra_published", []));
    setScans(getScans(owner));
    setResumes(getResumes(owner));
    setJobs(getJobs(owner));
    setOwned(readPersonalJson<string>(owner, "ra_owned", "") === "1");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [owner]);

  async function deleteCloudCv(id: string) {
    try {
      const r = await fetch(`/api/resumes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const d = await r.json();
      if (d?.ok && Array.isArray(d.cvs)) setCloudCvs(d.cvs);
    } catch { /* noop */ }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      /*
       * Clear this account's local data HERE, on the page the sign-out actually happens on.
       *
       * `useOwner` clears on the owner TRANSITION, which is correct but only fires somewhere that uses
       * it — the builder. Someone who signs out from this page and closes the tab would have left the
       * next person their saved CVs, their scan history and their publish tokens. The server copy at
       * `/api/resumes` is what makes this safe to delete: the browser holds a recovery draft, not the
       * only copy.
       */
      if (owner && owner !== "anon") { forgetOwner(owner); forgetPersonal(owner); }
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  async function removeLink(slug: string, token: string) {
    // Only forget the link locally once the server confirms it's gone — otherwise
    // a 403 (bad/missing token) would leave the resume live at /r/{slug} with the
    // user's PII while we drop the only proof of ownership (the unpublish token),
    // orphaning it forever. 404 = already gone, so treat that as success too.
    setLinkError((e) => ({ ...e, [slug]: "" }));
    try {
      const res = await fetch(`/api/publish?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        setLinkError((e) => ({ ...e, [slug]: "Couldn't unpublish — try again" }));
        return;
      }
    } catch {
      setLinkError((e) => ({ ...e, [slug]: "Couldn't unpublish — try again" }));
      return;
    }
    const next = links.filter((l) => l.slug !== slug);
    setLinks(next);
    writePersonal(owner, "ra_published", JSON.stringify(next));
  }

  function openScan(s: ScanEntry) {
    // Restore the result into the right optimizer and navigate to it.
    writePersonal(owner, s.lang === "ar" ? "ra_ar_optimize_result" : "ra_optimize_result", JSON.stringify(s.result));
    router.push(s.lang === "ar" ? "/ar/optimize" : "/optimize");
  }

  function loadResume(r: SavedResume) {
    writePersonal(owner, "ra_optimize_draft", JSON.stringify({ resume: r.text, jobDescription: "", mode: "general" }));
    removePersonal(owner, "ra_optimize_result");
    router.push("/optimize");
  }

  function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function submitJob(e: React.FormEvent) {
    e.preventDefault();
    if (!jc.trim() && !jt.trim()) return;
    const picked = jr ? resumes.find((r) => r.id === jr) : undefined;
    addJob(owner, {
      company: jc.trim(), title: jt.trim(), url: ju.trim(), status: "saved", note: "",
      resumeId: picked?.id, resumeTitle: picked?.title,
    });
    setJobs(getJobs(owner));
    setJc(""); setJt(""); setJu(""); setJr("");
    setShowJobForm(false);
  }

  // رابط keeps a quiet presence over the Library — golden once you own a pack.

  /*
   * Read once per mount, not on every render.
   *
   * `Date.now()` in a render body makes the output depend on when React happened to
   * render — the same reason `reviewChecks` takes its reference date as an argument. It
   * also goes through `daysRemaining`/`accessExpiresAt` now, so "when does my access
   * end" is answered by the entitlement service rather than by arithmetic here.
   */
  const entitlement = useMemo(() => entitlementFrom(me), [me]);
  const untilMs = accessExpiresAt(entitlement);
  // `knownAt` is 0 until the fetch resolves, and `me` is null until then too, so this
  // block does not render before there is a real time to compare against.
  const until = knownAt > 0 && untilMs > knownAt ? new Date(untilMs) : null;
  const daysLeft = knownAt > 0 ? daysRemaining(entitlement, knownAt) : null;

  const sectionCard = "card p-6";
  const sectionTitle = "mb-4 text-sm font-bold";

  return (
    <PageShell lang={lang} cta={navCta(lang)} langToggle={lang === "ar" ? "/account" : "/ar/account"} width="reading">
      <div className="mx-auto max-w-2xl">
        {welcome && (
          <div className="mb-6 rounded-xl px-4 py-3 text-sm font-semibold"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.35)", color: "var(--accent)" }}>
            {t.welcome}
          </div>
        )}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="chip">{t.myAccount}</div>
          {owned && <span className="gold-stamp">{lang === "ar" ? "مملوكة ✓" : "Owned ✓"}</span>}
        </div>
        <h1 className="mb-8 text-3xl font-extrabold">{t.dashboard}</h1>

        {/* ── Plan card ── */}
        <div className={sectionCard}>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>{t.loading}</p>
          ) : me?.signedIn ? (
            <>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-sm" style={{ color: "var(--faint)" }}>{t.email}</dt>
                  <dd className="text-sm font-medium" dir="ltr">{me.email}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm" style={{ color: "var(--faint)" }}>{t.plan}</dt>
                  <dd className="text-sm font-medium" style={{ color: me.unlimited ? "var(--accent)" : "var(--muted)" }}>
                    {me.unlimited ? t.unlimited : t.free}
                  </dd>
                </div>
                {until && (
                  <div className="flex items-center justify-between">
                    <dt className="text-sm" style={{ color: "var(--faint)" }}>{t.accessUntil}</dt>
                    <dd className="text-sm font-medium">
                      {until.toLocaleDateString()} {until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {/* Rounded up by daysRemaining: a pass with four hours left has one
                          day left, not zero. */}
                      {daysLeft !== null && (
                        <span style={{ color: "var(--faint)" }}> · {lang === "ar" ? `${toArabicDigits(daysLeft)} يوم` : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}</span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              {!me.unlimited && (
                /* `/#pricing` was a dead anchor — no such element exists on the homepage. "Unlimited"
                   is the 90-day Complete Pack, so this buys it directly rather than sending the
                   visitor to compare plans they've already decided between by clicking this. */
                <CheckoutButton ar={lang === "ar"} plan="complete" label={t.unlockUnlimited} variant="accent" />
              )}
              <button onClick={signOut} disabled={signingOut}
                className="btn-ghost mt-3 block w-full py-2.5 text-center text-sm font-semibold disabled:opacity-50" style={{ color: "var(--fg)" }}>
                {signingOut ? t.signingOut : t.signOut}
              </button>
            </>
          ) : (
            <div className="text-center">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t.notSignedIn}
              </p>
              <Link href="/login" className="btn-accent mt-4 inline-block px-8 py-2.5">{t.signIn}</Link>
            </div>
          )}
        </div>

        {/* ── Job application tracker ── */}
        <div className={`${sectionCard} mt-6`}>
          <div className="flex items-center justify-between">
            <h2 className={sectionTitle} style={{ marginBottom: 0 }}>📋 {t.jobApps} ({jobs.length})</h2>
            <button onClick={() => setShowJobForm((v) => !v)} className="btn-ghost px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--accent)" }}>
              {showJobForm ? t.close : t.addJob}
            </button>
          </div>
          {showJobForm && (
            <form onSubmit={submitJob} className="mt-4 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={jc} onChange={(e) => setJc(e.target.value)} placeholder={t.company}
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }} />
                <input value={jt} onChange={(e) => setJt(e.target.value)} placeholder={t.jobTitle}
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }} />
              </div>
              <input value={ju} onChange={(e) => setJu(e.target.value)} placeholder={t.jobLink} dir="ltr"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }} />
              {resumes.length > 0 && (
                <select value={jr} onChange={(e) => setJr(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: jr ? "var(--fg)" : "var(--faint)" }}>
                  <option value="">{t.resumeUsed}</option>
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>{r.title || (lang === "ar" ? "سيرة بلا عنوان" : "Untitled CV")}</option>
                  ))}
                </select>
              )}
              <button type="submit" className="btn-accent w-full py-2 text-sm">{t.add}</button>
            </form>
          )}
          {jobs.length === 0 && !showJobForm ? (
            <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
              {t.jobHint}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{j.title || "—"} <span style={{ color: "var(--muted)" }}>@ {j.company || "—"}</span></div>
                    {j.url && <a href={j.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="block truncate text-xs text-accent">{j.url}</a>}
                    <div className="truncate text-xs" style={{ color: "var(--faint)" }}>
                      {j.resumeTitle ? `📄 ${j.resumeTitle}` : t.noResumePicked}
                    </div>
                    {(j.status === "interview" || j.status === "applied") && (
                      <Link href={lang === "ar" ? "/ar/interview" : "/interview"} className="text-xs font-semibold text-accent">{t.prepareInterview}</Link>
                    )}
                  </div>
                  <select
                    value={j.status}
                    onChange={(e) => { updateJob(owner, j.id, { status: e.target.value as JobStatus }); setJobs(getJobs(owner)); }}
                    className="rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: STATUS_COLORS[j.status] }}>
                    {(Object.keys(STATUS_LABELS) as JobStatus[]).map((st) => (
                      <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                    ))}
                  </select>
                  <button onClick={() => { removeJob(owner, j.id); setJobs(getJobs(owner)); }} className="text-xs" style={{ color: "var(--faint)" }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Scan history ── */}
        <div className={`${sectionCard} mt-6`}>
          <h2 className={sectionTitle}>🔍 {t.scanHistory} ({scans.length})</h2>
          {scans.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--faint)" }}>{t.scanHint}</p>
          ) : (
            <ul className="space-y-2">
              {scans.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)" }}>
                  <div className="shrink-0"><ScoreOrb value={s.score} size={46} animate={false} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{s.jobTitle}</div>
                    <div className="font-mono text-[11px]" style={{ color: "var(--faint)" }}>{new Date(s.ts).toLocaleString()}</div>
                  </div>
                  <button onClick={() => openScan(s)} className="btn-ghost shrink-0 px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--accent)" }}>{t.open}</button>
                  <button onClick={() => { removeScan(owner, s.id); setScans(getScans(owner)); }} className="text-xs" style={{ color: "var(--faint)" }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Saved resumes ── */}
        <div className={`${sectionCard} mt-6`}>
          <h2 className={sectionTitle}>{t.savedResumes} ({resumes.length})</h2>
          {resumes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <BrandOrb variant="button" size={40} />
              <p className="text-xs" style={{ color: "var(--faint)" }}>{lang === "ar" ? "ما عندك سيرة بعد — خلّينا نسوي واحدة ☕" : "No resume yet — let's make one ☕"}</p>
              <Link href={lang === "ar" ? "/ar" : "/"} className="btn-accent px-5 py-2 text-xs font-semibold">{lang === "ar" ? "ابدأ ←" : "Start →"}</Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {resumes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.title}</div>
                    <div className="font-mono text-[11px]" style={{ color: "var(--faint)" }}>
                      {r.source === "built" ? t.builder : t.optimizer} · {new Date(r.ts).toLocaleDateString()}
                      {/*
                        Measured when this CV was saved, and describing the exact text stored with
                        it — so it is safe to show without a "this may be out of date" caveat.
                        Records written before these fields existed simply show what they always
                        showed; hiding them to keep the column tidy would lose the user's work to a
                        layout.
                      */}
                      {typeof r.qualityScore === "number" && ` · ${t.scoreLbl} ${r.qualityScore}`}
                      {typeof r.completion === "number" && ` · ${r.completion}% ${t.doneLbl}`}
                      {r.status && ` · ${r.status === "draft" ? t.draftLbl : t.ready}`}
                    </div>
                  </div>
                  <button onClick={() => loadResume(r)} className="btn-ghost px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--accent)" }}>Optimize</button>
                  <button onClick={() => downloadText("resume.txt", r.text)} className="btn-ghost px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--fg)" }}>↓ .txt</button>
                  <button onClick={() => { removeResume(owner, r.id); setResumes(getResumes(owner)); }} className="text-xs" style={{ color: "var(--faint)" }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Cloud-saved CVs (survive a cleared browser) ── */}
        {(me?.signedIn && cloudCvs.length > 0) && (
          <div className={`${sectionCard} mt-6`}>
            <h2 className={sectionTitle}>☁️ Saved to your account ({cloudCvs.length})</h2>
            <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>These are stored on your account — they won&apos;t be lost if you clear this browser or switch device.</p>
            <ul className="space-y-2">
              {cloudCvs.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.title}</div>
                    <div className="font-mono text-[11px]" style={{ color: "var(--faint)" }}>
                      {c.source === "built" ? t.builder : t.optimizer} · {new Date(c.savedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button onClick={() => downloadText("resume.txt", c.text)} className="btn-ghost px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--fg)" }}>↓ .txt</button>
                  <button onClick={() => deleteCloudCv(c.id)} className="text-xs" style={{ color: "var(--faint)" }}>✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Public links ── */}
        <div className={`${sectionCard} mt-6`}>
          <h2 className={sectionTitle}>🔗 My public resume links ({links.length})</h2>
          {links.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--faint)" }}>Links you publish from the builder appear here so you can unpublish them anytime.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => (
                <li key={l.slug} className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate text-accent" dir="ltr">{l.url}</a>
                    <button onClick={() => removeLink(l.slug, l.token)} className="shrink-0 text-xs" style={{ color: "#f87171" }}>Unpublish</button>
                  </div>
                  {linkError[l.slug] && (
                    <p className="mt-1.5 text-xs" style={{ color: "#f87171" }}>{linkError[l.slug]}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-6 text-center font-mono text-[11px]" style={{ color: "var(--faint)" }}>
          {lang === "ar"
            ? <>السجل والسير والوظائف محفوظة على هذا الجهاز فقط — لا شيء يُرفع. <Link href="/ar/privacy" className="underline">الخصوصية</Link></>
            : <>History, resumes, and applications are stored on this device only — nothing is uploaded. <Link href="/privacy" className="underline">Privacy</Link></>}
        </p>
      </div>
    </PageShell>
  );
}

/*
 * What the raw server HTML contains while `useSearchParams()` (inside `AccountInner`) is still
 * resolving — real content, not an empty `<main>`.
 *
 * The empty fallback this replaced was a genuine, reported bug: a crawl of `/account` found `200
 * OK`, a `<title>`, and NO `<h1>`, no buttons, no inputs anywhere in the server-rendered HTML — this
 * `<Suspense>` boundary's own fallback WAS that empty page, since nothing here ever gave it content.
 * A real visitor never saw a permanently blank screen (`AccountInner` mounts and replaces this within
 * one frame), but a slow connection, a crawler, or a screen reader arriving before hydration did.
 * Same fix `BuilderStart.tsx`'s own `StartFallback` already applies for the identical reason: render
 * the page's OWN heading here rather than a spinner, so the first HTML response already says what
 * this page is — which is also what LCP measures. `initialLang` is a prop, known synchronously, so
 * the heading is in the correct language without waiting on anything async.
 */
function AccountFallback({ initialLang }: { initialLang: "en" | "ar" }) {
  const t = STRINGS[initialLang];
  return (
    <main dir={initialLang === "ar" ? "rtl" : "ltr"} className="min-h-dvh px-6 py-16" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-extrabold">{t.dashboard}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{t.loading}</p>
      </div>
    </main>
  );
}

export default function AccountClient({ initialLang = "en" }: { initialLang?: "en" | "ar" }) {
  return (
    <Suspense fallback={<AccountFallback initialLang={initialLang} />}>
      <AccountInner initialLang={initialLang} />
    </Suspense>
  );
}
