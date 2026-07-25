"use client";

/**
 * Work experience — the section the CV is actually judged on.
 *
 * The shape of the interaction is the product's whole argument. The user supplies
 * the facts only they have (employer, dates, department) and the AI supplies the
 * wording, offered as cards that must each be accepted individually. Nothing here
 * writes to the resume directly: every accept goes through `confirmItem`, which is
 * the only door into `profile`.
 *
 * Two things it refuses to do, both deliberate:
 *  - It never invents a number. "Add a figure" asks a question and shows the
 *    sentence the answer will land in; the user types the real value.
 *  - It never accepts past the bullet budget. `capBullets` keeps the earliest
 *    bullets, so silently taking a seventh would discard the newest one and the
 *    user would watch their click do nothing.
 */

import { useCallback, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import AiOrb from "../AiOrb";
import { type Role } from "@/app/lib/resumeDoc";
import { findRolePack } from "@/app/lib/rolePacks";
import {
  type BuilderState, type Item, newItem, pending, rejected, filterFresh, bulletRoom,
} from "@/app/lib/builderDoc";

type Lang = "ar" | "en";

const C = {
  en: {
    addRole: "+ Add a position", remove: "Remove",
    title: "Job title", company: "Employer", loc: "Location",
    dept: "Department or modality", start: "Start", end: "End", now: "I work here now",
    opt: "optional", present: "Present",
    suggested: "Suggested responsibilities for this position",
    aiBadge: "AI suggested", packBadge: "Common for this role",
    add: "Add", edit: "Edit", drop: "Dismiss", improve: "Improve", shorter: "Shorter",
    metric: "Add a figure", more: "Suggest more", showMore: "Show more",
    onCv: "On your CV", full: "This position is at its bullet limit — remove one to add another.",
    room: (n: number) => `${n} more can be added`,
    needBoth: "Add the job title and employer, and suggestions appear here.",
    save: "Save", cancel: "Cancel",
    askTitle: "One question, and the figure is yours — not ours",
    askHint: "Type the real number. Skip it and we write a strong line without one.",
    skip: "Skip — no figure",
    busy: "Writing…",
    err: "The assistant is busy. Keep typing — you can add responsibilities by hand.",
  },
  ar: {
    addRole: "+ أضف وظيفة", remove: "حذف",
    title: "المسمى الوظيفي", company: "جهة العمل", loc: "الموقع",
    dept: "القسم أو التخصص", start: "من", end: "إلى", now: "أعمل هنا حالياً",
    opt: "اختياري", present: "حتى الآن",
    suggested: "مهام مقترحة لهذه الوظيفة",
    aiBadge: "اقتراح ذكاء", packBadge: "شائع في هذا المسمى",
    add: "أضف", edit: "عدّل", drop: "استبعد", improve: "حسّن", shorter: "اختصر",
    metric: "أضف رقماً", more: "اقترح المزيد", showMore: "المزيد",
    onCv: "في سيرتك", full: "هذه الوظيفة بلغت حد المهام — احذف واحدة لتضيف أخرى.",
    room: (n: number) => `يمكن إضافة ${n} أخرى`,
    needBoth: "أضف المسمى وجهة العمل، وتظهر الاقتراحات هنا.",
    save: "حفظ", cancel: "إلغاء",
    askTitle: "سؤال واحد، والرقم رقمك — لا رقمنا",
    askHint: "اكتب الرقم الحقيقي. وإن تجاوزت، نكتب سطراً قوياً بلا رقم.",
    skip: "تجاوز — بلا رقم",
    busy: "يكتب…",
    err: "المساعد مشغول. واصل الكتابة — تستطيع إضافة المهام بيدك.",
  },
};

/** One call, cancellable, so a stale reply cannot overwrite a newer one. */
async function askSuggest(body: Record<string, unknown>, signal: AbortSignal) {
  const res = await fetch("/api/suggest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error || "failed"));
  return data as { text?: string; items?: string[]; question?: string; rewritten?: string };
}

export default function ExperienceSection({
  lang, state, dispatch, target,
}: {
  lang: Lang;
  state: BuilderState;
  dispatch: React.Dispatch<{ t: string; [k: string]: unknown }>;
  target: BuilderState["target"];
}) {
  const c = C[lang];
  const roles = state.profile.roles || [];

  return (
    <div>
      {roles.map((r) => (
        <RoleCard key={r.id} role={r} lang={lang} state={state} dispatch={dispatch} target={target} />
      ))}
      <button
        onClick={() => dispatch({ t: "addRole" })}
        className="btn-ghost mt-3 rounded-xl px-4 text-sm font-semibold"
      >
        {c.addRole}
      </button>
    </div>
  );
}

function RoleCard({
  role, lang, state, dispatch, target,
}: {
  role: Role; lang: Lang; state: BuilderState;
  dispatch: React.Dispatch<{ t: string; [k: string]: unknown }>;
  target: BuilderState["target"];
}) {
  const c = C[lang];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [ask, setAsk] = useState<{ id: string; question: string; shape: string; value: string } | null>(null);
  // A ref, not a memo: this box is meant to be mutated, and a stale reply must
  // never overwrite a newer one.
  const abort = useRef<AbortController | null>(null);

  const set = (patch: Partial<Role>) => dispatch({ t: "role", id: role.id!, patch });
  const offered = pending(state, "experience", role.id);
  const room = bulletRoom(role);
  const ready = role.title.trim().length > 1 && role.company.trim().length > 0;

  /** Seed instantly from the cached pack, then top up from the model on demand. */
  const suggest = useCallback(async (fromModel: boolean) => {
    setErr("");
    const seen = {
      confirmed: role.bullets,
      pending: offered,
      rejected: rejected(state, "experience").filter((i) => i.roleId === role.id),
    };

    if (!fromModel) {
      const pack = findRolePack(role.title);
      if (!pack) return;
      const fresh = filterFresh(pack.duties.map((d) => d[lang]), seen);
      if (!fresh.length) return;
      dispatch({
        t: "offer",
        items: fresh.map((text) => newItem({
          section: "experience", type: "duty", text, roleId: role.id,
          source: "occupation", sourceRef: pack.slug,
          reason: lang === "ar" ? "شائع في هذا المسمى" : "common for this job title",
        })),
      });
      return;
    }

    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    try {
      const d = await askSuggest({
        kind: "duties", mode: "items", lang, targetRole: target.title || role.title,
        role: role.title, company: role.company,
        jobAd: target.jobAdText,
        current: role.bullets.join("\n"),
      }, abort.current.signal);
      const fresh = filterFresh(d.items ?? (d.text ? [d.text] : []), seen);
      if (!fresh.length) { setErr(c.err); return; }
      dispatch({
        t: "offer",
        items: fresh.map((text) => newItem({
          section: "experience", type: "duty", text, roleId: role.id,
          source: "ai", reason: lang === "ar" ? "مبني على مسماك وجهة عملك" : "based on your title and employer",
        })),
      });
      track("builder_suggestions_shown", { section: "experience", n: fresh.length });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr(c.err);
    } finally { setBusy(false); }
     
  }, [role, offered, state, lang, target, dispatch, c.err]);

  /** Rewrite one pending suggestion in place. */
  const rewrite = useCallback(async (it: Item, kind: "bullet_improve" | "bullet_shorter") => {
    setErr(""); setBusy(true);
    abort.current?.abort(); abort.current = new AbortController();
    try {
      const d = await askSuggest({
        kind, lang, targetRole: target.title || role.title,
        role: role.title, company: role.company, current: it.text, jobAd: target.jobAdText,
      }, abort.current.signal);
      if (d.text?.trim()) dispatch({ t: "editItem", id: it.id, text: d.text.trim() });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr(c.err);
    } finally { setBusy(false); }
     
  }, [role, lang, target, dispatch, c.err]);

  /**
   * The metric path. The model returns the QUESTION and the sentence shape — never
   * a figure — and the user supplies the value. This is the no-invented-numbers
   * rule expressed as an interaction rather than as a refusal.
   */
  const askForFigure = useCallback(async (it: Item) => {
    setErr(""); setBusy(true);
    abort.current?.abort(); abort.current = new AbortController();
    try {
      const d = await askSuggest({
        kind: "bullet_metric", lang, targetRole: target.title || role.title,
        role: role.title, company: role.company, current: it.text,
      }, abort.current.signal);
      if (d.question) {
        setAsk({ id: it.id, question: d.question, shape: d.rewritten || it.text, value: "" });
        track("builder_metric_asked", {});
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr(c.err);
    } finally { setBusy(false); }
     
  }, [role, lang, target, c.err]);

  const applyFigure = () => {
    if (!ask) return;
    const v = ask.value.trim();
    // No figure given ⇒ keep the strong non-quantified line. Never pressure.
    const text = v ? ask.shape.replace(/_{2,}/, v) : ask.shape.replace(/\s*_{2,}\s*/, " ").replace(/\s{2,}/g, " ").trim();
    dispatch({ t: "editItem", id: ask.id, text });
    setAsk(null);
  };

  const visible = showAll ? offered : offered.slice(0, 6);

  return (
    <div className="card mb-4 p-4">
      <div className="bd-grid two">
        <Input label={c.title} value={role.title} onChange={(v) => set({ title: v })}
          onBlur={() => ready && !offered.length && suggest(false)} />
        <Input label={c.company} value={role.company} onChange={(v) => set({ company: v })}
          onBlur={() => ready && !offered.length && suggest(false)} />
        <Input label={c.loc} opt optLabel={c.opt} value={role.location} onChange={(v) => set({ location: v })} />
        <Input label={c.dept} opt optLabel={c.opt} value={role.department ?? ""} onChange={(v) => set({ department: v })} />
        <Input label={c.start} value={role.start} onChange={(v) => set({ start: v })} placeholder="Sep 2024" />
        <div>
          <Input label={c.end} value={role.end} onChange={(v) => set({ end: v })} placeholder="Jul 2026"
            disabled={/الآن|present/i.test(role.end)} />
          <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <input
              type="checkbox" checked={/الآن|present/i.test(role.end)}
              onChange={(e) => set({ end: e.target.checked ? (lang === "ar" ? "الآن" : "Present") : "" })}
            />
            {c.now}
          </label>
        </div>
      </div>

      {/* ── confirmed bullets: plain, reorderable, removable ── */}
      {role.bullets.length > 0 && (
        <div className="mt-4">
          <div className="bd-label">
            {c.onCv} · {room > 0 ? c.room(room) : ""}
            {room === 0 && <span style={{ color: "#fbbf24" }}> {c.full}</span>}
          </div>
          {role.bullets.map((b, i) => (
            <div key={`${i}-${b.slice(0, 12)}`} className="bd-confirmed">
              <span className="flex-1 text-xs leading-relaxed">{b}</span>
              <span className="flex gap-1">
                <IconBtn label="↑" disabled={i === 0}
                  onClick={() => dispatch({ t: "moveBullet", roleId: role.id!, from: i, to: i - 1 })} />
                <IconBtn label="↓" disabled={i === role.bullets.length - 1}
                  onClick={() => dispatch({ t: "moveBullet", roleId: role.id!, from: i, to: i + 1 })} />
                <IconBtn label="✕" onClick={() => dispatch({ t: "removeBullet", roleId: role.id!, index: i })} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── suggestions: visibly not yet part of the CV ── */}
      <div className="mt-4">
        <div className="bd-label">{c.suggested}</div>
        {!ready && <p className="text-xs" style={{ color: "var(--faint)" }}>{c.needBoth}</p>}

        {visible.map((it) => (
          <div key={it.id} className="bd-sug">
            <span className="bd-sug-badge">{it.source === "ai" ? c.aiBadge : c.packBadge}</span>
            <div className="flex-1">
              {editing?.id === it.id ? (
                <>
                  <textarea
                    className="bd-textarea" style={{ minHeight: 64 }} value={editing.text}
                    onChange={(e) => setEditing({ id: it.id, text: e.target.value })}
                  />
                  <div className="mt-1.5 flex gap-2">
                    <Pill label={c.save} onClick={() => {
                      dispatch({ t: "editItem", id: it.id, text: editing.text });
                      setEditing(null);
                    }} />
                    <Pill label={c.cancel} onClick={() => setEditing(null)} />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs leading-relaxed">{it.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Pill
                      label={c.add} primary disabled={room === 0}
                      onClick={() => {
                        dispatch({ t: "confirm", id: it.id });
                        track("builder_suggestion_accepted", { section: "experience", source: it.source });
                      }}
                    />
                    <Pill label={c.edit} onClick={() => setEditing({ id: it.id, text: it.text })} />
                    <Pill label={c.improve} onClick={() => rewrite(it, "bullet_improve")} />
                    <Pill label={c.shorter} onClick={() => rewrite(it, "bullet_shorter")} />
                    <Pill label={c.metric} onClick={() => askForFigure(it)} />
                    <Pill label={c.drop} onClick={() => dispatch({ t: "reject", id: it.id })} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {offered.length > 6 && !showAll && (
          <button onClick={() => setShowAll(true)} className="btn-ghost mt-2 rounded-full px-3 text-xs">
            {c.showMore} ({offered.length - 6})
          </button>
        )}

        {ready && (
          <button
            onClick={() => suggest(true)} disabled={busy}
            className="mt-3 flex items-center gap-2 rounded-full px-3 text-xs font-bold"
            style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.35)", color: "#93c5fd" }}
          >
            <AiOrb size={20} thinking={busy} />
            {busy ? c.busy : c.more}
          </button>
        )}
        {err && <p className="mt-2 text-xs" style={{ color: "#fca5a5" }}>{err}</p>}
      </div>

      {/* ── the figure question ── */}
      {ask && (
        <div className="mt-4 rounded-xl p-3" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.35)" }}>
          <div className="text-xs font-bold">{c.askTitle}</div>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{ask.question}</p>
          <input
            className="bd-input mt-2" value={ask.value} inputMode="numeric"
            onChange={(e) => setAsk({ ...ask, value: e.target.value })}
          />
          <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>{c.askHint}</p>
          <div className="mt-2 flex gap-2">
            <Pill label={c.save} primary onClick={applyFigure} />
            <Pill label={c.skip} onClick={() => { setAsk({ ...ask, value: "" }); applyFigure(); }} />
          </div>
        </div>
      )}

      <button
        onClick={() => dispatch({ t: "removeRole", id: role.id! })}
        className="mt-4 rounded-full px-3 text-xs"
        style={{ border: "1px solid var(--line)", color: "var(--faint)" }}
      >
        {c.remove}
      </button>
    </div>
  );
}

/* ───────────────────── small controls ───────────────────── */

function Input({
  label, value, onChange, onBlur, placeholder, opt, optLabel, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder?: string; opt?: boolean; optLabel?: string; disabled?: boolean;
}) {
  return (
    <label>
      <span className="bd-label">{label}{opt && <span className="bd-opt"> — {optLabel}</span>}</span>
      <input
        className="bd-input" value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
      />
    </label>
  );
}

function Pill({ label, onClick, primary, disabled }: {
  label: string; onClick: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="rounded-full px-2.5 text-[11px] font-semibold disabled:opacity-40"
      style={{ minHeight: 32, ...(primary
        ? { background: "var(--accent)", color: "#fff" }
        : { border: "1px solid var(--line)", color: "var(--muted)" }) }}
    >
      {label}
    </button>
  );
}

function IconBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      className="rounded-md px-1.5 text-[11px] disabled:opacity-25"
      style={{ minHeight: 28, border: "1px solid var(--line)", color: "var(--muted)" }}
    >
      {label}
    </button>
  );
}
