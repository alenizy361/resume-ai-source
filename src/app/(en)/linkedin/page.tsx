"use client";
import { useState } from "react";
import useLang from "@/app/components/useLang";
import MyCvPicker from "@/app/components/MyCvPicker";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import MobileMenu from "@/app/components/MobileMenu";
import { navCta } from "@/app/lib/brand";
import { type MyCv, outLangFor } from "@/app/lib/myCvs";

interface LinkedInExperience {
  role: string;
  description: string;
}

interface LinkedInResult {
  headlineOptions: string[];
  about: string;
  experience: LinkedInExperience[];
  skills: string[];
  keywords: string[];
  tips: string[];
}

const inputStyle = { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" };

export default function LinkedInPage() {
  const ar = useLang();
  const [profile, setProfile] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LinkedInResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  /** The CV the user picked from their own — the only source that declares its own language. */
  const [picked, setPicked] = useState<MyCv | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* Was a hardcoded `"en"`. A LinkedIn headline is published text, so it follows the CV's
           language — the same rule the resume itself follows. See `outLangFor`. */
        body: JSON.stringify({
          mode: "linkedin", inputA: profile, inputB: targetRole,
          lang: outLangFor(picked, profile, ar),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const headlineOptions: string[] = Array.isArray(data.headlineOptions) ? data.headlineOptions : [];
      if (!headlineOptions.length && !data.about) throw new Error("Couldn't optimize this time — please try again.");
      setResult({
        headlineOptions,
        about: data.about || "",
        experience: Array.isArray(data.experience) ? data.experience : [],
        skills: Array.isArray(data.skills) ? data.skills : [],
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        tips: Array.isArray(data.tips) ? data.tips : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function copy(what: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1800);
  }

  return (
    <PageShell lang={ar ? "ar" : "en"} cta={navCta(ar ? "ar" : "en")} langToggle={ar ? "/linkedin" : "/ar/linkedin"} authNav={<AuthNav ar={ar} />} mobileMenu={<MobileMenu ar={ar} />}>
      <div className="mx-auto max-w-2xl py-12">
        <div className="mb-8 text-center">
          <div className="chip mb-4">{ar ? "محسّن لينكدإن" : "LinkedIn Optimizer"}</div>
          <h1 className="text-4xl font-extrabold tracking-tight">{ar ? "ليجدك مسؤولو التوظيف" : "Get found by recruiters"}</h1>
          <p className="mt-3" style={{ color: "var(--muted)" }}>
            {ar ? "الصق سيرتك أو نص لينكدإن الحالي — واحصل على عنوان غني بالكلمات المفتاحية، وقسم «نبذة»، وقائمة مهارات مضبوطة لبحث مسؤولي التوظيف." : "Paste your resume or current LinkedIn text — get a keyword-rich headline, About section, and skills list tuned for recruiter search."}
          </p>
        </div>

        {!result ? (
          <form onSubmit={run} className="card space-y-4 p-7">
            {/* The target role comes across only when this page's own field is still empty — the
                user's typing outranks a default taken from their draft. */}
            <MyCvPicker
              ar={ar}
              onPick={(cv) => {
                setPicked(cv);
                setProfile(cv.text);
                if (!targetRole.trim() && cv.targetTitle.trim()) setTargetRole(cv.targetTitle);
              }}
            />
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "سيرتك أو نص ملف لينكدإن الحالي" : "Your resume or current LinkedIn profile text"}</label>
              <textarea value={profile} onChange={(e) => setProfile(e.target.value)} rows={10} required
                placeholder={ar ? "الصق سيرتك أو العنوان والنبذة والخبرة الحالية…" : "Paste your resume or your current LinkedIn headline + about + experience..."}
                className="w-full resize-none rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "الدور المستهدف" : "Target role"}</label>
              <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} required
                placeholder={ar ? "مثال: مدير منتج" : "e.g. Product Manager"} className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            {error && <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>{error}</div>}
            <button type="submit" disabled={loading} className="btn-accent w-full py-3 disabled:opacity-50">
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  {ar ? "جارٍ تحسين ملفك…" : "Optimizing your profile…"}
                </span>
              ) : (ar ? "حسّن لينكدإن" : "Optimize my LinkedIn")}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {result.headlineOptions.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-3 font-bold">{ar ? "خيارات العنوان" : "Headline options"}</h3>
                <div className="space-y-3">
                  {result.headlineOptions.map((h, i) => (
                    <div key={`h-${i}`} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                      <p className="text-sm leading-relaxed" style={{ color: "rgba(244,245,243,0.85)" }}>{h}</p>
                      <button onClick={() => copy(`h${i}`, h)} className="shrink-0 text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied === `h${i}` ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">{ar ? "قسم النبذة" : "About section"}</h3>
                <button onClick={() => copy("a", result.about)} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied === "a" ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "rgba(244,245,243,0.85)" }}>{result.about}</p>
            </div>
            {result.experience.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-3 font-bold">{ar ? "أوصاف الخبرة" : "Experience descriptions"}</h3>
                <div className="space-y-4">
                  {result.experience.map((exp, i) => (
                    <div key={`exp-${i}`} className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <h4 className="text-xs font-semibold" style={{ color: "var(--faint)" }}>{exp.role}</h4>
                        <button onClick={() => copy(`exp${i}`, exp.description)} className="shrink-0 text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied === `exp${i}` ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</button>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "rgba(244,245,243,0.85)" }}>{exp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">{ar ? "المهارات المطلوب إدراجها (بهذا الترتيب)" : "Skills to list (in this order)"}</h3>
                <button onClick={() => copy("s", result.skills.join(", "))} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied === "s" ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.skills.map((s, i) => (
                  <span key={`${s}-${i}`} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(139,92,246,0.14)", color: "var(--accent)" }}>{s}</span>
                ))}
              </div>
            </div>
            {result.keywords.length > 0 && (
              <div className="card p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold">{ar ? "كلمات مفتاحية مقترحة للملف" : "Profile keyword suggestions"}</h3>
                  <button onClick={() => copy("k", result.keywords.join(", "))} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied === "k" ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</button>
                </div>
                <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>{ar ? "استخدمها ضمن العنوان أو النبذة أو الخبرة — وليست قائمة للصقها كما هي." : "Weave these into your headline, About, or experience text — not a list to paste as-is."}</p>
                <div className="flex flex-wrap gap-2">
                  {result.keywords.map((k, i) => (
                    <span key={`${k}-${i}`} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(251,191,36,0.14)", color: "#fbbf24" }}>{k}</span>
                  ))}
                </div>
              </div>
            )}
            {result.tips?.length > 0 && (
              <div className="card p-6" style={{ borderColor: "rgba(251,191,36,0.25)" }}>
                <h3 className="mb-3 font-bold">{ar ? "نصائح للملف" : "Profile tips"}</h3>
                <ul className="space-y-2">
                  {result.tips.map((t, i) => (
                    <li key={`${t}-${i}`} className="flex gap-2 text-sm" style={{ color: "var(--muted)" }}><span style={{ color: "#fbbf24" }}>→</span> {t}</li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={() => setResult(null)} className="mx-auto block text-sm" style={{ color: "var(--faint)" }}>{ar ? "تحسين مرة أخرى" : "Optimize again"}</button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
