"use client";

/**
 * The conversation, reduced to what it was actually good for.
 *
 * The chat builder's failure was never that talking to an AI is useless — it was
 * that a conversation was the only way in, so every model slip became a dead end
 * with no field to correct. Answering "should I put my SCFHS number on the CV?" is
 * the part a form genuinely cannot do.
 *
 * So it lives here: collapsed, one question at a time, scoped to the section it
 * sits in, and structurally unable to write anything. It returns prose to read.
 * There is no "apply this" button, because an answer is advice, not content — and
 * content only ever enters the document through `confirmItem`.
 */

import { useCallback, useState } from "react";
import { track } from "@vercel/analytics";
import BrandOrb from "../BrandOrb";
import { type SectionId } from "@/app/lib/builderDoc";
import { useAiTask } from "./useAiTask";

type Lang = "ar" | "en";

const C = {
  en: {
    open: "Ask AI about this section",
    close: "Close",
    ph: "e.g. should I list my licence number here?",
    send: "Ask", stop: "Stop",
    note: "Advice only. Nothing here is added to your CV.",
  },
  ar: {
    open: "اسأل الذكاء عن هذا القسم",
    close: "إغلاق",
    ph: "مثال: هل أضع رقم الرخصة هنا؟",
    send: "اسأل", stop: "أوقف",
    note: "إجابة استشارية فقط. لا يُضاف منها شيء إلى سيرتك.",
  },
};

export default function AskAi({
  lang, section, targetRole, current,
}: {
  lang: Lang;
  section: SectionId;
  targetRole: string;
  /** What the user has written in this section, so the answer is about their CV. */
  current?: string;
}) {
  const c = C[lang];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  /*
   * Everything that used to be five pieces of local state — busy, err, an abort ref, the
   * 429 branch, the AbortError branch — is the hook now. What this component kept is the
   * one thing that is genuinely its own: the question text.
   */
  const ai = useAiTask(lang);
  const answer = ai.state === "success" ? String(ai.data ?? "") : "";

  const send = useCallback(() => {
    if (!q.trim()) return;
    void ai.run("ask_section", { lang, question: q, targetRole, current }).then((r) => {
      if (r.state === "success") track("builder_ask_ai", { section });
    });
  }, [q, ai, lang, targetRole, current, section]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 flex items-center gap-2 rounded-full px-3 text-xs font-semibold"
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        <BrandOrb variant="button" size={18} />
        {c.open}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
      <div className="flex gap-2">
        <input
          className="bd-input" value={q} placeholder={c.ph}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        {/* While a question is in flight the button STOPS it rather than being disabled.
            A disabled button during a 30-second wait leaves the user with no way out but
            the back button. */}
        <button
          onClick={ai.busy ? ai.cancel : send} disabled={!ai.busy && !q.trim()}
          className="rounded-xl px-3 text-xs font-bold disabled:opacity-40"
          style={{ background: ai.busy ? "var(--surface)" : "var(--accent)",
                   color: ai.busy ? "var(--muted)" : "#fff",
                   border: ai.busy ? "1px solid var(--line)" : undefined,
                   whiteSpace: "nowrap" }}
        >
          {ai.busy ? c.stop : c.send}
        </button>
      </div>
      {answer && (
        <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--fg)" }}>
          {answer}
        </p>
      )}
      {/* One line for every non-success state — loading, empty, throttled, error — worded
          by the hook, so this section cannot word a rate limit as an outage. A throttle is
          amber rather than red: it is not a failure. */}
      {ai.message && (
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: ai.state === "loading" ? "var(--muted)" : ai.throttled ? "#fcd34d" : ai.state === "empty" ? "var(--faint)" : "#fca5a5" }}
        >
          {ai.message}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--faint)" }}>{c.note}</span>
        <button
          onClick={() => { ai.reset(); setOpen(false); }}
          className="rounded-full px-3 text-xs"
          style={{ border: "1px solid var(--line)", color: "var(--faint)" }}
        >
          {c.close}
        </button>
      </div>
    </div>
  );
}
