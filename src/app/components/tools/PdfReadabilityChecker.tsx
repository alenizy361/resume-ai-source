"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import MobileMenu from "@/app/components/MobileMenu";
import { navCta } from "@/app/lib/brand";

/**
 * Same `defaultAr` pattern `/optimize` uses: the language is fixed by which route rendered this
 * component, not resolved client-side, so the server render and the very first client render agree
 * and nothing flashes on load.
 */

type Verdict = "readable" | "partial" | "unreadable";

interface Report {
  verdict: Verdict;
  chars: number;
  words: number;
  hasLineBreaks: boolean;
  preview: string;
  serverError?: string;
}

function buildReport(text: string | null, serverError?: string): Report {
  if (!text) {
    return { verdict: "unreadable", chars: 0, words: 0, hasLineBreaks: false, preview: "", serverError };
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  const hasLineBreaks = text.includes("\n");
  // Mirrors the same signal /api/extract already logs server-side (F-history: the mergePages bug)
  // — a document long enough to have structure but returned as one line is a parsing failure the
  // file itself caused, not this checker inventing a new rule.
  const flattened = text.length > 200 && !hasLineBreaks;
  const thin = words < 40;
  const verdict: Verdict = flattened || thin ? "partial" : "readable";
  return { verdict, chars: text.length, words, hasLineBreaks, preview: text.slice(0, 600), serverError };
}

const inputStyle = { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" };

export default function PdfReadabilityChecker({ defaultAr }: { defaultAr: boolean }) {
  const ar = defaultAr;
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    setReport(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setReport(buildReport(null, data.error || "Couldn't read this file."));
        return;
      }
      setReport(buildReport(String(data.text || "")));
    } catch {
      setError(ar ? "حدث خطأ أثناء قراءة الملف." : "Something went wrong reading the file.");
    } finally {
      setLoading(false);
    }
  }

  const verdictCopy: Record<Verdict, { label: string; color: string; body: string }> = {
    readable: {
      label: ar ? "قابل للقراءة" : "Readable",
      color: "#34d399",
      body: ar
        ? "استخرجنا نصاً كاملاً ومنظماً بفواصل أسطر واضحة. أنظمة تتبع المتقدمين تقرأ هذا الملف كما تقرأه أنت تقريباً."
        : "We extracted full, structured text with clear line breaks. An applicant tracking system will read this file close to the way you do.",
    },
    partial: {
      label: ar ? "قابل للقراءة جزئياً" : "Partially readable",
      color: "#fbbf24",
      body: ar
        ? "استخرجنا نصاً، لكنه إما قصير جداً أو بلا فواصل أسطر — علامة على أن الملف مصمم بجداول أو مربعات نصية أو تخطيط معقد يربك أنظمة الفرز الآلي."
        : "We extracted text, but it's either very short or has no line breaks — a sign the file uses tables, text boxes, or a layout complex enough to confuse automated screening.",
    },
    unreadable: {
      label: ar ? "غير قابل للقراءة" : "Not readable",
      color: "#f87171",
      body: ar
        ? "لم نتمكن من استخراج أي نص من هذا الملف. غالباً لأنه صورة ممسوحة ضوئياً وليس نصاً حقيقياً — وهذا يعني أن أنظمة تتبع المتقدمين لن تقرأه إطلاقاً."
        : "We couldn't extract any text from this file. It's most likely a scanned image rather than real text — which means an applicant tracking system won't read it at all.",
    },
  };

  return (
    <PageShell lang={ar ? "ar" : "en"} cta={navCta(ar ? "ar" : "en")} authNav={<AuthNav ar={ar} />} mobileMenu={<MobileMenu ar={ar} />}>
      <div className="mx-auto max-w-2xl py-12">
        <div className="mb-8 text-center">
          <div className="chip mb-4">{ar ? "فحص قابلية قراءة PDF" : "PDF Readability Checker"}</div>
          <h1 className="text-4xl font-extrabold tracking-tight">{ar ? "هل تقدر أنظمة الفرز قراءة سيرتك؟" : "Can ATS software actually read your resume?"}</h1>
          <p className="mt-3" style={{ color: "var(--muted)" }}>
            {ar ? "ارفع ملف PDF أو Word — نستخرج نصه بنفس الطريقة التي تستخدمها أنظمة تتبع المتقدمين، ونخبرك إن كان قابلاً للقراءة." : "Upload a PDF or Word file — we extract its text the same way applicant tracking systems do, and tell you if it's actually readable."}
          </p>
        </div>

        <div className="card space-y-4 p-7">
          <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={loading}
            className="btn-accent w-full py-3 disabled:opacity-50">
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                {ar ? "جارٍ الفحص…" : "Checking…"}
              </span>
            ) : (ar ? "ارفع ملفك (PDF أو Word)" : "Upload your file (PDF or Word)")}
          </button>
          {fileName && !loading && <p className="text-center text-xs" style={{ color: "var(--faint)" }}>{fileName}</p>}
          {error && <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>{error}</div>}
          <p className="text-center text-xs" style={{ color: "var(--faint)" }}>
            {ar ? "لا يُحفظ ملفك ولا يُرسل لأي طرف ثالث — يُستخرج نصه فقط ليُعرض عليك." : "Your file isn't stored or sent to any third party — only its text is extracted, to show you."}
          </p>
        </div>

        {report && (
          <div className="mt-6 space-y-5">
            <div className="card p-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: verdictCopy[report.verdict].color }} />
                <h3 className="font-bold">{verdictCopy[report.verdict].label}</h3>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{verdictCopy[report.verdict].body}</p>
              {report.serverError && report.verdict === "unreadable" && (
                <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{report.serverError}</p>
              )}
              {report.chars > 0 && (
                <div className="mt-4 flex gap-6 text-xs" style={{ color: "var(--faint)" }}>
                  <span>{ar ? `${report.words} كلمة مستخرَجة` : `${report.words} words extracted`}</span>
                  <span>{report.hasLineBreaks ? (ar ? "فواصل الأسطر محفوظة" : "line breaks preserved") : (ar ? "بلا فواصل أسطر" : "no line breaks")}</span>
                </div>
              )}
            </div>
            {report.preview && (
              <div className="card p-6">
                <h3 className="mb-3 font-bold">{ar ? "معاينة النص المستخرَج" : "Extracted text preview"}</h3>
                <p dir={ar ? "auto" : "ltr"} className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg px-3 py-2.5 text-xs leading-relaxed" style={{ ...inputStyle, color: "var(--muted)" }}>{report.preview}{report.chars > 600 ? "…" : ""}</p>
              </div>
            )}
            <div className="card p-6" style={{ borderColor: "rgba(139,92,246,0.25)" }}>
              <h3 className="mb-2 font-bold">{ar ? "الخطوة التالية" : "Next step"}</h3>
              <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                {ar ? "بدل إصلاح ملف صعب القراءة، ابنِ نسخة جديدة بقالب متوافق مع أنظمة الفرز من البداية." : "Instead of fixing a hard-to-parse file, build a fresh version in an ATS-safe template from the start."}
              </p>
              <Link href={ar ? "/ar/builder" : "/builder"} className="btn-accent inline-block px-5 py-2.5 text-sm">
                {ar ? "ابنِ سيرة جديدة" : "Build a new resume"}
              </Link>
            </div>
            <button onClick={() => { setReport(null); setFileName(""); }} className="mx-auto block text-sm" style={{ color: "var(--faint)" }}>{ar ? "فحص ملف آخر" : "Check another file"}</button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
