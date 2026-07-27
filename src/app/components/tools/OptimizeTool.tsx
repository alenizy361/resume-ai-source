"use client";

/**
 * The shared tool behind `/optimize` and `/ar/optimize` — merged from two separately-coded
 * files (F-25/O-17), but kept as TWO ROUTES rather than one, unlike `/interview` and `/linkedin`.
 *
 * ── why not one route ──
 *
 * `/ar/optimize` is not a thin redirect stub like `/ar/interview`. Its `layout.tsx` wraps this
 * component in a substantial, uniquely-Arabic SEO body — real prose, an FAQ, steps — that ranks on
 * its own and is not a translation of the English page's layout. Collapsing it into a query-param
 * toggle on `/optimize` (the `/interview`/`/linkedin` pattern) would mean either the redirect fires
 * before that content ever renders, or the tool ends up detached from the SEO body its own canonical
 * URL promises search engines and readers. So both routes stay real pages, each still wrapped by its
 * own existing layout, and both render THIS component with a `defaultAr` flag saying which one it is.
 *
 * `defaultAr` — not `useLang()` — decides the language on first paint. `useLang()` resolves from a
 * URL query param or a stored device preference, which is exactly wrong here: a visitor who reaches
 * `/ar/optimize` (from a search result, a shared link, `/ar`'s own nav) must see Arabic regardless of
 * what some earlier, unrelated page left in `localStorage`. The route itself is authoritative. A
 * `?lang=` query param can still override it after the initial mount — for the in-page toggle to
 * flip the UI without a full route change isn't needed here (see below), but the override is cheap
 * to keep for anyone who links `/optimize?lang=ar` directly.
 *
 * ── why this took a separate pass ──
 *
 * `/interview` and `/linkedin` were ~250-line files with `{ar ? x : y}` conditionals already
 * threaded through every string, so folding them into one `useLang()`-driven component was
 * mechanical. This page's English version had ZERO such conditionals — a from-scratch ~1,000-line
 * implementation, not a mirror of the ~700-line Arabic one — and this is the paid conversion path
 * (upload, AI scan, watermark, checkout), so it was deliberately deferred rather than merged blind.
 *
 * ── what the two files actually differed on, once compared line by line ──
 *
 * The Arabic page was missing real features the English one had: the "Full analysis" tab (missing/
 * present keyword cards, skills-to-highlight, the improvements breakdown), the upload-extraction
 * preview ("here's what we read — check it"), the sub-metric score breakdown, "email my results",
 * and importing a job posting from a URL. None of that was a deliberate Arabic omission — it read as
 * the Arabic page simply not having caught up — so all of it is here now, translated.
 *
 * The English page had a real bug the Arabic one had already fixed: `handleFile` set `resume` to
 * the FULL extracted text with no length check, while the textarea's `maxLength={8000}` only limits
 * TYPING, not a value set programmatically — so a long extracted resume silently exceeded 8000
 * characters with the counter turned orange and nothing actually enforcing the limit. Ported the
 * Arabic file's truncate-with-a-visible-warning behavior to both languages.
 *
 * The English page never sent `uiLang` to `/api/optimize`; the Arabic one always sent `"ar"`. The
 * route uses `uiLang` for exactly one thing — which language the ANALYSIS/COACHING prose comes back
 * in, independent of `outLang` (the rewritten RESUME's language) — and without it, an English-UI
 * visitor who pastes an Arabic resume gets Arabic analysis text with nothing UI-side explaining why.
 * Same class of bug as F-14 through F-18 fixed elsewhere this session: the UI language a person is
 * READING should never be guessed from what they pasted. Now sent explicitly, both languages.
 *
 * Kept deliberately different, not unified: the non-streaming error branch shows the server's own
 * `data.error` text to an English reader (already in English) but a fixed, friendly Arabic message
 * to an Arabic one — showing raw English server text inside an Arabic UI was the Arabic file's own
 * explicit fix, not an accident, and it stays asymmetric on purpose.
 *
 * ── the language switch got simpler, even with two routes ──
 *
 * The two old routes had to hand off a draft to each other before navigating — write the in-progress
 * `resume`/`jobDescription`/`mode` under the OTHER route's storage key, then change `location`. That
 * survives here only as a ONE-TIME read fallback (below): both routes now render the same component
 * and read/write the SAME storage keys, so a visitor who switches from `/optimize` to `/ar/optimize`
 * remounts this component fresh and immediately finds their draft already there — nothing to write
 * before navigating, because there's only one place it's ever stored going forward.
 *
 * The toggle itself is a plain route change (`/optimize` ↔ `/ar/optimize`), not a query param on one
 * URL — so each language keeps its own SEO layout wrapped around the same tool, and `defaultAr`
 * resolves correctly on the very next page load with no extra state to carry.
 *
 * Draft storage stays on the English keys (`ra_optimize_draft`/`ra_optimize_result`) going forward,
 * with a one-time fallback to the legacy `ra_ar_optimize_*` keys if the primary ones are empty — so
 * an existing Arabic-preferring visitor's in-progress draft, written before this merge shipped,
 * is still there the first time they load the merged page.
 */

import { useState, useEffect, useRef } from "react";
import { trackScanDone } from "@/app/lib/funnelClient.ts";
import { formatPrice, toArabicDigits } from "@/app/lib/plans";
import { type InProgress, resumesInProgress, sendToBuilder } from "@/app/lib/handoff";
import { shouldShowWatermark, watermarkFromResponse } from "@/app/lib/entitlement";
import { useEntitlement } from "@/app/lib/useEntitlement";
import Link from "next/link";
import PdfExport from "@/app/components/PdfExport";
import DocxExport from "@/app/components/DocxExport";
import BeforeAfter from "@/app/components/BeforeAfter";
import BrandOrb from "@/app/components/BrandOrb";
import ResumeTemplate from "@/app/components/ResumeTemplate";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import ScoreOrb from "@/app/components/orb/ScoreOrb";
import ResultCoaching from "@/app/components/ResultCoaching";
import GapFiller from "@/app/components/GapFiller";
import CheckoutButton from "@/app/components/CheckoutButton";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import { addScan, saveResume } from "@/app/lib/localdata";
import MyCvPicker from "@/app/components/MyCvPicker";
import { useOwner } from "@/app/components/useOwner";
import { readPersonalJson, removePersonal, writePersonal } from "@/app/lib/personalStore";
import { useBackToForm, useCountUp } from "@/app/lib/resultUx";

interface OptimizeResult {
  matchScore: number;
  afterScore?: number;
  matchSummary: string;
  missingKeywords: string[];
  presentKeywords: string[];
  skillsGap: string[];
  improvements: { area: string; issue: string; fix: string; source?: string }[];
  optimizedResume: string;
  locked?: boolean;
  watermark?: boolean; // free result: full text, but downloads are watermarked
}

const WM = "cv.rabit.sa";
function wmTxt(text: string, ar: boolean): string {
  const line = ar ? `— أُنشئت مجاناً عبر ${WM} —` : `— Created free with ${WM} —`;
  return `${line}\n\n${text}\n\n${line}`;
}

// Quick, local read of what we pulled out of an uploaded file so the user can
// confirm the extraction BEFORE analysis (bad OCR shouldn't be blamed on the AI).
function analyzeExtraction(text: string): { name: string; expCount: number; skillsCount: number; lang: "ar" | "en"; looksScanned: boolean } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const name = lines[0]?.slice(0, 40) || "—";
  const arChars = (text.match(/[؀-ۿ]/g) || []).length;
  const lang = arChars > text.replace(/\s/g, "").length * 0.3 ? "ar" : "en";
  const expCount = (text.match(/\b(19|20)\d{2}\b|present|current|الآن|حالي/gi) || []).length;
  const skillsCount = text.split(/[,،\n•\-]/).filter((s) => s.trim().length > 1 && s.trim().length < 30).length;
  // Very little text out of a real file usually means a scanned image / bad parse.
  const looksScanned = text.replace(/\s/g, "").length < 120;
  return { name, expCount: Math.min(expCount, 20), skillsCount: Math.min(skillsCount, 40), lang, looksScanned };
}

