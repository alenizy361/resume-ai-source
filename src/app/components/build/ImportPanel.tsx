"use client";

/**
 * "I already have a CV" — the third way in, and the one most people want.
 *
 * The two doors that existed were "answer questions for ten minutes" and "upload it to
 * /optimize and get it rewritten". Neither lets someone who already has a CV keep
 * building in the form: they had to retype a career the product could have read.
 *
 * What arrives is shown before it is used. The parse is local and heuristic — dates
 * come in five formats, employers in four — so this panel prints what it understood and
 * what it could not place, and the user ticks what to keep. That is the opposite of the
 * usual import, which silently drops what it failed to parse and lets the applicant
 * discover the gap in an interview.
 *
 * Provenance is preserved: everything that arrives is `source: "imported"`, a value the
 * schema declared from the start and nothing had used until now.
 */

import { useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { type ParsedCv, parseCv, worthImporting } from "@/app/lib/importCv";

type Lang = "ar" | "en";

const C = {
  en: {
    have: "I already have a CV",
    haveSub: "PDF, Word or text. We read it, show you what we understood, and you keep what is right — it is never uploaded anywhere else.",
    pick: "Choose a file",
    reading: "Reading…",
    tooLittle: "We could not read enough from that file. It may be a scan rather than text — paste the content into the job description box, or fill the form and we will suggest as you go.",
    read: "Here is what we read",
    roles: "Positions",
    skills: "Skills",
    education: "Education",
    certs: "Licences & certifications",
    langs: "Languages",
    unread: (n: number) => `${n} line${n === 1 ? "" : "s"} we could not place`,
    unreadWhy: "Nothing is thrown away silently. Copy anything here into the right section yourself.",
    use: "Use what is ticked",
    cancel: "Start from scratch instead",
    budget: (n: number) => `${n} extra ${n === 1 ? "duty" : "duties"} will be offered rather than added — a job shows six at most.`,
    nothing: "Tick at least one thing to bring across.",
    done: "Brought across. Everything is editable in the sections below.",
  },
  ar: {
    have: "لديّ سيرة ذاتية بالفعل",
    haveSub: "PDF أو Word أو نص. نقرأها، ونعرض لك ما فهمناه، وتُبقي أنت الصحيح — ولا تُرفع إلى أي مكان آخر.",
    pick: "اختر ملفاً",
    reading: "يقرأ…",
    tooLittle: "لم نستطع قراءة ما يكفي من هذا الملف. قد يكون صورة ممسوحة لا نصاً — الصق المحتوى في مربع وصف الوظيفة، أو اكمل النموذج وسنقترح عليك أثناء التعبئة.",
    read: "هذا ما قرأناه",
    roles: "الوظائف",
    skills: "المهارات",
    education: "التعليم",
    certs: "الرخص والشهادات",
    langs: "اللغات",
    unread: (n: number) => `${n} سطراً لم نستطع تحديد مكانه`,
    unreadWhy: "لا شيء يُرمى بصمت. انسخ ما تريد منها إلى قسمه بنفسك.",
    use: "استخدم ما حدّدته",
    cancel: "أبدأ من الصفر",
    budget: (n: number) => `${n} مهمة إضافية ستُعرض عليك بدل إضافتها — الوظيفة تُظهر ستاً كحد أعلى.`,
    nothing: "حدّد شيئاً واحداً على الأقل لنقله.",
    done: "تم النقل. وكل شيء قابل للتعديل في الأقسام أدناه.",
  },
};

type Picks = { roles: boolean[]; skills: boolean; education: boolean; certs: boolean; langs: boolean };

export default function ImportPanel({
  lang, onImport,
}: {
  lang: Lang;
  /** Hands the confirmed subset to the reducer. The panel never touches state itself. */
  onImport: (cv: ParsedCv) => void;
}) {
  const c = C[lang];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [parsed, setParsed] = useState<ParsedCv | null>(null);
  const [picks, setPicks] = useState<Picks>({ roles: [], skills: true, education: true, certs: true, langs: true });
  const [showUnread, setShowUnread] = useState(false);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  async function read(file: File) {
    setErr(""); setBusy(true); setParsed(null); setDone(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || "Failed to read that file."));
      const cv = parseCv(String(data?.text || ""));
      if (!worthImporting(cv)) { setErr(c.tooLittle); return; }
      setParsed(cv);
      setPicks({ roles: cv.roles.map(() => true), skills: true, education: true, certs: true, langs: true });
      track("builder_cv_imported", {
        roles: cv.roles.length, skills: cv.skills.length, unread: cv.unread.length,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : c.tooLittle);
    } finally { setBusy(false); }
  }

  /** Apply only what is ticked, by handing over a narrowed copy of the parse. */
  function apply() {
    if (!parsed) return;
    const roles = parsed.roles.filter((_, i) => picks.roles[i]);
    const chosen: ParsedCv = {
      ...parsed,
      roles,
      skills: picks.skills ? parsed.skills : [],
      education: picks.education ? parsed.education : [],
      certifications: picks.certs ? parsed.certifications : [],
      languages: picks.langs ? parsed.languages : [],
    };
    if (!roles.length && !chosen.skills.length && !chosen.education.length
        && !chosen.certifications.length && !chosen.languages.length) {
      setErr(c.nothing);
      return;
    }
    onImport(chosen);
    setDone(true);
    setParsed(null);
    track("builder_cv_import_applied", { roles: roles.length });
  }

  // Bullets beyond a job's budget are offered rather than added, and the count is shown
  // up front: `capBullets` keeps the earliest six, so a silent import of ten would drop
  // four of the user's own lines with no trace.
  const overflow = parsed
    ? parsed.roles.reduce((n, r, i) => n + (picks.roles[i] ? Math.max(0, r.bullets.length - 6) : 0), 0)
    : 0;

  return (
    <div className="mt-4 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
      <div className="text-sm font-bold">{c.have}</div>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{c.haveSub}</p>

      <input
        ref={input} type="file" accept=".pdf,.docx,.txt,.md" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";     // so picking the same file twice re-reads it
          if (f) read(f);
        }}
      />
      <button
        onClick={() => input.current?.click()} disabled={busy}
        className="btn-ghost mt-3 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? c.reading : c.pick}
      </button>

      {err && <p className="mt-2 text-xs" style={{ color: "#fca5a5" }}>{err}</p>}
      {done && <p className="mt-2 text-xs" style={{ color: "#6ee7b7" }}>{c.done}</p>}

      {parsed && (
        <div className="mt-4">
          <div className="bd-label">{c.read}</div>

          {parsed.roles.length > 0 && (
            <div className="mt-2">
              <div className="bd-label">{c.roles}</div>
              {parsed.roles.map((r, i) => (
                <label key={`${r.title}-${i}`} className="bd-confirmed mb-1.5 items-start">
                  <input
                    type="checkbox" checked={picks.roles[i] ?? false}
                    onChange={(e) => setPicks((p) => {
                      const roles = [...p.roles];
                      roles[i] = e.target.checked;
                      return { ...p, roles };
                    })}
                  />
                  <span className="flex-1 text-xs leading-relaxed">
                    <b>{r.title || "—"}</b>
                    {r.company && ` — ${r.company}`}
                    {(r.start || r.end) && ` | ${[r.start, r.end].filter(Boolean).join(" – ")}`}
                    <span style={{ color: "var(--faint)" }}> · {r.bullets.length}</span>
                  </span>
                </label>
              ))}
              {overflow > 0 && (
                <p className="mt-1 text-xs" style={{ color: "#fcd34d" }}>{c.budget(overflow)}</p>
              )}
            </div>
          )}

          <Tick label={c.skills} items={parsed.skills} on={picks.skills}
            set={(v) => setPicks((p) => ({ ...p, skills: v }))} />
          <Tick label={c.education} items={parsed.education} on={picks.education}
            set={(v) => setPicks((p) => ({ ...p, education: v }))} />
          <Tick label={c.certs} items={parsed.certifications} on={picks.certs}
            set={(v) => setPicks((p) => ({ ...p, certs: v }))} />
          <Tick label={c.langs} items={parsed.languages} on={picks.langs}
            set={(v) => setPicks((p) => ({ ...p, langs: v }))} />

          {parsed.unread.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowUnread((s) => !s)}
                className="rounded-full px-3 text-xs"
                style={{ border: "1px solid var(--line)", color: "var(--faint)" }}
              >
                {showUnread ? "▾" : "▸"} {c.unread(parsed.unread.length)}
              </button>
              {showUnread && (
                <div className="mt-2">
                  <p className="mb-1.5 text-xs" style={{ color: "var(--faint)" }}>{c.unreadWhy}</p>
                  <ul className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
                    {parsed.unread.slice(0, 12).map((u, i) => <li key={`${i}-${u.slice(0, 8)}`}>• {u}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={apply} className="btn-accent rounded-xl px-5 text-sm font-bold">{c.use}</button>
            <button
              onClick={() => setParsed(null)}
              className="rounded-full px-3 text-xs"
              style={{ border: "1px solid var(--line)", color: "var(--faint)" }}
            >
              {c.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One tickable group, with a preview of what it contains. Hidden when empty. */
function Tick({
  label, items, on, set,
}: {
  label: string; items: string[]; on: boolean; set: (v: boolean) => void;
}) {
  if (!items.length) return null;
  return (
    <label className="bd-confirmed mb-1.5 mt-2 items-start">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="flex-1 text-xs leading-relaxed">
        <b>{label}</b> <span style={{ color: "var(--faint)" }}>· {items.length}</span>
        <br />
        <span style={{ color: "var(--muted)" }}>{items.slice(0, 6).join(" · ")}{items.length > 6 ? " …" : ""}</span>
      </span>
    </label>
  );
}
