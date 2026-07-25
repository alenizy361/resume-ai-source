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

import { useCallback, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import AiOrb from "../AiOrb";
import { type SectionId } from "@/app/lib/builderDoc";

type Lang = "ar" | "en";

const C = {
  en: {
    open: "Ask AI about this section",
    close: "Close",
    ph: "e.g. should I list my licence number here?",
    send: "Ask",
    busy: "Thinking…",
    err: "The assistant is busy — try again in a moment.",
    slow: "You have asked a lot in the last few minutes — try again shortly.",
    note: "Advice only. Nothing here is added to your CV.",
  },
  ar: {
    open: "اسأل الذكاء عن هذا القسم",
    close: "إغلاق",
    ph: "مثال: هل أضع رقم الرخصة هنا؟",
    send: "اسأل",
    busy: "يفكّر…",
    err: "المساعد مشغول — جرّب بعد لحظة.",
    slow: "سألت كثيراً في الدقائق الماضية — جرّب بعد قليل.",
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
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const question = q.trim();
    if (!question || busy) return;
    setErr(""); setAnswer(""); setBusy(true);
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.current.signal,
        body: JSON.stringify({
          kind: "ask", lang, question, targetRole,
          current: (current || "").slice(0, 1200),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) { setErr(String(data?.error || "").trim() || c.slow); return; }
      if (!res.ok) throw new Error(String(data?.error || "failed"));
      setAnswer(String(data?.text || "").trim());
      track("builder_ask_ai", { section });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr(c.err);
    } finally { setBusy(false); }
  }, [q, busy, lang, targetRole, current, section, c.err, c.slow]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 flex items-center gap-2 rounded-full px-3 text-xs font-semibold"
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        <AiOrb size={18} />
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
        <button
          onClick={send} disabled={busy || !q.trim()}
          className="rounded-xl px-3 text-xs font-bold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#fff", whiteSpace: "nowrap" }}
        >
          {busy ? c.busy : c.send}
        </button>
      </div>
      {answer && (
        <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--fg)" }}>
          {answer}
        </p>
      )}
      {err && <p className="mt-2 text-xs" style={{ color: "#fca5a5" }}>{err}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--faint)" }}>{c.note}</span>
        <button
          onClick={() => setOpen(false)}
          className="rounded-full px-3 text-xs"
          style={{ border: "1px solid var(--line)", color: "var(--faint)" }}
        >
          {c.close}
        </button>
      </div>
    </div>
  );
}
