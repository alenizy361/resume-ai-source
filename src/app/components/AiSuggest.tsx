"use client";
import { useState } from "react";
import BrandOrb from "./BrandOrb";

/**
 * The interactive "AI writes it for you" control that sits on every builder
 * field. Tap the orb → the AI drafts the field's content in the user's place,
 * written straight into the input so they can edit any word or wipe it. An
 * undo pill restores exactly what was there before — the AI never takes over,
 * it proposes.
 */
export default function AiSuggest({
  kind,
  lang,
  outLang,
  targetRole,
  role,
  company,
  value,
  jobAd,
  onWrite,
}: {
  kind: "duties" | "summary" | "skills" | "extras" | "education";
  /** The interface language: this control's own button, hint and error text. */
  lang: "ar" | "en";
  /**
   * The language the CONTENT should be written in. Defaults to `lang`, so callers
   * that never distinguished the two behave exactly as before.
   *
   * They are different questions. An Arabic-speaking applicant writing an English CV
   * wants an Arabic button and an English sentence, and a single `lang` cannot express
   * that — which is how Arabic lines reached English resumes.
   */
  outLang?: "ar" | "en";
  targetRole: string;
  role?: string;
  company?: string;
  value: string;
  /** The live posting text, so a suggestion mirrors today's advert not the model's memory. */
  jobAd?: string;
  onWrite: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const ar = lang === "ar";

  async function suggest() {
    if (busy) return;
    setErr("");
    setBusy(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 35000);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ kind, lang: outLang ?? lang, targetRole, role, company, current: value, jobAd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      setPrev(value);
      onWrite(data.text);
    } catch (e) {
      setErr(e instanceof Error && e.message !== "failed" && !e.message.includes("abort") ? e.message : ar ? "المساعد مشغول — جرب ثانية." : "The assistant is busy — try again.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={suggest}
        disabled={busy}
        className="flex min-h-9 items-center gap-2 rounded-full py-1 pe-3.5 ps-1.5 text-xs font-bold transition-opacity disabled:opacity-70"
        style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.35)", color: "#93c5fd" }}
      >
        <BrandOrb variant="button" size={22} busy={busy} />
        {busy ? (ar ? "يكتب لك…" : "Writing for you…") : ar ? "خلّ الذكاء يكتبها" : "Let AI write it"}
      </button>
      {prev !== null && !busy && (
        <>
          <span className="text-[11px]" style={{ color: "var(--faint)" }}>
            {ar ? "كتبها الذكاء — عدّلها أو امسحها براحتك" : "AI draft — edit or delete anything"}
          </span>
          <button
            type="button"
            onClick={() => { onWrite(prev); setPrev(null); }}
            className="min-h-9 rounded-full px-3 text-[11px] font-semibold"
            style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            {ar ? "↩ رجّع اللي كتبته" : "↩ Undo"}
          </button>
        </>
      )}
      {err && <span className="text-[11px]" style={{ color: "#fca5a5" }}>{err}</span>}
    </div>
  );
}
