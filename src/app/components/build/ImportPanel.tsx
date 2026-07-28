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
 *
 * The copy says the file is sent to our server, because it is: /api/extract is a server
 * route and the bytes leave the device to be parsed by unpdf/mammoth. The first version
 * of this panel said "never uploaded anywhere else", which was written about the PARSE
 * (local, no model involved) and read as a claim about the FILE. A privacy sentence that
 * is true about the author's intent and false about the network is still false.
 */

import { useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { type ParsedCv, parseCv, worthImporting } from "@/app/lib/importCv";
import { type SavedResume, getResumes } from "@/app/lib/localdata";

type Lang = "ar" | "en";

const C = {
  en: {
    have: "I already have a CV",
    haveSub: "PDF, Word or text. Your file is sent to our server only to read its text — no AI provider sees the file, and it is not saved. We then show you what we understood, and you keep what is right.",
    ocrOpen: "Read it as an image with AI",
    ocrWhy: "For a scan or a phone photo there is no text to extract, so this one sends the file itself to Anthropic to be transcribed. That is different from the line above, which is why it is a separate button. The file is not stored, and nothing reaches your CV until you approve it.",
    ocrBusy: "Reading the image…",
    pick: "Choose a file",
    reading: "Reading…",
    tooLittle: "We could not read enough from that file. It may be a scan or a photo rather than text — paste the words in below, or fill the form and we will suggest as you go.",
    noStructure: "We read the text, but could not tell the sections apart. It is in the box below — add a blank line before each section heading and press the button again. This costs nothing and sends nothing anywhere.",
    pasteOpen: "Paste the text instead",
    pasteLabel: "Paste your CV text",
    pasteSub: "Nothing is uploaded and nothing is sent to a model — this is read in your browser.",
    pasteGo: "Read this text",
    pasteTooShort: "That is too short to read as a CV. Paste the whole thing, including the job titles and dates.",
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
    saved: "Or continue from a CV you already made here",
    savedSub: "Including one built in the chat. It is read the same way an uploaded file is, so you can carry on editing it in the form.",
    open: "Open",
    showSaved: "Show what is saved on this device",
    noSaved: "Nothing saved on this device yet.",
  },
  ar: {
    have: "لديّ سيرة ذاتية بالفعل",
    haveSub: "PDF أو Word أو نص. يُرسَل ملفك إلى سيرفرنا لقراءة نصه فقط — لا يراه أي مزوّد ذكاء اصطناعي، ولا يُحفَظ. ثم نعرض لك ما فهمناه، وتُبقي أنت الصحيح.",
    ocrOpen: "اقرأها كصورة بالذكاء الاصطناعي",
    ocrWhy: "الملف الممسوح أو المصوَّر بالجوال لا يحتوي نصاً يُستخرج، فهذا الخيار يُرسل الملف نفسه إلى Anthropic لنسخ ما فيه. هذا يختلف عن السطر بالأعلى، ولهذا هو زر منفصل. لا يُحفَظ الملف، ولا يدخل شيء سيرتك قبل أن تعتمده.",
    ocrBusy: "يقرأ الصورة…",
    pick: "اختر ملفاً",
    reading: "يقرأ…",
    tooLittle: "لم نستطع قراءة ما يكفي من هذا الملف. قد يكون صورة ممسوحة أو تصويراً لا نصاً — الصق الكلام في المربع بالأسفل، أو اكمل النموذج وسنقترح عليك أثناء التعبئة.",
    noStructure: "قرأنا النص، لكننا لم نستطع تمييز أقسامه. النص في المربع بالأسفل — اترك سطراً فارغاً قبل كل عنوان قسم ثم اضغط الزر مرة أخرى. هذا لا يكلّف شيئاً ولا يُرسل شيئاً إلى أي جهة.",
    pasteOpen: "الصق النص بدلاً من الملف",
    pasteLabel: "الصق نص سيرتك",
    pasteSub: "لا يُرفَع شيء ولا يُرسَل إلى أي نموذج ذكاء — تُقرأ داخل متصفحك.",
    pasteGo: "اقرأ هذا النص",
    pasteTooShort: "هذا أقصر من أن يُقرأ كسيرة. الصقها كاملة، بالمسميات والتواريخ.",
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
    saved: "أو واصل من سيرة أنشأتها هنا",
    savedSub: "بما فيها ما بُني بالمحادثة. تُقرأ كما يُقرأ الملف المرفوع، فتستطيع مواصلة تعديلها في النموذج.",
    open: "افتح",
    showSaved: "اعرض المحفوظ على هذا الجهاز",
    noSaved: "لا يوجد محفوظ على هذا الجهاز بعد.",
  },
};

type Picks = { roles: boolean[]; skills: boolean; education: boolean; certs: boolean; langs: boolean };

export default function ImportPanel({
  lang, owner, onImport,
}: {
  lang: Lang;
  /** Whose saved CVs to list. Empty until the session is known, which lists nothing — correctly. */
  owner: string;
  /** Hands the confirmed subset to the reducer. The panel never touches state itself. */
  onImport: (cv: ParsedCv) => void;
}) {
  const c = C[lang];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [parsed, setParsed] = useState<ParsedCv | null>(null);
  const [picks, setPicks] = useState<Picks>({ roles: [], skills: true, education: true, certs: true, langs: true });
  const [showUnread, setShowUnread] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  /*
   * Proven: this file HAS a text layer.
   *
   * Only ever set from a read that came back with real text. It hides the vision-model button,
   * because OCR on a document whose text we already have is definitionally the wrong tool and
   * charging for it is the complaint that produced this flag.
   */
  const [hasTextLayer, setHasTextLayer] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  /*
   * CVs this browser has already produced — including ones the chat door built.
   *
   * `entry: "saved"` has been in the schema since the first commit with nothing to
   * populate it, because reading a resume back required a parser. There is one now, and
   * saved text goes through exactly the same path as an uploaded file: one code path, so
   * a chat-built CV cannot import differently from a PDF.
   *
   * Read on click, not on mount. localStorage does not exist during the server render,
   * and reading it in an effect would mean a setState on every visit for a list most
   * people will never open. `null` means "not looked yet"; `[]` means "looked, nothing
   * there", and the two need different copy.
   */
  const [saved, setSaved] = useState<SavedResume[] | null>(null);
  const look = () => {
    try { setSaved(getResumes(owner).slice(0, 5)); } catch { setSaved([]); }
  };

  function openSaved(entry: SavedResume) {
    setErr(""); setDone(false);
    const cv = parseCv(entry.text);
    if (!worthImporting(cv)) { setErr(c.tooLittle); return; }
    setParsed(cv);
    setPicks({ roles: cv.roles.map(() => true), skills: true, education: true, certs: true, langs: true });
    track("builder_saved_opened", { roles: cv.roles.length });
  }

  /**
   * Text in, review out — the ONE path, whether the text came from a file or from a paste.
   *
   * Written as a shared function rather than a second copy because the two entries must reach the
   * same review screen with the same ticks and the same budget warnings. A parallel paste path is
   * how one of them quietly stops honouring a rule the other one does.
   *
   * `source` only reaches analytics, so an operator can tell how often the upload fails and which
   * door rescued it — the paste box or the vision read. That ratio is the number that says whether
   * scanned CVs are a real problem in this market, and how much the OCR path is actually costing.
   */
  function ingest(text: string, source: "file" | "paste" | "ocr") {
    const cv = parseCv(text);
    if (!worthImporting(cv)) {
      /*
       * ── two very different failures, and they used to share one sentence ──
       *
       * `tooLittle` says the file "may be a scan or a photo rather than text", and directly under it
       * sits a button that spends money sending the file to a vision model. That sentence is TRUE
       * when the server got nothing. It is FALSE — and expensive — when the server read the text
       * fine and only the section detection failed, which is what happens to a CV whose headings
       * this parser does not recognise.
       *
       * The user in that case is being told their file is an image, and sold OCR for a document that
       * has a perfectly good text layer. So the branch is split on the one fact that distinguishes
       * them: did any text come back.
       *
       * The text is put INTO the paste box rather than discarded. It is already in the browser, it
       * cost nothing to obtain, and one blank line before a heading is usually the whole fix — which
       * the user can do here, for free, instead of paying for a transcription of text we already have.
       */
      const gotText = text.trim().length >= 200;
      if (gotText) {
        setErr(c.noStructure);
        setPasted(text);
        setHasTextLayer(true);
      } else {
        setErr(c.tooLittle);
      }
      setShowPaste(true);
      return;
    }
    setParsed(cv);
    setPicks({ roles: cv.roles.map(() => true), skills: true, education: true, certs: true, langs: true });
    setShowPaste(false);
    track("builder_cv_imported", {
      roles: cv.roles.length, skills: cv.skills.length, unread: cv.unread.length, source,
    });
  }

  async function read(file: File) {
    setErr(""); setBusy(true); setParsed(null); setDone(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || "Failed to read that file."));
      ingest(String(data?.text || ""), "file");
    } catch (e) {
      setErr(e instanceof Error ? e.message : c.tooLittle);
      /* A file that could not be read is exactly when the paste box earns its place — and the one
         case where the vision model is the honest answer, so the button comes back. */
      setHasTextLayer(false);
      setShowPaste(true);
    } finally { setBusy(false); }
  }

  /**
   * The scan/photo path: send the FILE to a vision model and transcribe it.
   *
   * Deliberately never automatic. `read()` failing does not trigger this, because the upload card
   * promises no AI provider sees the file and that promise has to survive a failed read — the user
   * chooses to trade it, knowing what they are trading, or the sentence above the button is false.
   */
  async function readAsImage(file: File) {
    setErr(""); setOcrBusy(true); setParsed(null); setDone(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || "We could not read that file."));
      ingest(String(data?.text || ""), "ocr");
    } catch (e) {
      setErr(e instanceof Error ? e.message : c.tooLittle);
      /* Still offer the paste box: OCR failing is exactly when typing it out is the way through. */
      setShowPaste(true);
    } finally { setOcrBusy(false); }
  }

  /** No upload, no request, no model call — `parseCv` runs here. Pasting costs nothing. */
  function readPasted() {
    setErr(""); setParsed(null); setDone(false);
    if (pasted.trim().length < 40) { setErr(c.pasteTooShort); return; }
    ingest(pasted, "paste");
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
      {/* Its own picker, because it accepts images the text extractor cannot use and refuses the
          DOCX the text extractor prefers. One input with a union of both accepts would let someone
          send a Word file to a vision model and pay for the privilege. */}
      <input
        ref={imageInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,image/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) readAsImage(f);
        }}
      />
      <button
        onClick={() => input.current?.click()} disabled={busy}
        className="btn-ghost mt-3 rounded-xl px-4 text-sm font-semibold t-tap disabled:opacity-50"
      >
        {busy ? c.reading : c.pick}
      </button>

      {!parsed && (
        <div className="mt-4">
          <div className="bd-label">{c.saved}</div>
          <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{c.savedSub}</p>
          {saved === null && (
            <button
              onClick={look}
              className="rounded-full px-3 text-xs font-semibold"
              style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
            >
              {c.showSaved}
            </button>
          )}
          {saved?.length === 0 && (
            <p className="text-xs" style={{ color: "var(--faint)" }}>{c.noSaved}</p>
          )}
          {(saved ?? []).map((r) => (
            <div key={r.id} className="bd-confirmed mb-1.5">
              <span className="flex-1 text-xs leading-relaxed">{r.title || "CV"}</span>
              <button
                onClick={() => openSaved(r)}
                className="rounded-full px-2.5 text-[11px] font-semibold"
                style={{ minHeight: 32, border: "1px solid var(--line)", color: "var(--muted)" }}
              >
                {c.open}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Keyed on the message so a SECOND failure shakes again — an unchanged element would not
          re-run the animation, and "it failed again" is exactly what needs to register. */}
      {err && <p key={err} className="mt-2 text-xs t-shake" style={{ color: "var(--danger)" }}>{err}</p>}

      {/*
        ── the paste box, which the error message used to point away from ──

        `/api/extract` returns 400 rather than 500 on an unreadable file, and its own comment says
        why: "so the UI can show a 'paste the text instead' hint". The hint shipped; the box did not.
        Worse, it named the JOB DESCRIPTION field — so a user following the instruction would have
        pasted their own CV in as the advert they were applying to, and the tailoring would have been
        computed against themselves.

        A scan or a phone photo of a CV is the common case here, not an edge one, and it is the one
        case where the upload can do nothing. So the box opens itself the moment a read fails, and
        stays reachable otherwise.

        It costs nothing to use: `parseCv` runs in the browser, so there is no upload, no request and
        no model call.
      */}
      {!parsed && !hasTextLayer && (
        <div className="mt-4">
          {/*
            The consent sentence sits ABOVE the button and is always visible — not behind a tooltip,
            not revealed on tap. The card's own promise is that no AI provider sees the file; this is
            the one action that changes it, so the change is stated before the click, not after.
          */}
          <p className="text-xs" style={{ color: "var(--faint)" }}>{c.ocrWhy}</p>
          <button
            onClick={() => imageInput.current?.click()}
            disabled={ocrBusy || busy}
            className="btn-ghost mt-2 rounded-xl px-4 text-sm font-semibold t-tap disabled:opacity-50"
          >
            {ocrBusy ? c.ocrBusy : c.ocrOpen}
          </button>
        </div>
      )}

      {!parsed && !showPaste && (
        <button
          onClick={() => setShowPaste(true)}
          className="mt-3 block rounded-full px-3 text-xs font-semibold"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
        >
          {c.pasteOpen}
        </button>
      )}

      {!parsed && showPaste && (
        <div className="mt-3 t-reveal">
          <label className="bd-label" htmlFor="cv-paste">{c.pasteLabel}</label>
          <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{c.pasteSub}</p>
          <textarea
            id="cv-paste"
            className="bd-input"
            rows={7}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            /* The CV may be in either language whatever the interface is set to, so the browser
               decides the direction from the text rather than inheriting the UI's. */
            dir="auto"
          />
          <button
            onClick={readPasted}
            disabled={!pasted.trim()}
            className="btn-ghost mt-2 rounded-xl px-4 text-sm font-semibold t-tap disabled:opacity-50"
          >
            {c.pasteGo}
          </button>
        </div>
      )}
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
