"use client";
import { useState } from "react";
import Link from "next/link";
import useLang from "@/app/components/useLang";
import MyCvPicker from "@/app/components/MyCvPicker";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import MobileMenu from "@/app/components/MobileMenu";
import { navCta } from "@/app/lib/brand";
import { type MyCv, outLangFor } from "@/app/lib/myCvs";

type Category = "behavioral" | "technical" | "gap";
interface InterviewResult {
  questions: { q: string; why: string; answer: string; category: Category }[];
  redFlags: string[];
}
interface FeedbackResult {
  strength: string; weaknesses: string[]; missingEvidence: string[]; revisedOpening: string;
}
/** The four fields a STAR answer is built from. Assembled into one paragraph, never sent
    anywhere until the candidate asks for feedback on it. */
interface StarDraft { situation: string; task: string; action: string; result: string }
const EMPTY_STAR: StarDraft = { situation: "", task: "", action: "", result: "" };
const starText = (d: StarDraft) => [d.situation, d.task, d.action, d.result].filter((s) => s.trim()).join(" ");

const inputStyle = { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)" };

export default function InterviewPage() {
  const ar = useLang();
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);
  /* Per-question practice state — a STAR draft, whether the practice panel is open, and any
     feedback fetched for it. Keyed by question index; only ever touches the one question the
     candidate is actually practising. */
  const [practicing, setPracticing] = useState<Record<number, boolean>>({});
  const [stars, setStars] = useState<Record<number, StarDraft>>({});
  const [feedback, setFeedback] = useState<Record<number, FeedbackResult | "loading" | "error">>({});
  /*
   * The CV the user chose from their own, when they chose one.
   *
   * Held for one reason: it is the only place that KNOWS the CV's language, because the user
   * declared it in the builder. `outLangFor` prefers that declaration over guessing from the text,
   * and stops trusting it the moment the text stops matching. See `lib/myCvs.ts`.
   */
  const [picked, setPicked] = useState<MyCv | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    // One attempt against /api/tools. Returns questions, or throws.
    async function attempt(): Promise<{ questions: InterviewResult["questions"]; redFlags: string[] }> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 55000);
      try {
        const res = await fetch("/api/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          /*
           * `lang` was hardcoded `"en"`. This page is served to Arabic readers too — `/ar/interview`
           * redirects here with `?lang=ar` — so every Arabic user preparing for an Arabic interview
           * was handed English questions, with no field anywhere to say otherwise.
           */
          body: JSON.stringify({
            mode: "interview", inputA: resume, inputB: jd,
            lang: outLangFor(picked, resume, ar),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Server ${res.status}`);
        if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error("empty");
        return { questions: data.questions, redFlags: Array.isArray(data.redFlags) ? data.redFlags : [] };
      } finally {
        clearTimeout(timer);
      }
    }

    // The free model fails intermittently; auto-retry once transparently so a
    // single flaky call never dead-ends the user on a blank form.
    let ok: { questions: InterviewResult["questions"]; redFlags: string[] } | null = null;
    let lastErr = "";
    for (let i = 0; i < 2 && !ok; i++) {
      try { ok = await attempt(); }
      catch (err) { lastErr = err instanceof Error ? err.message : ""; }
    }

    if (ok) {
      setResult(ok);
      setOpen(0);
    } else {
      // Guarantee a visible state — never end on a silent blank form.
      const isNetwork = /failed to fetch|load failed|networkerror|aborted/i.test(lastErr) || lastErr === "empty" || lastErr === "";
      setError(isNetwork
        ? (ar ? "انشغل الذكاء لحظة — نصك محفوظ هنا. اضغط «إعادة المحاولة»." : "The AI was busy for a moment — your text is still here. Tap Retry to prepare your questions.")
        : lastErr || "Something went wrong. Tap Retry.");
    }
    setLoading(false);
  }

  /*
   * Feedback on the candidate's OWN answer — not another AI-written model answer. Reuses
   * `/api/tools` (same retry/rate-limit/JSON-repair machinery as the questions themselves) under
   * a new "interview-feedback" mode rather than a separate endpoint.
   */
  async function getFeedback(i: number, question: string) {
    const draft = starText(stars[i] ?? EMPTY_STAR);
    if (draft.trim().length < 10) return;
    setFeedback((f) => ({ ...f, [i]: "loading" }));
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "interview-feedback",
          inputA: `Question: ${question}\n\nCandidate's background:\n${resume.slice(0, 3000)}`,
          inputB: draft,
          lang: outLangFor(picked, resume, ar),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (!data.strength && !Array.isArray(data.weaknesses))) throw new Error(data.error || "empty");
      setFeedback((f) => ({ ...f, [i]: data as FeedbackResult }));
    } catch {
      setFeedback((f) => ({ ...f, [i]: "error" }));
    }
  }

  return (
    <PageShell lang={ar ? "ar" : "en"} cta={navCta(ar ? "ar" : "en")} langToggle={ar ? "/interview" : "/ar/interview"} authNav={<AuthNav ar={ar} />} mobileMenu={<MobileMenu ar={ar} />}>
      <div className="mx-auto max-w-2xl py-12">
        <div className="mb-8 text-center">
          <div className="chip mb-4">{ar ? "تحضير المقابلة" : "Interview Prep"}</div>
          <h1 className="text-4xl font-extrabold tracking-tight">{ar ? "اعرف الأسئلة قبل أن تُطرح" : "Know the questions before they ask"}</h1>
          <p className="mt-3" style={{ color: "var(--muted)" }}>
            {ar ? "الصق سيرتك وإعلان الوظيفة — واحصل على الأسئلة الثمانية الأكثر احتمالاً، مع إجابات قوية مبنية على خبرتك أنت." : "Paste your resume and the job posting — get the 8 questions they'll most likely ask, with strong answers built from YOUR background."}
          </p>
        </div>

        {!result ? (
          <form onSubmit={run} className="card space-y-4 p-7">
            {/*
              The job advert comes across too, but ONLY into an empty box. The builder's target job
              is what the user is applying to, so it is the right default; overwriting something they
              had already typed here would be the picker deciding it knows better than they do.
            */}
            <MyCvPicker
              ar={ar}
              onPick={(cv) => {
                setPicked(cv);
                setResume(cv.text);
                if (!jd.trim() && cv.jobAdText.trim()) setJd(cv.jobAdText);
              }}
            />
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "سيرتك" : "Your resume"}</label>
              <textarea value={resume} onChange={(e) => setResume(e.target.value)} rows={8} required
                placeholder={ar ? "الصق سيرتك…" : "Paste your resume..."} className="w-full resize-none rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>{ar ? "إعلان الوظيفة" : "Job description"}</label>
              <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={6} required
                placeholder={ar ? "الصق إعلان الوظيفة…" : "Paste the job posting..."} className="w-full resize-none rounded-lg px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
            </div>
            {error && (
              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(248,113,113,0.1)", color: "var(--danger)" }}>
                <div>{error}</div>
                {resume.trim() && jd.trim() && !loading && (
                  <button type="submit" className="mt-2 inline-block rounded-lg px-3 py-1 text-xs font-semibold"
                    style={{ background: "rgba(139,92,246,0.15)", color: "var(--accent)", border: "1px solid rgba(139,92,246,0.4)" }}>
                    {ar ? "إعادة المحاولة" : "↻ Retry"}
                  </button>
                )}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-accent w-full py-3 disabled:opacity-50">
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  {ar ? "جارٍ تحضير مقابلتك…" : "Preparing your interview…"}
                </span>
              ) : (ar ? "حضّر مقابلتي" : "Prep my interview")}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => {
                  const txt = result.questions.map((q, i) => `${i + 1}. ${q.q}\n(${q.why})\n${q.answer}`).join("\n\n") +
                    (result.redFlags.length ? `\n\n--- Be ready for ---\n${result.redFlags.map((r) => `• ${r}`).join("\n")}` : "");
                  navigator.clipboard.writeText(txt);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid rgba(139,92,246,0.3)" }}>
                {copied ? (ar ? "نُسخ" : "Copied") : (ar ? "نسخ الكل" : "Copy all")}
              </button>
            </div>
            {(["behavioral", "technical", "gap"] as Category[]).map((cat) => {
              const idxs = result.questions.map((_, i) => i).filter((i) => result.questions[i].category === cat);
              if (!idxs.length) return null;
              const catLabel = {
                behavioral: ar ? "أسئلة سلوكية" : "Behavioral questions",
                technical: ar ? "أسئلة تقنية" : "Technical questions",
                /* This IS "missing-evidence questions" — the ones the model itself flagged as
                   probing something thin or absent in the candidate's own background. */
                gap: ar ? "أسئلة عن نقاط ينقصها الدليل" : "Questions about your gaps",
              }[cat];
              return (
                <div key={cat}>
                  <div className="bd-label mb-2 mt-6 first:mt-0">{catLabel}</div>
                  <div className="space-y-3">
                    {idxs.map((i) => {
                      const item = result.questions[i];
                      const fb = feedback[i];
                      const draft = stars[i] ?? EMPTY_STAR;
                      return (
                        <div key={i} className="card overflow-hidden">
                          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-start justify-between gap-3 p-5 text-left">
                            <div>
                              <div className="text-sm font-bold">{item.q}</div>
                              <div className="mt-1 font-mono text-xs" style={{ color: "var(--faint)" }}>{item.why}</div>
                            </div>
                            <span className="mt-0.5 font-mono text-accent">{open === i ? "−" : "+"}</span>
                          </button>
                          {open === i && (
                            <div className="border-t px-5 py-4 text-sm leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "rgba(139,92,246,0.03)" }}>
                              <div className="mb-1 font-mono text-xs uppercase tracking-wider text-accent">{ar ? "إجابة قوية" : "Strong answer"}</div>
                              {item.answer}

                              <button
                                onClick={() => setPracticing((p) => ({ ...p, [i]: !p[i] }))}
                                className="mt-4 rounded-lg px-3 py-1.5 text-xs font-semibold"
                                style={{ background: "rgba(139,92,246,0.1)", color: "var(--accent)", border: "1px solid rgba(139,92,246,0.25)" }}
                              >
                                {practicing[i] ? (ar ? "إخفاء التمرين" : "Hide practice") : (ar ? "بناء إجابتك أنت (STAR) ←" : "Build your own answer (STAR) →")}
                              </button>

                              {practicing[i] && (
                                <div className="mt-4 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                                  <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>
                                    {ar ? "اكتب إجابتك الحقيقية بأسلوب STAR — لن يخترع أي شيء نيابة عنك." : "Write your OWN real answer in the STAR structure — nothing is invented for you."}
                                  </p>
                                  {([
                                    ["situation", ar ? "الموقف — أين ومتى؟" : "Situation — where and when?"],
                                    ["task", ar ? "المهمة — ما المطلوب منك؟" : "Task — what was required of you?"],
                                    ["action", ar ? "الإجراء — ما الذي فعلته أنت تحديداً؟" : "Action — what did YOU specifically do?"],
                                    ["result", ar ? "النتيجة — ماذا حدث؟" : "Result — what happened?"],
                                  ] as [keyof StarDraft, string][]).map(([field, label]) => (
                                    <div key={field} className="mb-2">
                                      <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--muted)" }}>{label}</label>
                                      <textarea
                                        value={draft[field]}
                                        onChange={(e) => setStars((s) => ({ ...s, [i]: { ...(s[i] ?? EMPTY_STAR), [field]: e.target.value } }))}
                                        rows={2}
                                        className="w-full resize-none rounded-lg px-3 py-2 text-xs focus:outline-none"
                                        style={inputStyle}
                                      />
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => getFeedback(i, item.q)}
                                    disabled={starText(draft).trim().length < 10 || fb === "loading"}
                                    className="btn-accent mt-2 w-full py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {fb === "loading" ? (ar ? "جارٍ التقييم…" : "Getting feedback…") : (ar ? "قيّم إجابتي" : "Get feedback on my answer")}
                                  </button>

                                  {fb && fb !== "loading" && fb !== "error" && (
                                    <div className="mt-3 space-y-2 text-xs" style={{ color: "var(--muted)" }}>
                                      <div><span className="font-semibold" style={{ color: "var(--accent)" }}>{ar ? "نقطة قوة: " : "Strength: "}</span>{fb.strength}</div>
                                      {fb.weaknesses.length > 0 && (
                                        <div>
                                          <span className="font-semibold" style={{ color: "var(--warn)" }}>{ar ? "نقاط للتحسين:" : "To improve:"}</span>
                                          <ul className="mt-1 space-y-1 ps-4" style={{ listStyle: "disc" }}>
                                            {fb.weaknesses.map((w, wi) => <li key={wi}>{w}</li>)}
                                          </ul>
                                        </div>
                                      )}
                                      {fb.missingEvidence.length > 0 && (
                                        <div>
                                          <span className="font-semibold" style={{ color: "var(--danger)" }}>{ar ? "دليل ناقص:" : "Missing evidence:"}</span>
                                          <ul className="mt-1 space-y-1 ps-4" style={{ listStyle: "disc" }}>
                                            {fb.missingEvidence.map((m, mi) => <li key={mi}>{m}</li>)}
                                          </ul>
                                        </div>
                                      )}
                                      {fb.revisedOpening && (
                                        <div><span className="font-semibold" style={{ color: "var(--accent)" }}>{ar ? "بداية أقوى: " : "Stronger opening: "}</span>“{fb.revisedOpening}”</div>
                                      )}
                                    </div>
                                  )}
                                  {fb === "error" && (
                                    <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{ar ? "تعذّر التقييم — حاول مرة أخرى." : "Couldn't get feedback — try again."}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {result.redFlags?.length > 0 && (
              <div className="card p-6" style={{ borderColor: "rgba(248,113,113,0.25)" }}>
                <h3 className="mb-3 font-bold">{ar ? "قد يتعمقون في هذه — كن مستعداً" : "They may probe these — be ready"}</h3>
                <ul className="space-y-2">
                  {result.redFlags.map((r, i) => (
                    <li key={`${r}-${i}`} className="flex gap-2 text-sm" style={{ color: "var(--muted)" }}><span style={{ color: "var(--danger)" }}>!</span> {r}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="card mt-4 p-6 text-center" style={{ borderColor: "rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.04)" }}>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{ar ? "تأكد أن سيرتك تطابق هذه الوظيفة أولاً —" : "Make sure your resume matches this job first —"}</p>
              <Link href="/optimize" className="btn-accent mt-3 inline-block px-6 py-2.5 text-sm">{ar ? "افحصها على الإعلان مجاناً ←" : "Scan it against this job free →"}</Link>
            </div>
            <button onClick={() => setResult(null)} className="mx-auto block text-sm" style={{ color: "var(--faint)" }}>{ar ? "حضّر مقابلة أخرى" : "Prep another interview"}</button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
