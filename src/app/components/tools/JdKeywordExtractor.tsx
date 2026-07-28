"use client";
import { useState } from "react";
import Link from "next/link";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import MobileMenu from "@/app/components/MobileMenu";
import { navCta } from "@/app/lib/brand";

interface KeywordResult {
  hardSkills: string[];
  tools: string[];
  certifications: string[];
  softSkills: string[];
  mustHave: string[];
}

const inputStyle = { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" };

const SECTIONS: Array<{ key: keyof KeywordResult; en: string; ar: string; pillBg: string; pillFg: string }> = [
  { key: "mustHave", en: "Must-have (highest priority)", ar: "الأهم (أولوية عالية)", pillBg: "rgba(251,191,36,0.14)", pillFg: "#fbbf24" },
  { key: "hardSkills", en: "Hard skills", ar: "المهارات التقنية", pillBg: "rgba(139,92,246,0.14)", pillFg: "var(--accent)" },
  { key: "tools", en: "Tools & systems", ar: "الأدوات والأنظمة", pillBg: "rgba(139,92,246,0.14)", pillFg: "var(--accent)" },
  { key: "certifications", en: "Certifications", ar: "الشهادات", pillBg: "rgba(52,211,153,0.14)", pillFg: "#34d399" },
  { key: "softSkills", en: "Soft skills", ar: "المهارات الشخصية", pillBg: "rgba(148,163,184,0.14)", pillFg: "var(--muted)" },
];

export default function JdKeywordExtractor({ defaultAr }: { defaultAr: boolean }) {
  const ar = defaultAr;
  const [jd, setJd] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KeywordResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "jd-keywords", inputA: jd, inputB: roleTitle, lang: ar ? "ar" : "en" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const hardSkills: string[] = Array.isArray(data.hardSkills) ? data.hardSkills : [];
      const tools: string[] = Array.isArray(data.tools) ? data.tools : [];
      if (!hardSkills.length && !tools.length) throw new Error("Couldn't extract keywords this time — please try again.");
      setResult({
        hardSkills,
        tools,
        certifications: Array.isArray(data.certifications) ? data.certifications : [],
        softSkills: Array.isArray(data.softSkills) ? data.softSkills : [],
        mustHave: Array.isArray(data.mustHave) ? data.mustHave : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    if (!result) return;
    const all = Array.from(new Set([...result.mustHave, ...result.hardSkills, ...result.tools, ...result.certifications, ...result.softSkills]));
    navigator.clipboard.writeText(all.join(", "));
    setCopied("all");
    setTimeout(() => setCopied(""), 1800);
  }

  return (
    <PageShell lang={ar ? "ar" : "en"} cta={navCta(ar ? "ar" : "en")} authNav={<AuthNav ar={ar} />} mobileMenu={<MobileMenu ar={ar} />}>
      <div className="mx-auto max-w-2xl py-12">
        <div className="mb-8 text-center">
          <div className="chip mb-4">{ar ? "مستخرج كلمات الإعلان الوظيفي" : "Job Description Keyword Extractor"}</div>
          <h1 className="text-4xl font-extrabold tracking-tight">{ar ? "اعرف كلمات الإعلان قبل أن تكتب سيرتك" : "Know the job's keywords before you write your CV"}</h1>
          <p className="mt-3" style={{ color: "var(--muted)" }}>
            {ar ? "الصق أي إعلان وظيفي — نستخرج المهارات والأدوات والشهادات التي يبحث عنها نظام الفرز الآلي، مرتبة حسب الأولوية." : "Paste any job posting — get the skills, tools, and certifications an ATS scans for, ranked by priority."}
          </p>
        </div>

        {!result ? (
          <form onSubmit={run} className="card space-y-4 p-7">
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "نص الإعلان الوظيفي" : "Job description text"}</label>
              <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={10} required
                placeholder={ar ? "الصق نص الإعلان الوظيفي كاملاً…" : "Paste the full job posting text…"}
                className="w-full resize-none rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "المسمى الوظيفي (اختياري)" : "Role title (optional)"}</label>
              <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}
                placeholder={ar ? "مثال: محلل بيانات" : "e.g. Data Analyst"} className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            {error && <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>{error}</div>}
            <button type="submit" disabled={loading} className="btn-accent w-full py-3 disabled:opacity-50">
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  {ar ? "جارٍ الاستخراج…" : "Extracting…"}
                </span>
              ) : (ar ? "استخرج الكلمات المفتاحية" : "Extract keywords")}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="flex justify-end">
              <button onClick={copyAll} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied === "all" ? (ar ? "نُسخ الكل" : "Copied all") : (ar ? "نسخ الكل" : "Copy all")}</button>
            </div>
            {SECTIONS.map(({ key, en, ar: arLabel, pillBg, pillFg }) => {
              const items = result[key];
              if (!items.length) return null;
              return (
                <div key={key} className="card p-6">
                  <h3 className="mb-3 font-bold">{ar ? arLabel : en}</h3>
                  <div className="flex flex-wrap gap-2">
                    {items.map((it, i) => (
                      <span key={`${key}-${i}`} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: pillBg, color: pillFg }}>{it}</span>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="card p-6" style={{ borderColor: "rgba(139,92,246,0.25)" }}>
              <h3 className="mb-2 font-bold">{ar ? "الخطوة التالية" : "Next step"}</h3>
              <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                {ar ? "قارن هذه القائمة بسيرتك الحالية، أو ابنِ سيرة جديدة تتضمنها من البداية." : "Compare this list against your current CV, or build a new one that includes them from the start."}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={ar ? "/ar/optimize" : "/optimize"} className="btn-accent inline-block px-5 py-2.5 text-sm">{ar ? "قارن سيرتي بهذا الإعلان" : "Compare my CV to this posting"}</Link>
                <Link href={ar ? "/ar/builder" : "/builder"} className="inline-block rounded-lg px-5 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)", color: "var(--muted)" }}>{ar ? "ابنِ سيرة جديدة" : "Build a new resume"}</Link>
              </div>
            </div>
            <button onClick={() => setResult(null)} className="mx-auto block text-sm" style={{ color: "var(--faint)" }}>{ar ? "استخراج من إعلان آخر" : "Extract from another posting"}</button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
