"use client";
import { useState } from "react";
import useLang from "@/app/components/useLang";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import MobileMenu from "@/app/components/MobileMenu";
import MyCvPicker from "@/app/components/MyCvPicker";
import { navCta } from "@/app/lib/brand";

interface CareerPlanResult {
  transferableSkills: string[];
  missingSkills: string[];
  missingCredentials: string[];
  recommendedExperience: string[];
  learningAreas: string[];
  cvChanges: string[];
  interviewPrepAreas: string[];
}

const TIMELINES_EN = ["3 months", "6 months", "1 year", "2+ years"];
const TIMELINES_AR = ["3 أشهر", "6 أشهر", "سنة واحدة", "سنتان فأكثر"];

const inputStyle = { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" };

const SECTIONS: Array<{ key: keyof CareerPlanResult; en: string; ar: string }> = [
  { key: "transferableSkills", en: "Transferable skills", ar: "المهارات القابلة للنقل" },
  { key: "missingSkills", en: "Missing skills", ar: "المهارات الناقصة" },
  { key: "missingCredentials", en: "Missing credentials", ar: "المؤهلات الناقصة" },
  { key: "recommendedExperience", en: "Recommended experience", ar: "الخبرة الموصى باكتسابها" },
  { key: "learningAreas", en: "Suggested learning areas", ar: "مجالات التعلم المقترحة" },
  { key: "cvChanges", en: "CV changes to make", ar: "تعديلات على سيرتك الذاتية" },
  { key: "interviewPrepAreas", en: "Interview preparation areas", ar: "محاور التحضير للمقابلة" },
];

export default function CareerPlanPage() {
  const ar = useLang();
  const [currentRole, setCurrentRole] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [country, setCountry] = useState("");
  const [timeline, setTimeline] = useState(ar ? TIMELINES_AR[1] : TIMELINES_EN[1]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CareerPlanResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const context = [
        `${ar ? "الدور الحالي" : "Current role"}: ${currentRole.trim()}`,
        `${ar ? "الدور المستهدف" : "Target role"}: ${targetRole.trim()}`,
        country.trim() ? `${ar ? "الدولة" : "Country"}: ${country.trim()}` : "",
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "career-plan", inputA: context, inputB: timeline, lang: ar ? "ar" : "en" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (!data.transferableSkills?.length && !data.missingSkills?.length) throw new Error("Couldn't build a plan this time — please try again.");
      setResult({
        transferableSkills: Array.isArray(data.transferableSkills) ? data.transferableSkills : [],
        missingSkills: Array.isArray(data.missingSkills) ? data.missingSkills : [],
        missingCredentials: Array.isArray(data.missingCredentials) ? data.missingCredentials : [],
        recommendedExperience: Array.isArray(data.recommendedExperience) ? data.recommendedExperience : [],
        learningAreas: Array.isArray(data.learningAreas) ? data.learningAreas : [],
        cvChanges: Array.isArray(data.cvChanges) ? data.cvChanges : [],
        interviewPrepAreas: Array.isArray(data.interviewPrepAreas) ? data.interviewPrepAreas : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function copy(what: string, items: string[]) {
    navigator.clipboard.writeText(items.map((i) => `- ${i}`).join("\n"));
    setCopied(what);
    setTimeout(() => setCopied(""), 1800);
  }

  const timelines = ar ? TIMELINES_AR : TIMELINES_EN;

  return (
    <PageShell lang={ar ? "ar" : "en"} cta={navCta(ar ? "ar" : "en")} langToggle={ar ? "/career-plan" : "/ar/career-plan"} authNav={<AuthNav ar={ar} />} mobileMenu={<MobileMenu ar={ar} />}>
      <div className="mx-auto max-w-2xl py-12">
        <div className="mb-8 text-center">
          <div className="chip mb-4">{ar ? "خطة مسيرتك المهنية" : "Career Plan"}</div>
          <h1 className="text-4xl font-extrabold tracking-tight">{ar ? "من دورك الحالي إلى هدفك المهني" : "From your current role to your target role"}</h1>
          <p className="mt-3" style={{ color: "var(--muted)" }}>
            {ar ? "قارن بين دورك الحالي والدور الذي تطمح إليه — واحصل على خطة واقعية: المهارات القابلة للنقل، الفجوات، والخطوات التالية." : "Compare your current role to where you want to go — get a realistic plan: transferable skills, real gaps, and concrete next steps."}
          </p>
        </div>

        {!result ? (
          <form onSubmit={run} className="card space-y-4 p-7">
            <MyCvPicker
              ar={ar}
              onPick={(cv) => {
                if (!currentRole.trim() && cv.targetTitle.trim()) setCurrentRole(cv.targetTitle);
              }}
            />
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "دورك الحالي" : "Current role"}</label>
              <input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} required
                placeholder={ar ? "مثال: محاسب" : "e.g. Accountant"} className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "الدور المستهدف" : "Target role"}</label>
              <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} required
                placeholder={ar ? "مثال: مدير مالي" : "e.g. Finance Manager"} className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "الدولة (اختياري)" : "Country (optional)"}</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)}
                placeholder={ar ? "مثال: السعودية" : "e.g. Saudi Arabia"} className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "الجدول الزمني" : "Timeline"}</label>
              <select value={timeline} onChange={(e) => setTimeline(e.target.value)} className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle}>
                {timelines.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {error && <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>{error}</div>}
            <button type="submit" disabled={loading} className="btn-accent w-full py-3 disabled:opacity-50">
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  {ar ? "جارٍ بناء خطتك…" : "Building your plan…"}
                </span>
              ) : (ar ? "ابنِ خطتي" : "Build my plan")}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {SECTIONS.map(({ key, en, ar: arLabel }) => {
              const items = result[key];
              if (!items.length) return null;
              return (
                <div key={key} className="card p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-bold">{ar ? arLabel : en}</h3>
                    <button onClick={() => copy(key, items)} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied === key ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</button>
                  </div>
                  <ul className="space-y-2">
                    {items.map((it, i) => (
                      <li key={`${key}-${i}`} className="flex gap-2 text-sm" style={{ color: "var(--muted)" }}><span style={{ color: "var(--accent)" }}>→</span> {it}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <button onClick={() => setResult(null)} className="mx-auto block text-sm" style={{ color: "var(--faint)" }}>{ar ? "بناء خطة أخرى" : "Build another plan"}</button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