// Use the candidate's name (first real line of the resume) as the saved title
// instead of a generic "Optimized — date". Falls back to a dated label.
function guessResumeTitle(resume: string, ar: boolean): string {
  const first = resume.split("\n").map((l) => l.trim()).find((l) => l.length > 1) || "";
  const looksLikeName = first && first.length <= 40 && !/[@:|]|http|\d{3}/.test(first);
  if (looksLikeName) return first;
  return ar ? `محسّنة — ${new Date().toLocaleDateString("ar-SA")}` : `Optimized — ${new Date().toLocaleDateString()}`;
}

// Try-before-you-share: a realistic sample so visitors can see a full result
// without uploading their own data (privacy critique #6).
const SAMPLE_RESUME_EN = `Sarah Mitchell
sarah.mitchell@email.com · +1 555 0192 · Chicago, IL

Worked as a marketing coordinator at a retail company for 3 years. Managed social media accounts and email campaigns. Helped organize product launches. Before that, was a marketing intern for a year at a small agency doing content and reports.

Skills: social media, email marketing, Excel, Canva, some Google Analytics

Education: BA Communications, University of Illinois, 2020`;

const SAMPLE_JD_EN = `Digital Marketing Specialist — E-commerce brand
We're looking for a data-driven marketer to own our email and social channels. Requirements: 2+ years in digital marketing, hands-on experience with email automation (Klaviyo/Mailchimp), paid social campaigns, Google Analytics, A/B testing, and reporting on conversion metrics. Strong copywriting skills. E-commerce experience preferred.`;

const SAMPLE_RESUME_AR = `سارة العتيبي
sara.alotaibi@email.com · 05x xxx xxxx · الرياض

اشتغلت منسقة تسويق في شركة تجزئة ثلاث سنوات. كنت أدير حسابات التواصل الاجتماعي وحملات الإيميل وأساعد في تنظيم إطلاق المنتجات. قبلها متدربة تسويق سنة في وكالة صغيرة أسوي محتوى وتقارير.

المهارات: سوشال ميديا، إيميل ماركتنق، إكسل، كانفا، شوي قوقل أناليتكس

التعليم: بكالوريوس إعلام، جامعة الملك سعود، ٢٠٢٠`;

const SAMPLE_JD_AR = `أخصائي تسويق رقمي — علامة تجارة إلكترونية
نبحث عن مسوّق يعتمد على البيانات لإدارة قنوات الإيميل والسوشال. المتطلبات: خبرة سنتين+ في التسويق الرقمي، خبرة عملية بأتمتة الإيميل (Klaviyo/Mailchimp)، حملات إعلانات مدفوعة، Google Analytics، اختبارات A/B، وتقارير معدلات التحويل. مهارات كتابة قوية. خبرة التجارة الإلكترونية أفضلية.`;

const inputStyle = { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" };

/**
 * The route's own language, with a `?lang=` override.
 *
 * Server render and the very first client render both return `defaultAr` — nothing here reads
 * `window` until the effect, so there is no hydration mismatch. If the URL carries an explicit
 * `?lang=ar` or `?lang=en`, that wins after mount; otherwise the route's own default stands. Unlike
 * `useLang()` (used by `/interview` and `/linkedin`), this deliberately does NOT consult a stored
 * device preference — see the file header for why the route itself has to be authoritative here.
 */
function useOptimizeLang(defaultAr: boolean): boolean {
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (q === "ar") setOverride(true);
      else if (q === "en") setOverride(false);
    } catch { /* no window, or storage blocked — the route default is correct either way */ }
  }, []);
  return override ?? defaultAr;
}

export default function OptimizeTool({ defaultAr }: { defaultAr: boolean }) {
  const ar = useOptimizeLang(defaultAr);
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"resume" | "analysis">("resume");
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState("");
  const [extraction, setExtraction] = useState<ReturnType<typeof analyzeExtraction> | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailMsg, setEmailMsg] = useState("");

  async function emailResults() {
    if (!result) return;
    setEmailState("sending"); setEmailMsg("");
    try {
      const res = await fetch("/api/email-results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailTo, resume: result.optimizedResume, score: result.afterScore ?? result.matchScore }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setEmailState("sent");
    } catch (e) {
      setEmailState("error"); setEmailMsg(e instanceof Error ? e.message : (ar ? "تعذّر الإرسال." : "Failed to send."));
    }
  }
  const [coverLetter, setCoverLetter] = useState("");
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverCopied, setCoverCopied] = useState(false);
  const [thinking, setThinking] = useState("");
  const [mode, setMode] = useState<"general" | "target">("general");
  const [step, setStep] = useState(1); // guided wizard: 1 resume · 2 job · 3 language+go
  const [outLang, setOutLang] = useState<"en" | "ar" | "both">("en");
  const [resumeView, setResumeView] = useState<"text" | "designed">("text");
  const [tplSlug, setTplSlug] = useState("ats-pro");
  const [jobUrl, setJobUrl] = useState("");
  const [fetchingJob, setFetchingJob] = useState(false);
  const [jobUrlMsg, setJobUrlMsg] = useState("");
  const [employer, setEmployer] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  const [jdFileMsg, setJdFileMsg] = useState("");
  const [uploadingJd, setUploadingJd] = useState(false);
  const thinkRef = useRef<HTMLDivElement>(null);

  /*
   * `outLang` defaults to the reader's OWN language, not a hardcoded "en" — matching what the
   * Arabic-only file used to do by simply starting there. Can't read `ar` directly in the `useState`
   * initializer: on `/optimize`, `ar` is `false` from `defaultAr` on the server and the very first
   * client render, so the initializer would always capture "en" there. Corrected here, once,
   * the moment `ar` resolves to true — and only while the user hasn't already picked a language, so
   * this never overrides an explicit choice.
   */
  useEffect(() => {
    setOutLang((prev) => (ar && prev === "en") ? "ar" : prev);
  }, [ar]);

  async function importJobFromUrl() {
    if (!jobUrl.trim()) return;
    setFetchingJob(true); setJobUrlMsg("");
    try {
      const res = await fetch("/api/fetch-job", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: jobUrl.trim() }) });
      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || (ar ? "تعذّرت قراءة هذا الرابط." : "Couldn't read that link."));
      setJobDescription(data.text);
      setMode("target");
      setJobUrlMsg(ar ? "تم الاستيراد — راجع النص أدناه ثم افحص." : "Imported — review the text below, then scan.");
    } catch (e) {
      setJobUrlMsg(e instanceof Error ? e.message : (ar ? "تعذّرت قراءة هذا الرابط." : "Couldn't fetch that link."));
    } finally {
      setFetchingJob(false);
    }
  }

  useEffect(() => {
    thinkRef.current?.scrollTo({ top: thinkRef.current.scrollHeight });
  }, [thinking]);

  // Back returns to the form (not off-site); score counts up on reveal.
  useBackToForm(!!result, () => setResult(null));
  const displayScore = useCountUp(result ? (result.matchScore ?? 0) : 0);

  // Leaving mid-generation kills the request — warn before an accidental exit.
  useEffect(() => {
    if (!loading) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [loading]);

  /*
   * ── whose draft this is ──
   *
   * The two keys below hold the full text of a pasted CV and the complete analysis of it, and neither
   * was scoped: on a shared browser the next account to open this page had the previous person's CV
   * already in the textarea. `""` until `/api/auth/me` answers, and `readPersonal` returns nothing for
   * an empty owner — so the restore waits rather than restoring the wrong document.
   */
  const owner = useOwner();

  /*
   * ══════════════════════════════════════════════════════════════════════════════════
   * ONE watermark verdict for the two exports that still happen in the browser
   * ══════════════════════════════════════════════════════════════════════════════════
   *
   * The PDF and Word downloads no longer decide anything — `POST /api/export` stamps those, from the
   * request's own cookies. What is left in the browser is the `.txt` download and the DESIGNED PDF
   * (html2canvas needs a live DOM), and both were reading `watermarkFromResponse(result)`.
   *
   * Composed with OR, so either source can ask for a mark and neither can remove one:
   *   - `entLoading` marks while the check is in flight, rather than showing a clean file and
   *     taking it back
   *   - `shouldShowWatermark(entitlement)` is server-backed (`/api/auth/me`), so a paying customer
   *     who reloads still gets a clean file
   *   - `watermarkFromResponse(result)` keeps the fresh server verdict, and a rehydrated result with
   *     an edited flag can only ever ADD a mark
   */
  const { entitlement, loading: entLoading } = useEntitlement();
  const marked = entLoading || shouldShowWatermark(entitlement) || watermarkFromResponse(result);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!owner) return;
    let d = readPersonalJson<{ resume?: unknown; jobDescription?: unknown; mode?: unknown } | null>(
      owner, "ra_optimize_draft", null);
    let savedResult = readPersonalJson<OptimizeResult | null>(owner, "ra_optimize_result", null);
    // One-time fallback to the pre-merge Arabic-only keys, for a draft written before this
    // page's two routes became one. Never written back under the old names.
    if (!d) d = readPersonalJson<{ resume?: unknown; jobDescription?: unknown; mode?: unknown } | null>(
      owner, "ra_ar_optimize_draft", null);
    if (!savedResult) savedResult = readPersonalJson<OptimizeResult | null>(owner, "ra_ar_optimize_result", null);
    if (d) {
      if (typeof d.resume === "string") setResume(d.resume);
      if (typeof d.jobDescription === "string") setJobDescription(d.jobDescription);
      // Persist the MODE too — a paid user's post-payment rescan must not
      // silently drop the job description because mode reset to "general".
      // Only restore target mode when the SAVED mode was target AND a JD is
      // present — leftover JD text alone must not force target mode on a
      // draft the user had explicitly set to general review.
      if (d.mode === "target" && typeof d.jobDescription === "string" && d.jobDescription.trim().length >= 30) {
        setMode("target");
      }
    }
    if (savedResult) setResult(savedResult);
  }, [owner]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    /* No owner yet means no write. Writing under `""` would be a key nothing ever reads back, and the
       user's next keystroke would appear to save while actually going nowhere. */
    if (!owner) return;
    if (resume || jobDescription) {
      writePersonal(owner, "ra_optimize_draft", JSON.stringify({ resume, jobDescription, mode }));
    } else {
      // Both fields emptied — clear the saved draft so a refresh doesn't
      // resurrect stale text the user just deleted.
      removePersonal(owner, "ra_optimize_draft");
    }
  }, [owner, resume, jobDescription, mode]);

  useEffect(() => {
    if (!owner) return;
    if (result) writePersonal(owner, "ra_optimize_result", JSON.stringify(result));
    else removePersonal(owner, "ra_optimize_result");
  }, [owner, result]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    setUploadedName("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(ar ? "تعذّرت قراءة الملف — الصق النص يدوياً." : (data.error || "Failed to read file"));
      /*
       * The textarea's `maxLength={8000}` only limits TYPING — setting `resume` programmatically to
       * a longer string is not stopped by it, so a long extracted resume used to sail past 8000
       * characters with only the character counter turning orange to show for it. Truncated here,
       * with a visible warning, matching what the Arabic file already did.
       */
      let text = typeof data.text === "string" ? data.text : "";
      if (text.length > 8000) {
        text = text.slice(0, 8000);
        setError(ar
          ? "سيرتك طويلة — اقتصرنا على أول ٨٠٠٠ حرف. راجع النص قبل الفحص."
          : "Your resume is long — we kept the first 8,000 characters. Review the text before scanning.");
      }
      setResume(text);
      setUploadedName(file.name);
      setExtraction(analyzeExtraction(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذّرت قراءة الملف." : "Failed to read file."));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  /** Same extraction endpoint as the resume upload — a job posting saved as a PDF/DOCX/TXT
      needs the same PDF-vs-line-breaks handling `/api/extract` already has; nothing job-posting-
      specific to add. */
  async function handleJdFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJdFileMsg("");
    setUploadingJd(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(ar ? "تعذّرت قراءة الملف — الصق النص يدوياً." : (data.error || "Failed to read file"));
      let text = typeof data.text === "string" ? data.text : "";
      if (text.length > 4000) text = text.slice(0, 4000);
      setJobDescription(text);
      if (text.trim().length >= 30) setMode("target");
      setJdFileMsg(ar ? `تم استيراد الملف: ${file.name}` : `Imported from ${file.name}`);
    } catch (err) {
      setJdFileMsg(err instanceof Error ? err.message : (ar ? "تعذّرت قراءة الملف." : "Failed to read file."));
    } finally {
      setUploadingJd(false);
      e.target.value = "";
    }
  }

  function download(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Send this scan into the structured builder.
   *
   * The ORIGINAL upload is handed over, not the AI rewrite. The rewrite is the model's
   * wording of the user's facts, and the builder's contract is that model wording arrives
   * as a suggestion to accept — installing it as confirmed content would launder it into
   * fact. The rewrite is still on this page to read, copy and download.
   */
  const [inProgress, setInProgress] = useState<InProgress[]>([]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!owner) return;
    setInProgress(resumesInProgress(owner));
  }, [owner]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function continueInBuilder(replace?: string) {
    const text = resume.trim() || result?.optimizedResume || "";
    if (!text) return;
    /* `outLang` is the language the user chose for the DOCUMENT on step 3, and the builder opened
       is the one matching the reader's OWN interface language — not necessarily the document's.
       `"both"` resolves to English, the same rule the rest of the product follows. */
    const to = sendToBuilder(owner, ar ? "ar" : "en", text, {
      jobAd: jobDescription,
      cvLang: outLang === "ar" ? "ar" : "en",
      replace,
    });
    window.location.href = to;
  }

  const [coverError, setCoverError] = useState("");
  const [coverPaywalled, setCoverPaywalled] = useState(false);

  async function generateCoverLetter() {
    setCoverLoading(true);
    setCoverError("");
    setCoverPaywalled(false);
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* The same `outLang` the user chose for the rewrite. The letter and the CV must not disagree
           about their language. */
        body: JSON.stringify({ resume, jobDescription, outLang }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 402 = pass expired mid-session → show the unlock CTA, not a dead button.
        if (res.status === 402 || data.paywall) {
          setCoverPaywalled(true);
          throw new Error(ar ? "انتهت صلاحية وصولك — افتح الوصول من جديد لإنشاء خطابات التعريف." : "Your access has expired — unlock again to generate cover letters.");
        }
        // Don't echo the raw server string — use a clean, friendly message.
        throw new Error(ar ? "تعذّر إنشاء خطاب التعريف — حاول مرة أخرى." : "Couldn't generate the cover letter — please try again.");
      }
      setCoverLetter(data.coverLetter);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : (ar ? "تعذّر إنشاء خطاب التعريف." : "Failed to generate the cover letter. Please try again."));
    } finally {
      setCoverLoading(false);
    }
  }

  async function runScan(resumeOverride?: string) {
    const resumeText = typeof resumeOverride === "string" ? resumeOverride : resume;
    // Target mode promises job-specific tailoring — a job post is required there.
    if (mode === "target" && jobDescription.trim().length < 30) {
      setError(ar
        ? "وضع «تخصيص لوظيفة» يحتاج إعلان الوظيفة — الصقه، أو بدّل إلى «تقييم عام»."
        : "Target-a-job mode needs the job posting — paste it, or switch to General review.");
      return;
    }
    setError("");
    setResult(null);
    setCoverLetter("");
    setThinking("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    setLoading(true);

    // NOTE: no client-side retry here. The server already retries the model
    // internally, and each POST to /api/optimize consumes the free scan — a
    // client retry would burn the free scan and slam the user into the paywall
    // with no result. One request, one attempt.
    // Abort a stalled request so a network hang surfaces a friendly retry
    // instead of spinning forever (the "Failed to fetch" the CX test caught).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        // General review deliberately ignores the JD field — the mode label promises that.
        // `uiLang` — was only ever sent by the Arabic file — controls the language of the
        // ANALYSIS/COACHING prose the model writes, independent of `outLang` (the rewritten
        // resume's own language). Sent explicitly now for both readers, not guessed from
        // whatever script the pasted resume happens to be in.
        body: JSON.stringify({
          resume: resumeText, jobDescription: mode === "target" ? jobDescription : "",
          uiLang: ar ? "ar" : "en", outLang,
          // Only meaningful alongside an actual job description — the general-review path
          // ignores jobDescription server-side, so sending these then would be a no-op anyway.
          employer: mode === "target" ? employer : "", targetCountry: mode === "target" ? targetCountry : "",
        }),
      });

      // Non-streaming replies (validation errors, paywall) are plain JSON.
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        // The server's own error text is in English. Showing it to an English reader is fine;
        // showing it inside an Arabic UI is not — the Arabic file's own fix, kept asymmetric.
        throw new Error(ar
          ? "تعذّر الفحص — تأكد أن سيرتك مكتملة (بضعة أسطر على الأقل) وضمن الحد الأقصى ٨٠٠٠ حرف، ثم حاول مجدداً."
          : (data.error || "Failed"));
      }

      // Streaming: read NDJSON lines — live thinking, then the final result.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let got: OptimizeResult | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.t === "think") setThinking((prev) => prev + msg.d);
            else if (msg.t === "result") got = msg.d;
            else if (msg.t === "error") throw new Error(ar ? "حدث خطأ أثناء التحليل، حاول مرة أخرى." : msg.d);
          } catch (e) {
            if (e instanceof Error && e.message !== line) throw e;
          }
        }
      }
      if (!got) throw new Error(ar ? "لم يكتمل التحليل — حاول مرة أخرى." : "The analysis didn't complete. Please try again.");
      setResult(got);
      /* The funnel's middle step: a visitor who arrived from search and actually finished a
         scan. Carries the score BAND, never the resume or the job description. */
      trackScanDone(got.matchScore);
      setTab("resume");
      // Record in device-local history (account page lists these).
      try {
        addScan(owner, {
          score: got.matchScore,
          mode,
          jobTitle: mode === "target"
            ? (jobDescription.split("\n")[0].slice(0, 80) || (ar ? "فحص مخصص" : "Targeted scan"))
            : (ar ? "تقييم عام" : "General review"),
          lang: ar ? "ar" : "en",
          result: got,
        });
        if (!got.locked && got.optimizedResume) {
          saveResume(owner, { title: guessResumeTitle(got.optimizedResume, ar), source: "optimized", text: got.optimizedResume });
        }
      } catch { /* noop */ }
    } catch (err) {
      // Network drop / abort / timeout throws a raw "Failed to fetch" — turn it
      // into plain language. The user's text is still in state, so Retry works.
      const raw = err instanceof Error ? err.message : "";
      const isNetwork = /failed to fetch|load failed|networkerror|aborted|the analysis didn't complete|didn't complete/i.test(raw) || raw === "";
      setError(isNetwork
        ? (ar ? "انشغل الذكاء لحظة — سيرتك محفوظة هنا. اضغط «إعادة» للفحص من جديد." : "Connection hiccup — your resume is still here. Tap Retry to run the scan again.")
        : raw || (ar ? "حدث خطأ، حاول مرة أخرى." : "Something went wrong. Please try again."));
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  const score = result?.matchScore ?? 0;
  const scoreColor = score >= 75 ? "#a78bfa" : score >= 55 ? "#fbbf24" : "#f87171";
  // "MATCH" language only makes sense against a job. In general review (no JD)
  // there's nothing to match — use neutral quality-review wording instead.
  const verdict = mode === "target"
    ? (ar ? (score >= 75 ? "تطابق قوي ✓" : score >= 55 ? "على الحد" : "تحتاج تقوية")
          : (score >= 75 ? "STRONG MATCH" : score >= 55 ? "BORDERLINE" : "NEEDS WORK"))
    : (ar ? (score >= 75 ? "سيرة قوية ✓" : score >= 55 ? "بداية جيدة" : "تحتاج تقوية")
          : (score >= 75 ? "STRONG RESUME" : score >= 55 ? "SOLID START" : "NEEDS WORK"));

  /* `/#pricing` was a dead anchor — the homepage has no `id="pricing"` element, so this landed
     visitors at the top of the homepage with zero pricing content. The full pricing page exists at
     `/pricing`; where the surrounding copy already names a specific plan, `CheckoutButton` (used
     elsewhere on this same page) skips that extra stop entirely. */
  const pricingHref = ar ? "/ar/pricing" : "/pricing";
  const SAMPLE_RESUME = ar ? SAMPLE_RESUME_AR : SAMPLE_RESUME_EN;
  const SAMPLE_JD = ar ? SAMPLE_JD_AR : SAMPLE_JD_EN;

  return (
    <PageShell
      lang={ar ? "ar" : "en"}
      width="full"
      authNav={<AuthNav ar={ar} />}
      langToggle={ar ? "/optimize" : "/ar/optimize"}
    >
      <div className="mx-auto max-w-6xl">
        {/* Loading is handled inside the wizard (step view) below. */}
        {!result ? (
          <div className="mx-auto max-w-2xl">
            {/* Progress — one clear step at a time (research: "one screen = one decision"). */}
            {!loading && (
              <div className="mb-8">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-mono text-xs" style={{ color: "var(--faint)" }}>{ar ? `الخطوة ${toArabicDigits(step)} من ٣` : `Step ${step} of 3`}</div>
                  {step > 1 && <button onClick={() => setStep(step - 1)} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{ar ? "→ رجوع" : "← Back"}</button>}
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className="h-1.5 flex-1 rounded-full" style={{ background: s <= step ? "var(--accent)" : "var(--line)" }} />
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              /* Analyzing — live steps instead of an empty spinner. */
              <div className="card mx-auto max-w-2xl overflow-hidden" style={{ borderColor: "rgba(139,92,246,0.35)" }}>
                <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--line)", background: "rgba(139,92,246,0.05)" }}>
                  <BrandOrb variant="button" size={22} busy />
                  <span className="font-mono text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>{ar ? "جارٍ التحليل — مباشر" : "Analyzing — live"}</span>
                </div>
                <div className="px-5 py-4 font-mono text-xs leading-relaxed" style={{ color: "rgba(244,245,243,0.75)" }}>
                  {thinking.replace(/^ANALYSIS\s*/i, "") || (ar ? "نقرأ سيرتك…" : "Reading your resume…")}<span className="animate-pulse text-accent">▌</span>
                </div>
              </div>
            ) : step === 1 ? (
              /* ── Step 1: your resume ── */
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">{ar ? "أضف سيرتك" : "Add your resume"}</h1>
                <p className="mt-2 mb-5 text-sm" style={{ color: "var(--muted)" }}>{ar ? "ارفع ملفاً أو الصق النص. لن نغيّر أي كلمة بدون موافقتك." : "Upload a file or paste the text. We’ll never change a word without your approval."}</p>
                {/*
                  A third way in, above the other two: the CV this person already made here.
                  It also carries the two things a file cannot: the job they are targeting, and the
                  language they chose for the document. `outLang` is a DEFAULT here — step 3 shows it
                  as an explicit three-way choice before anything is generated.
                */}
                <MyCvPicker
                  ar={ar}
                  onPick={(cv) => {
                    setResume(cv.text);
                    setOutLang(cv.lang);
                    if (!jobDescription.trim() && cv.jobAdText.trim()) {
                      setJobDescription(cv.jobAdText);
                      if (cv.jobAdText.trim().length >= 30) setMode("target");
                    }
                  }}
                />
                <div className="mb-3 flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold"
                    style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid var(--line)" }}>
                    {uploading ? (ar ? "جارٍ القراءة…" : "Reading…") : uploadedName ? `${uploadedName.slice(0, ar ? 18 : 22)}` : (ar ? "↑ رفع PDF / Word" : "↑ Upload PDF / Word")}
                    <input type="file" accept=".pdf,.docx,.txt,.md" onChange={handleFile} className="hidden" disabled={uploading} />
                  </label>
                  {!resume && (
                    <button onClick={() => { setResume(SAMPLE_RESUME); setJobDescription(SAMPLE_JD); setMode("target"); }}
                      className="btn-ghost px-4 py-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>{ar ? "👀 جرّب نموذج" : "Try a sample"}</button>
                  )}
                </div>
                <textarea value={resume} onChange={(e) => setResume(e.target.value)}
                  placeholder={ar ? "الصق سيرتك هنا بأي لغة — الخبرات، التعليم، المهارات، معلومات التواصل…" : "Paste your resume here — work experience, education, skills, contact info…"}
                  rows={12} maxLength={8000}
                  className="w-full resize-y rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ ...inputStyle, minHeight: "11rem" }} />
                <p className="mt-2 font-mono text-xs" dir="ltr" style={{ color: resume.length > 7500 ? "#fbbf24" : "var(--faint)", textAlign: ar ? "right" : "left" }}>{resume.length}/8000</p>
                {extraction && uploadedName && (
                  <div className="mt-3 rounded-xl p-4" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid var(--line)" }}>
                    <div className="mb-2 text-sm font-bold" style={{ color: "var(--accent)" }}>{ar ? "هذا ما قرأناه — تحقّق منه" : "Here’s what we read — check it"}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" style={{ color: "var(--muted)" }}>
                      <div><span style={{ color: "var(--faint)" }}>{ar ? "الاسم" : "Name"}</span><br /><strong>{extraction.name}</strong></div>
                      <div><span style={{ color: "var(--faint)" }}>{ar ? "مدخلات مؤرَّخة" : "Dated entries"}</span><br /><strong>{ar ? toArabicDigits(extraction.expCount) : extraction.expCount}</strong></div>
                      <div><span style={{ color: "var(--faint)" }}>{ar ? "عناصر مهارات" : "Skill items"}</span><br /><strong>{ar ? toArabicDigits(extraction.skillsCount) : extraction.skillsCount}</strong></div>
                      <div><span style={{ color: "var(--faint)" }}>{ar ? "اللغة" : "Language"}</span><br /><strong>{extraction.lang === "ar" ? (ar ? "العربية" : "Arabic") : (ar ? "الإنجليزية" : "English")}</strong></div>
                    </div>
                    {extraction.looksScanned && <div className="mt-2 text-xs font-semibold" style={{ color: "#fbbf24" }}>{ar ? "⚠️ يبدو أنها صورة ممسوحة — قد تنقص بعض المعلومات. الصق النص لأفضل نتيجة." : "⚠️ Looks like a scanned image — some info may be missing. Paste the text for best results."}</div>}
                  </div>
                )}
                <button disabled={resume.trim().length < 50} onClick={() => setStep(2)}
                  className="btn-accent mt-5 w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-40">{ar ? "متابعة ←" : "Continue →"}</button>
                <p className="mt-3 text-center text-[11px]" style={{ color: "var(--faint)" }}>
                  {ar ? (
                    <>🔒 تُعالَج فوراً · لا تُخزَّن على خوادمنا —{" "}
                      <Link href="/ar/privacy" style={{ textDecoration: "underline" }}>كيف نعالج بياناتك</Link></>
                  ) : (
                    <>Processed by a cloud AI provider, then discarded — not stored on our servers.{" "}
                      <Link href="/privacy" style={{ textDecoration: "underline" }}>How we handle your data</Link></>
                  )}
                </p>
              </div>
            ) : step === 2 ? (
              /* ── Step 2: target job ── */
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">{ar ? "الوظيفة (اختياري)" : "Target a job (optional)"}</h1>
                <p className="mt-2 mb-5 text-sm" style={{ color: "var(--muted)" }}>{ar ? "أضف الإعلان لنفصّل السيرة عليه، أو تخطّاه لتحسين شامل." : "Add the posting and we tailor to it. Or skip for a general improvement."}</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} dir="ltr"
                    placeholder={ar ? "الصق رابط وظيفة (لينكدإن، بيت…) للاستيراد" : "Paste a job link (LinkedIn, Bayt…) to import"}
                    className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" }} />
                  <button type="button" onClick={importJobFromUrl} disabled={fetchingJob || !jobUrl.trim()}
                    className="btn-ghost shrink-0 px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ color: "var(--accent)" }}>{fetchingJob ? (ar ? "جارٍ الجلب…" : "Fetching…") : (ar ? "استيراد" : "Import")}</button>
                  <label className="btn-ghost shrink-0 cursor-pointer px-4 py-2 text-sm font-semibold" style={{ color: "var(--accent)", opacity: uploadingJd ? 0.6 : 1 }}>
                    {uploadingJd ? (ar ? "جارٍ القراءة…" : "Reading…") : (ar ? "أو ارفع ملف الإعلان" : "…or upload the posting")}
                    <input type="file" accept=".pdf,.docx,.txt,.md" onChange={handleJdFile} className="hidden" disabled={uploadingJd} />
                  </label>
                </div>
                {jobUrlMsg && <p className="mb-2 text-xs" style={{ color: jobUrlMsg.startsWith("✓") || jobUrlMsg.startsWith("تم") ? "var(--accent)" : "#fbbf24" }}>{jobUrlMsg}</p>}
                {jdFileMsg && <p className="mb-2 text-xs" style={{ color: "var(--accent)" }}>{jdFileMsg}</p>}
                <textarea value={jobDescription}
                  onChange={(e) => { const v = e.target.value; setJobDescription(v); if (v.trim().length >= 30) setMode("target"); else setMode("general"); }}
                  placeholder={ar ? "الصق إعلان الوظيفة هنا." : "…or paste the job description here."}
                  rows={10} maxLength={4000}
                  className="w-full resize-y rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ ...inputStyle, minHeight: "9rem" }} />
                {/* Employer + target country — optional context folded into the analysis, not a
                    second requirement to extract. See the note beside `jdWithContext` server-side. */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input value={employer} onChange={(e) => setEmployer(e.target.value.slice(0, 120))}
                    placeholder={ar ? "جهة التوظيف (اختياري)" : "Employer name (optional)"}
                    className="min-w-0 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" }} />
                  <input value={targetCountry} onChange={(e) => setTargetCountry(e.target.value.slice(0, 60))}
                    placeholder={ar ? "الدولة المستهدفة (اختياري)" : "Target country (optional)"}
                    className="min-w-0 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" }} />
                </div>
                <div className="mt-5 flex gap-2">
                  <button onClick={() => { setMode("general"); setStep(3); }} className="btn-ghost flex-1 py-3 text-sm font-semibold" style={{ color: "var(--fg)" }}>{ar ? "تخطّي" : "Skip"}</button>
                  <button onClick={() => setStep(3)} className="btn-accent flex-[2] py-3 text-base">{ar ? "متابعة ←" : "Continue →"}</button>
                </div>
              </div>
            ) : (
              /* ── Step 3: language + analyze ── */
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">{ar ? "لغة السيرة" : "Resume language"}</h1>
                <p className="mt-2 mb-5 text-sm" style={{ color: "var(--muted)" }}>{ar ? "بأي لغة تريد السيرة المحسّنة؟" : "What language should the improved resume be in?"}</p>
                <div className="mb-6 grid grid-cols-3 gap-2">
                  {(ar
                    ? [{ id: "ar", label: "العربية" }, { id: "en", label: "الإنجليزية" }, { id: "both", label: "الاثنتان" }]
                    : [{ id: "en", label: "English" }, { id: "ar", label: "العربية" }, { id: "both", label: "Both" }]
                  ).map((o) => (
                    <button key={o.id} onClick={() => setOutLang(o.id as "en" | "ar" | "both")}
                      className="rounded-xl py-3 text-sm font-semibold transition-all"
                      style={outLang === o.id ? { background: "var(--accent)", color: "#ffffff" } : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}>{o.label}</button>
                  ))}
                </div>
                {/* Template pick (optional) — choose the look upfront; changeable on the result too. */}
                <div className="mb-1 font-mono text-xs" style={{ color: "var(--faint)" }}>{ar ? "القالب (اختياري)" : "Template (optional)"}</div>
                <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
                  {TEMPLATE_CATALOG.map((tp) => (
                    <button key={tp.slug} onClick={() => setTplSlug(tp.slug)}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={tplSlug === tp.slug ? { background: "var(--accent)", color: "#ffffff" } : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}>
                      {ar ? tp.nameAr : tp.name}{tp.best ? " ★" : ""}
                    </button>
                  ))}
                </div>
                <div className="mb-4 rounded-xl p-4 text-sm" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.2)", color: "var(--muted)" }}>
                  <div className="mb-1 font-semibold" style={{ color: "var(--fg)" }}>{mode === "target" ? (ar ? "مخصّصة لإعلان الوظيفة" : "Tailored to your job posting") : (ar ? "تحسين شامل" : "General improvement")}</div>
                  {ar
                    ? <>مجاناً: درجة الملاءمة، الكلمات الناقصة، فجوة المهارات، معاينة. <span style={{ color: "var(--accent)" }}>السيرة الكاملة بعد الفتح.</span></>
                    : <>Free: match score, missing keywords, skills gap, preview. <span style={{ color: "var(--accent)" }}>Full rewrite unlocks after.</span></>}
                </div>
                {error && (
                  <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>
                    <div>{error}</div>
                    {resume.trim() && <button type="button" onClick={() => runScan()} className="mt-2 inline-block rounded-lg px-4 py-1.5 text-xs font-semibold" style={{ background: "rgba(139,92,246,0.15)", color: "var(--accent)", border: "1px solid rgba(139,92,246,0.4)" }}>{ar ? "↻ إعادة" : "↻ Retry"}</button>}
                  </div>
                )}
                <button onClick={() => runScan()} disabled={resume.trim().length < 50}
                  className="btn-accent w-full py-4 text-lg disabled:opacity-40">{ar ? "⚡ حلّل سيرتي مجاناً" : "⚡ Analyze my resume — free"}</button>
                <p className="mt-3 text-center font-mono text-xs" style={{ color: "var(--faint)" }}>{ar ? "~١٠ ثوانٍ ⚡" : "~10 seconds ⚡"}</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Score banner */}
            <div className="card mb-8 p-8 text-center" style={{ borderColor: `${scoreColor}55`, background: `${scoreColor}0d` }}>
              <div className="font-mono text-xs uppercase tracking-[0.2em]" style={{ color: "var(--faint)" }}>
                {mode === "target" ? (ar ? "درجة الملاءمة مع الوظيفة" : "Job-match score") : (ar ? "تقييم جودة السيرة" : "Overall resume score")}
              </div>
              <div className="mb-1 text-xs" style={{ color: "var(--faint)" }}>
                {mode === "target"
                  ? (ar ? "مدى قرب سيرتك من الإعلان — ليست ضماناً لاجتياز أي نظام توظيف" : "How closely your resume matches this posting — not a guarantee any ATS will pass it")
                  : (ar ? "تقييم عام لجودة السيرة (بلا وظيفة محددة) — بدّل إلى «تخصيص لوظيفة» لمطابقة إعلان" : "General quality review (no specific job) — switch to “Target a job” to match a posting")}
              </div>
              <div className="my-3 flex justify-center">
                <ScoreOrb value={displayScore} color={scoreColor} animate={false} size={150} />
              </div>
              <div className="mb-4 inline-block rounded-lg px-3 py-1 font-mono text-xs font-bold tracking-wider"
                style={{ background: `${scoreColor}1a`, color: scoreColor, border: `1px solid ${scoreColor}40` }}>
                {verdict}
              </div>
              <p className="mx-auto max-w-xl text-sm" style={{ color: "var(--muted)" }}>{result.matchSummary}</p>
              {/* Sub-metric breakdown — makes the single number legible. */}
              {(() => {
                const present = result.presentKeywords?.length ?? 0;
                const missing = result.missingKeywords?.length ?? 0;
                const kwCov = present + missing > 0 ? Math.round((present / (present + missing)) * 100) : null;
                const num = (n: number) => ar ? toArabicDigits(n) : String(n);
                const metrics = [
                  { label: ar ? "تغطية الكلمات" : "Keyword coverage", val: kwCov === null ? "—" : `${num(kwCov)}%`, hint: ar ? `${num(present)} موجودة · ${num(missing)} ناقصة` : `${present} present · ${missing} missing` },
                  { label: ar ? "فجوات المهارات" : "Skills gaps", val: num(result.skillsGap?.length ?? 0), hint: ar ? "تحتاج معالجة" : "to address" },
                  { label: ar ? "إصلاحات وُجدت" : "Fixes found", val: num(result.improvements?.length ?? 0), hint: ar ? "قابلة للتنفيذ" : "actionable" },
                ];
                return (
                  <div className="mx-auto mt-5 grid max-w-lg grid-cols-3 gap-2">
                    {metrics.map((m) => (
                      <div key={m.label} className="card px-2 py-3">
                        <div className="font-mono text-2xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>{m.val}</div>
                        <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--muted)" }}>{m.label}</div>
                        <div className="font-mono text-[10px]" style={{ color: "var(--faint)" }}>{m.hint}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <a href={`/score/${score}${ar ? "?lang=ar" : ""}`} target="_blank" rel="noopener noreferrer"
                className="mt-5 inline-block rounded-lg px-5 py-2 text-sm font-semibold"
                style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid var(--line)" }}>
                {ar ? "📣 شارك نتيجتي" : "📣 Share my score"}
              </a>
            </div>

            {/* Before/after proof — the value shown before the paywall */}
            {typeof result.afterScore === "number" && (
              <BeforeAfter before={score} after={result.afterScore} ar={ar} />
            )}

            {/* Improved-reveal + active coaching: teach the user what to add. */}
            <ResultCoaching
              before={score}
              after={result.afterScore ?? score}
              improvements={result.improvements || []}
              missingKeywords={result.missingKeywords || []}
              skillsGap={result.skillsGap || []}
              hasPlaceholders={/\[(add|أضف)[^\]]*\]/i.test(result.optimizedResume || "")}
              ar={ar}
            />

            {/* Interactive: ask the user for what's missing, then re-optimize. */}
            <GapFiller
              missingKeywords={result.missingKeywords || []}
              skillsGap={result.skillsGap || []}
              ar={ar}
              busy={loading}
              onApply={(additions) => { const enriched = resume + additions; setResume(enriched); runScan(enriched); }}
            />

            {/* Tabs + a visible way OUT of a stale result (it rehydrates on
                every visit — without this, returning users are stuck on it) */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {(["resume", "analysis"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="rounded-lg px-5 py-2 text-sm font-semibold transition-all"
                    style={tab === t
                      ? { background: "var(--accent)", color: "#ffffff" }
                      : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}>
                    {t === "resume" ? (ar ? "السيرة المحسّنة" : "Optimized resume") : (ar ? "التحليل الكامل" : "Full analysis")}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setResult(null); setCoverLetter(""); setCoverError(""); }}
                className="btn-ghost px-4 py-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>
                {ar ? "فحص جديد ←" : "← New scan"}
              </button>
            </div>

            {tab === "resume" && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">{ar ? "سيرتك المحسّنة" : "Your optimized resume"}</h2>
                  {!result.locked && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { navigator.clipboard.writeText(result.optimizedResume); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                        className="rounded-lg px-4 py-2 text-sm font-semibold"
                        style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid var(--line)" }}>
                        {copied ? (ar ? "نُسخت" : "Copied") : (ar ? "نسخ" : "Copy")}
                      </button>
                      <button
                        onClick={() => download("optimized-resume.txt", marked ? wmTxt(result.optimizedResume, ar) : result.optimizedResume)}
                        className="rounded-lg px-4 py-2 text-sm font-semibold"
                        style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid var(--line)" }}>
                        {ar ? "↓ نص" : "↓ .txt"}
                      </button>
                      {/* No `watermark` prop any more: the bytes come from `POST /api/export`, which
                          decides the mark from this request's own signed cookies. */}
                      <PdfExport text={result.optimizedResume} label={ar ? "↓ تنزيل PDF" : undefined} lang={ar ? "ar" : "en"} />
                      <DocxExport text={result.optimizedResume} label={ar ? "↓ تنزيل Word" : undefined} filename={ar ? "resume-ar.docx" : undefined} lang={ar ? "ar" : "en"} />
                      {/* Carries the resume across rather than just navigating. */}
                      <div className="w-full">
                        <button onClick={() => continueInBuilder()} className="btn-ghost px-5 py-2.5 text-sm font-semibold">
                          {ar ? "واصل التعديل في البناء ←" : "Keep editing in the builder →"}
                        </button>
                        {/*
                          What already exists, named. Adding is the default because it cannot lose
                          anything; replacing is one tap away and says WHICH CV it would replace.
                        */}
                        {inProgress.length > 0 && (
                          <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                            {ar ? (
                              <>هذا يفتح سيرة جديدة في البناء. لديك بالفعل{" "}
                                {inProgress.length === 1 ? "واحدة" : toArabicDigits(inProgress.length)}:{" "}</>
                            ) : (
                              <>This opens a new CV in the builder. You already have{" "}
                                {inProgress.length === 1 ? "one" : inProgress.length}:{" "}</>
                            )}
                            {inProgress.slice(0, 3).map((r, i) => (
                              <span key={r.resumeId}>
                                {i > 0 && (ar ? "، " : ", ")}
                                <button
                                  onClick={() => continueInBuilder(r.resumeId)}
                                  className="font-semibold underline underline-offset-2"
                                  style={{ color: "var(--accent)" }}
                                >
                                  {ar ? `استبدل «${r.title || "سيرة بلا عنوان"}»` : `replace “${r.title || "Untitled CV"}”`}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* Email my results — delivery + opt-in capture. */}
                {!result.locked && (
                  emailState === "sent" ? (
                    <div className="mb-4 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.35)", color: "var(--accent)" }}>{ar ? "أُرسلت — تفقّد بريدك." : "Sent — check your inbox."}</div>
                  ) : (
                    <div className="mb-4 flex flex-wrap gap-2">
                      <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} dir="ltr" placeholder="you@email.com"
                        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" }} />
                      <button type="button" onClick={emailResults} disabled={emailState === "sending" || !emailTo.trim()}
                        className="btn-ghost shrink-0 px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ color: "var(--accent)" }}>
                        {emailState === "sending" ? (ar ? "جارٍ الإرسال…" : "Sending…") : (ar ? "✉ أرسل نتيجتي بالبريد" : "✉ Email my results")}
                      </button>
                      {emailState === "error" && <p className="w-full text-xs" style={{ color: "#f87171" }}>{emailMsg}</p>}
                    </div>
                  )
                )}
                {/* Text (ATS-safe) vs a designed template — the market "buys
                    with the eye", so show the optimized resume both ways. */}
                {!result.locked && (
                  <div className="mb-3 flex gap-2">
                    {(["text", "designed"] as const).map((v) => (
                      <button key={v} onClick={() => setResumeView(v)}
                        className="rounded-lg px-4 py-2 text-sm font-semibold"
                        style={resumeView === v ? { background: "var(--accent)", color: "#ffffff" } : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}>
                        {v === "text" ? (ar ? "نص (ATS)" : "Text (ATS)") : (ar ? "قالب مصمّم" : "Designed template")}
                      </button>
                    ))}
                  </div>
                )}
                {!result.locked && resumeView === "designed" ? (
                  <div>
                    {/* Template picker — choose from the full catalogue, not one. */}
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                      {TEMPLATE_CATALOG.map((tp) => (
                        <button key={tp.slug} onClick={() => setTplSlug(tp.slug)}
                          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={tplSlug === tp.slug
                            ? { background: "var(--accent)", color: "#ffffff" }
                            : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}>
                          {ar ? tp.nameAr : tp.name}{tp.best ? " ★" : ""}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const tp = TEMPLATE_CATALOG.find((x) => x.slug === tplSlug) || TEMPLATE_CATALOG[0];
                      return <ResumeTemplate text={result.optimizedResume} name={ar ? "resume" : "optimized-resume"} variant={tp.variant} accent={tp.accent} watermark={marked} fitWidth />;
                    })()}
                  </div>
                ) : (
                  <div dir={ar ? "ltr" : undefined} className="card whitespace-pre-wrap p-6 font-mono text-sm leading-relaxed"
                    style={{ color: "rgba(244,245,243,0.85)", textAlign: ar ? "left" : undefined }}>
                    {result.optimizedResume}
                  </div>
                )}
                {marked && (
                  <div className="card mt-4 p-8 text-center" style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)" }}>
                    <div className="chip mb-3">{ar ? "سيرتك جاهزة — مجاناً" : "Your resume is ready — free"}</div>
                    <h3 className="text-xl font-bold">
                      {ar
                        ? (typeof result.afterScore === "number"
                          ? `حمّل نسخة نظيفة — ارفع نتيجتك من ${toArabicDigits(score)} إلى ${toArabicDigits(result.afterScore)} (متوقّعة).`
                          : "حمّل نسخة نظيفة بدون علامة مائية")
                        : (typeof result.afterScore === "number"
                          ? `Download a clean copy — turn your ${score} into a projected ${result.afterScore}.`
                          : "Download a clean, watermark-free version")}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--muted)" }}>
                      {ar
                        ? <>تنزيلك المجاني (PDF/Word) عليه علامة صغيرة «cv.rabit.sa». أزلها — وافتح خطاب التعريف ولينكدإن وتحضير المقابلة — بـ{formatPrice("single", "ar")} مرة واحدة، أو الحزمة الكاملة {formatPrice("complete", "ar")}. بدون اشتراك.</>
                        : <>Your free PDF/Word download carries a small “cv.rabit.sa” mark. Remove it — and unlock cover letters, LinkedIn &amp; interview prep — for a one-time {formatPrice("single", "en")}, or the {formatPrice("complete", "en")} Complete Pack. No subscription.</>}
                    </p>
                    <div className="mx-auto mt-5 max-w-xs space-y-3">
                      <CheckoutButton ar={ar} plan="single" label={ar ? `أزل العلامة — ${formatPrice("single", "ar")}` : `Remove watermark — ${formatPrice("single", "en")}`} variant="accent" />
                      <CheckoutButton ar={ar} plan="complete" label={ar ? `الحزمة الكاملة (${formatPrice("complete", "ar")})` : `Complete Pack (${formatPrice("complete", "en")})`} variant="ghost" />
                    </div>
                    <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>
                      <a href={ar ? "/ar/terms" : "/terms"} className="underline underline-offset-2">{ar ? "ضمان استرجاع خلال ٧ أيام" : "7-day money-back guarantee"}</a>
                    </p>
                  </div>
                )}

                {/* Cover letter generator */}
                <div className="card mt-6 p-6" style={{ borderColor: "rgba(139,92,246,0.25)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{ar ? "خطاب تعريف مطابق" : "Matching cover letter"}</h3>
                      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                        {marked
                          ? (ar ? "ضمن الحزمة الكاملة — افتح الوصول لإنشاء خطاب تعريف مخصص لهذه الوظيفة." : "Part of the Complete Pack — unlock to generate a tailored cover letter from this job.")
                          : jobDescription.trim().length < 30
                            ? (ar ? "اضغط «فحص جديد ←»، أضِف إعلان الوظيفة، ثم أعد الفحص لإنشاء خطاب تعريف مطابق." : "Click ‘← New scan’, add the job posting, then re-scan to generate a matching cover letter.")
                            : (ar ? "خطاب تعريف مفصّل على نفس إعلان الوظيفة." : "Generate a tailored cover letter from the same job post.")}
                      </p>
                    </div>
                    {marked ? (
                      /* The copy right above already says this is "part of the Complete Pack" —
                         so the button buys that plan directly rather than sending the visitor to
                         a separate page to say so again. `className` keeps it the same compact
                         pill every sibling button in this row uses, instead of CheckoutButton's
                         own default full-width block sizing. */
                      <CheckoutButton
                        ar={ar} plan="complete" label={ar ? "🔒 افتح الوصول لإنشائه" : "Unlock to generate"}
                        variant="accent" className="btn-accent px-5 py-2.5 text-sm"
                      />
                    ) : !coverLetter ? (
                      <button
                        onClick={generateCoverLetter}
                        disabled={coverLoading || jobDescription.trim().length < 30}
                        className="btn-accent px-5 py-2.5 text-sm disabled:opacity-50">
                        {coverLoading ? (ar ? "جارٍ الكتابة…" : "Writing…") : (ar ? "إنشاء خطاب التعريف" : "Generate cover letter")}
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(coverLetter); setCoverCopied(true); setTimeout(() => setCoverCopied(false), 1800); }}
                          className="rounded-lg px-4 py-2 text-sm font-semibold"
                          style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid var(--line)" }}>
                          {coverCopied ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ" : "Copy")}
                        </button>
                        <button
                          onClick={() => download("cover-letter.txt", coverLetter)}
                          className="rounded-lg px-4 py-2 text-sm font-semibold"
                          style={{ background: "var(--accent)", color: "#ffffff" }}>
                          {ar ? "↓ تنزيل" : "↓ Download"}
                        </button>
                      </div>
                    )}
                  </div>
                  {coverError && (
                    <div className="mt-3 rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>
                      {coverError}
                      {coverPaywalled && (
                        <Link href={pricingHref} className={ar ? "mr-2 font-semibold underline" : "ml-2 font-semibold underline"} style={{ color: "var(--accent)" }}>{ar ? "شاهد الباقات ←" : "See plans →"}</Link>
                      )}
                    </div>
                  )}
                  {coverLetter && (
                    <div dir={ar ? "ltr" : undefined} className="card mt-4 whitespace-pre-wrap p-5 text-sm leading-relaxed"
                      style={{ background: "rgba(255,255,255,0.02)", color: "rgba(244,245,243,0.85)", textAlign: ar ? "left" : undefined }}>
                      {coverLetter}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "analysis" && (
              <div>
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={() => {
                      const txt = ar
                        ? `نسبة التطابق: ${result.matchScore}/100\n${result.matchSummary}\n\n` +
                          `الكلمات الناقصة:\n${result.missingKeywords.join("، ")}\n\n` +
                          `الكلمات الموجودة:\n${result.presentKeywords.join("، ")}\n\n` +
                          `مهارات يُنصح بإبرازها:\n${result.skillsGap.join("، ")}\n\n` +
                          `التحسينات:\n${result.improvements.map((i) => `• ${i.area}: ${i.issue} ← ${i.fix}`).join("\n")}`
                        : `ATS MATCH SCORE: ${result.matchScore}/100\n${result.matchSummary}\n\n` +
                          `MISSING KEYWORDS:\n${result.missingKeywords.join(", ")}\n\n` +
                          `PRESENT KEYWORDS:\n${result.presentKeywords.join(", ")}\n\n` +
                          `SKILLS TO HIGHLIGHT:\n${result.skillsGap.join(", ")}\n\n` +
                          `IMPROVEMENTS:\n${result.improvements.map((i) => `• ${i.area}: ${i.issue} → ${i.fix}`).join("\n")}`;
                      navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800);
                    }}
                    className="rounded-lg px-4 py-2 text-sm font-semibold"
                    style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid var(--line)" }}>
                    {copied ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ التحليل" : "Copy analysis")}
                  </button>
                </div>
                {/*
                  Three groups, in the order the job's requirements were actually resolved into —
                  never two lists pretending to be the whole picture. Group 3 exists so a real gap
                  is SHOWN, not silently dropped or, worse, invented into the rewritten resume.
                */}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="card p-6" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
                    <h3 className="font-bold">{ar ? `مدعوم وموجود بالفعل (${toArabicDigits(result.presentKeywords.length)})` : `Supported and already included (${result.presentKeywords.length})`}</h3>
                    <p className="mb-4 mt-1 text-xs" style={{ color: "var(--faint)" }}>{ar ? "متطلبات الوظيفة التي تُظهر سيرتك دليلاً عليها بالفعل." : "Job requirements your resume already shows evidence for."}</p>
                    <div className="flex flex-wrap gap-2">
                      {result.presentKeywords.map((k) => (
                        <span key={k} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(139,92,246,0.14)", color: "var(--accent)" }}>{k}</span>
                      ))}
                    </div>
                  </div>

                  <div className="card p-6" style={{ borderColor: "rgba(248,113,113,0.2)" }}>
                    <h3 className="font-bold">{ar ? `مدعوم، لكنه ناقص في سيرتك (${toArabicDigits(result.missingKeywords.length)})` : `Supported, but missing from your CV (${result.missingKeywords.length})`}</h3>
                    <p className="mb-4 mt-1 text-xs" style={{ color: "var(--faint)" }}>{ar ? "الأرجح أن لديك هذا — لكنك لم تكتبه بكلمات الوظيفة نفسها." : "You likely have this, but didn't state it in the job posting's own words."}</p>
                    <div className="flex flex-wrap gap-2">
                      {result.missingKeywords.map((k) => (
                        <span key={k} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(248,113,113,0.14)", color: "#f87171" }}>{k}</span>
                      ))}
                    </div>
                  </div>

                  <div className="card p-6" style={{ borderColor: "rgba(251,191,36,0.2)" }}>
                    <h3 className="font-bold">{ar ? `غير مدعوم بأدلتك (${toArabicDigits(result.skillsGap.length)})` : `Not supported by your evidence (${result.skillsGap.length})`}</h3>
                    <p className="mb-4 mt-1 text-xs" style={{ color: "var(--faint)" }}>{ar ? "لا يوجد دليل في سيرتك على هذا — لن يُضاف تلقائياً؛ إن كان صحيحاً فأضِفه بنفسك." : "Your resume shows no evidence of this — never added automatically. If it's true, add it yourself."}</p>
                    <ul className="space-y-2">
                      {result.skillsGap.map((s) => (
                        <li key={s} className="flex items-center gap-2 text-sm" style={{ color: "#fbbf24" }}><span>{ar ? "←" : "→"}</span> {s}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="card p-6" style={{ borderColor: "rgba(139,92,246,0.15)" }}>
                    <h3 className="mb-4 font-bold">{ar ? "التحسينات التي أُجريت" : "Improvements made"}</h3>
                    <ul className="space-y-4">
                      {result.improvements.map((imp) => {
                        // The trust differentiator: every edit is labelled with its
                        // honesty class so nothing feels invented behind your back.
                        const B: Record<string, { t: string; c: string; bg: string }> = ar ? {
                          "rephrase": { t: "إعادة صياغة فقط", c: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
                          "from-your-data": { t: "من بياناتك", c: "#86efac", bg: "rgba(134,239,172,0.12)" },
                          "needs-confirmation": { t: "⚠ تأكّد أنها صحيحة", c: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
                          "missing-requirement": { t: "ناقصة — أضفها", c: "#f87171", bg: "rgba(248,113,113,0.12)" },
                        } : {
                          "rephrase": { t: "Rephrased only", c: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
                          "from-your-data": { t: "From your data", c: "#86efac", bg: "rgba(134,239,172,0.12)" },
                          "needs-confirmation": { t: "⚠ Confirm this is true", c: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
                          "missing-requirement": { t: "Missing — you must add", c: "#f87171", bg: "rgba(248,113,113,0.12)" },
                        };
                        const b = B[imp.source || "rephrase"] || B.rephrase;
                        return (
                          <li key={imp.area}>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-accent">{imp.area}</span>
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: b.c, background: b.bg, border: `1px solid ${b.c}40` }}>{b.t}</span>
                            </div>
                            <div className="mb-1 text-xs" style={{ color: "var(--faint)" }}>{imp.issue}</div>
                            <div className="text-xs" style={{ color: "#86efac" }}>{imp.fix}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom CTA */}
            <div className="card mt-10 p-8 text-center" style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)" }}>
              <h3 className="text-2xl font-bold">{ar ? "تقدّم على أكثر من وظيفة؟" : "Applying to more than one job?"}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--muted)" }}>
                {ar
                  ? `الحزمة الكاملة بـ ${formatPrice("complete", "ar")} دفعة واحدة — خطاب تعريف ولينكدإن وتحضير مقابلة، بدون اشتراك.`
                  : `Get the Complete Pack — ${formatPrice("complete", "en")} once, no subscription: cover letters, LinkedIn, and interview prep included.`}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <CheckoutButton
                  ar={ar} plan="complete"
                  label={ar ? "اشترك الآن ←" : `Get the Complete Pack — ${formatPrice("complete", "en")} →`}
                  variant="accent" className="btn-accent px-8 py-3"
                />
                <button
                  onClick={() => {
                    setResult(null); setResume(""); setJobDescription(""); setCoverLetter("");
                    setCoverError(""); setUploadedName(""); setMode("general");
                    removePersonal(owner, "ra_optimize_draft");
                  }}
                  className="btn-ghost px-8 py-3 font-semibold" style={{ color: "var(--fg)" }}>
                  {ar ? "حسّن سيرة أخرى" : "Optimize another"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
