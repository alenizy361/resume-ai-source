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

import { useCallback, useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import BrandOrb from "../BrandOrb";
import { type Role } from "@/app/lib/resumeDoc";
import { findRolePack } from "@/app/lib/rolePacks";
import { useAiTask } from "./useAiTask";
import { useBuilder } from "./BuilderProvider";
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
    achieve: "Add an achievement", achieveAgain: "Ask me another",
    achieveHint: "One question at a time. Nothing is written until you answer it.",
    onCv: "On your CV", full: "This position is at its bullet limit — remove one to add another.",
    room: (n: number) => `${n} more can be added`,
    needBoth: "Add the job title and employer, and suggestions appear here.",
    save: "Save", cancel: "Cancel",
    askTitle: "One question, and the figure is yours — not ours",
    askHint: "Type the real number. Skip it and we write a strong line without one.",
    skip: "Skip — no figure",
    stop: "Stop",
    allKnown: "Everything it suggested is already on this job. Add an achievement below, or move on.",
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
    achieve: "أضف إنجازاً", achieveAgain: "اسألني سؤالاً آخر",
    achieveHint: "سؤال واحد كل مرة. لا يُكتب شيء قبل أن تجيبه.",
    onCv: "في سيرتك", full: "هذه الوظيفة بلغت حد المهام — احذف واحدة لتضيف أخرى.",
    room: (n: number) => `يمكن إضافة ${n} أخرى`,
    needBoth: "أضف المسمى وجهة العمل، وتظهر الاقتراحات هنا.",
    save: "حفظ", cancel: "إلغاء",
    askTitle: "سؤال واحد، والرقم رقمك — لا رقمنا",
    askHint: "اكتب الرقم الحقيقي. وإن تجاوزت، نكتب سطراً قوياً بلا رقم.",
    skip: "تجاوز — بلا رقم",
    stop: "أوقف",
    allKnown: "كل ما اقترحه موجود في هذه الوظيفة أصلاً. أضف إنجازاً أدناه، أو واصل.",
  },
};

/*
 * The transport used to live here: a `Throttled` error class, an `askSuggest` wrapper, a
 * `reason()` helper choosing between two sentences, and an abort ref rebuilt at four call
 * sites. All of it is `lib/aiTasks.ts` and `useAiTask` now — including the distinction this
 * section got right and the others did not, that a 429 is not an outage.
 *
 * What it gains by moving: a timeout (there was none, so a hung request span forever), a
 * cancel button, an `empty` state that no longer borrows the failure sentence, and the same
 * wording as every other section.
 */

export default function ExperienceSection({
  lang, cv, state, dispatch, target,
}: {
  /** The interface language — labels, buttons, hints. */
  lang: Lang;
  /**
   * The DOCUMENT's language — every duty, whether it comes from the pack or the model.
   *
   * Separate from `lang` because they are separate facts. An Arabic-speaking applicant
   * writing an English CV is the normal case in this market, and reading the interface
   * language here is exactly how Arabic duties ended up on English resumes.
   */
  cv: Lang;
  state: BuilderState;
  dispatch: React.Dispatch<{ t: string; [k: string]: unknown }>;
  target: BuilderState["target"];
}) {
  const c = C[lang];
  const roles = state.profile.roles || [];

  return (
    <div>
      {roles.map((r) => (
        <RoleCard key={r.id} role={r} lang={lang} cv={cv} state={state} dispatch={dispatch} target={target} />
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
  role, lang, cv, state, dispatch, target,
}: {
  role: Role; lang: Lang; cv: Lang; state: BuilderState;
  dispatch: React.Dispatch<{ t: string; [k: string]: unknown }>;
  target: BuilderState["target"];
}) {
  const c = C[lang];
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [ask, setAsk] = useState<{ id: string; question: string; shape: string; value: string } | null>(null);

  /*
   * One hook for four tasks, because the user does one thing at a time and this section
   * shows one status line. `ai.task` says which of the four the line is about, so the right
   * button gets the spinner.
   */
  const ai = useAiTask(lang);

  /*
   * The combined generation, replacing four separate ones.
   *
   * This role used to cost `duties_draft`, then `duty_metric_ask` for every achievement, then
   * `duty_improve` or `duty_shorter` per line — four kinds of question about one job, each
   * re-sending the same context and re-deriving the same occupation. `experience_package`
   * answers all four at once and the answer is stored on the resume, so the achievement
   * questions and the improvements are already here when the user reaches for them.
   *
   * `instance: role.id` is what keeps two jobs from overwriting each other's package — a bug
   * `ops/callflow.test.mjs` caught before this was wired to anything.
   */
  const { gen } = useBuilder();
  /*
   * `current` is in the key because it is in the request: `payload.experience.current` is
   * `!role.end.trim()`, and it decides the tense of every suggested duty — a job you still hold is
   * described in the present, one you left in the past. The key had no end date in it, so filling one
   * in on a role whose duties were already generated left the cache serving the present-tense set,
   * and the fix a user would reach for — regenerate — returned exactly the same lines.
   *
   * The boolean, not the date: two different end dates produce the same past tense, and keying on the
   * raw date would throw away a valid cache entry every time somebody corrected a month.
   */
  const pkgInput = useMemo(() => ({
    title: role.title, department: role.department ?? "", company: role.company,
    tools: role.bullets.length, bullets: role.bullets, target: target.title,
    current: !role.end.trim(),
  }), [role.title, role.department, role.company, role.bullets, target.title, role.end]);
  const pkg = gen.peek("experience_package", pkgInput, role.id);
  /* Memoised because a fresh `[]` on every render would change the identity of every callback
     that depends on it, which is a re-render loop wearing a helpful disguise. */
  const pkgQuestions = useMemo(
    () => (Array.isArray(pkg?.achievementQuestions) ? pkg.achievementQuestions as string[] : []),
    [pkg],
  );
  const pkgImproved = useMemo(
    () => (Array.isArray(pkg?.improvedUserBullets)
      ? pkg.improvedUserBullets as Array<{ original: string; improved: string }>
      : []),
    [pkg],
  );
  /* Which achievement question to ask next. Walking the list rather than re-asking the model is
     the whole point of getting five of them in one response. */
  const [askedCount, setAskedCount] = useState(0);
  /*
   * "The model answered, and every line it gave is already here."
   *
   * The old code reported this with the generic failure sentence, so a user whose CV was
   * simply complete for this job was told the assistant was busy. It is not a failure and
   * not the layer's `empty` either — the CALL succeeded and returned content; the dedupe
   * against confirmed, pending and rejected lines is what emptied it. So it is this
   * section's own state, with its own sentence.
   */
  const [deduped, setDeduped] = useState(false);

  const set = (patch: Partial<Role>) => dispatch({ t: "role", id: role.id!, patch });
  const offered = pending(state, "experience", role.id);
  const room = bulletRoom(role);
  const ready = role.title.trim().length > 1 && role.company.trim().length > 0;

  /** Seed instantly from the cached pack, then top up from the model on demand. */
  const suggest = useCallback(async (fromModel: boolean) => {
    const seen = {
      confirmed: role.bullets,
      pending: offered,
      rejected: rejected(state, "experience").filter((i) => i.roleId === role.id),
    };

    if (!fromModel) {
      const pack = findRolePack(role.title);
      if (!pack) return;
      const fresh = filterFresh(pack.duties.map((d) => d[cv]), seen);
      if (!fresh.length) return;
      dispatch({
        t: "offer",
        items: fresh.map((text) => newItem({
          section: "experience", type: "duty", text, roleId: role.id,
          source: "occupation", sourceRef: pack.slug,
          reason: lang === "ar" ? "شائع في هذا المسمى" : "common for this job title",  // a hint the user reads
        })),
      });
      return;
    }

    const out = await gen.run({
      task: "experience_package",
      instance: role.id,
      input: pkgInput,
      payload: {
        experience: {
          title: role.title, department: role.department, industry: target.industry,
          userBullets: role.bullets,
          /* "Currently working here" is expressed as an empty end date, not as a flag — that is
             how `Role` has always modelled it and how `rolesToLines` renders it. */
          current: !role.end.trim(),
        },
        themes: [],
      },
    });
    const duties = Array.isArray(out.data?.responsibilitySuggestions)
      ? out.data.responsibilitySuggestions as string[]
      : null;
    if (!duties) return;
    const r = { state: "success" as const, data: duties };
    if (r.state !== "success" || !Array.isArray(r.data)) return;
    // Everything the model returned may already be on the CV, pending, or previously
    // rejected — in which case there is nothing new to offer, which is `empty` and not a
    // failure. `setDeduped` records that so the line below can say so.
    const fresh = filterFresh(r.data as string[], seen);
    if (!fresh.length) { setDeduped(true); return; }
    setDeduped(false);
    dispatch({
      t: "offer",
      items: fresh.map((text) => newItem({
        section: "experience", type: "duty", text, roleId: role.id,
        source: "ai", reason: lang === "ar" ? "مبني على مسماك وجهة عملك" : "based on your title and employer",
      })),
    });
    track("builder_suggestions_shown", { section: "experience", n: fresh.length });
  }, [gen, pkgInput, role, offered, state, lang, cv, target, dispatch]);

  /** Rewrite one pending suggestion in place. */
  const rewrite = useCallback(async (it: Item, task: "duty_improve" | "duty_shorter") => {
    /*
     * The package already improved every line the user WROTE, so Improve on one of those is free.
     *
     * Only "improve" — not "shorter". A shorter version is a different request with a different
     * constraint, and serving the package's improvement for it would answer a question nobody
     * asked. Refinements the package cannot cover still go to /api/suggest, which is correct:
     * they are explicit single-line actions on content that did not exist when the package was
     * generated.
     */
    if (task === "duty_improve") {
      const hit = pkgImproved.find((p) => p.original.trim().toLowerCase() === it.text.trim().toLowerCase());
      if (hit) { dispatch({ t: "editItem", id: it.id, text: hit.improved }); return; }
    }
    const r = await ai.run(task, {
      cvLang: cv, targetRole: target.title || role.title,
      role: role.title, company: role.company, current: it.text, jobAd: target.jobAdText,
    });
    if (r.state === "success" && typeof r.data === "string") {
      dispatch({ t: "editItem", id: it.id, text: r.data });
    }
  }, [ai, pkgImproved, role, cv, target, dispatch]);

  /**
   * The metric path. The model returns the QUESTION and the sentence shape — never
   * a figure — and the user supplies the value. This is the no-invented-numbers
   * rule expressed as an interaction rather than as a refusal.
   */
  const askForFigure = useCallback(async (it: Item) => {
    const r = await ai.run("duty_metric_ask", {
      cvLang: cv, targetRole: target.title || role.title,
      role: role.title, company: role.company, current: it.text,
    });
    // The parser refuses an answer with no question — a rewritten line and no question is
    // the model supplying the number itself — so reaching here means there IS one.
    if (r.state === "success" && r.data) {
      const d = r.data as { question: string; rewritten: string };
      setAsk({ id: it.id, question: d.question, shape: d.rewritten || it.text, value: "" });
      track("builder_metric_asked", {});
    }
  }, [ai, role, cv, target]);

  /**
   * The achievement extractor — the same machinery, aimed at the role instead of at
   * one bullet.
   *
   * A CV gets its strength from achievements, and an achievement needs a figure only
   * the user has. The chat asked for those in prose and got prose back. Here the model
   * is asked for the QUESTION (bullet_metric, which is forbidden digits at the server)
   * seeded from everything already confirmed on this job, so it asks about work the
   * user actually does. One question, one number, one new line — repeatable.
   *
   * `id: ""` marks the answer as a NEW bullet rather than an edit of an existing one.
   */
  const askForAchievement = useCallback(async () => {
    /*
     * Five achievement questions arrived with the package. Ask them one at a time, for free.
     *
     * This is Part 5 of the cost brief expressed as an interaction: collect the answers first,
     * generate later. The old shape called the model once per achievement — five questions, five
     * paid calls, all about the same job — and the questions it produced were no better for
     * having been asked separately.
     *
     * The fallback below still exists for a role whose package has no questions left, which is
     * the case after the user has worked through all five.
     */
    const next = pkgQuestions[askedCount];
    if (next) {
      setAskedCount((n) => n + 1);
      setAsk({ id: "", question: next, shape: "", value: "" });
      track("builder_achievement_asked", { source: "package" });
      return;
    }
    const r = await ai.run("duty_metric_ask", {
      cvLang: cv, targetRole: target.title || role.title,
      role: role.title, company: role.company,
      current: role.bullets.join("\n") || role.title,
      jobAd: target.jobAdText,
    });
    if (r.state === "success" && r.data) {
      const d = r.data as { question: string; rewritten: string };
      setAsk({ id: "", question: d.question, shape: d.rewritten || "", value: "" });
      track("builder_achievement_asked", { source: "model" });
    }
  }, [ai, askedCount, pkgQuestions, role, cv, target]);

  const applyFigure = () => {
    if (!ask) return;
    const v = ask.value.trim();
    // No figure given ⇒ keep the strong non-quantified line. Never pressure.
    const text = v ? ask.shape.replace(/_{2,}/, v) : ask.shape.replace(/\s*_{2,}\s*/, " ").replace(/\s{2,}/g, " ").trim();
    if (!text.trim()) { setAsk(null); return; }
    if (ask.id) {
      dispatch({ t: "editItem", id: ask.id, text });
    } else {
      // A brand new line, offered rather than added: the figure is the user's, but the
      // wording around it is still the model's, so it goes through the same accept step
      // as every other suggestion.
      dispatch({
        t: "offer",
        items: [newItem({
          section: "experience", type: "duty", text, roleId: role.id,
          source: "ai", reason: lang === "ar" ? "من إجابتك عن السؤال" : "from the figure you gave",
        })],
      });
    }
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
            {room === 0 && <span style={{ color: "var(--warn)" }}> {c.full}</span>}
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

        {/*
          The rows are wrapped rather than staggered where they sit, because `t-stagger` addresses
          EVERY child of its container — un-wrapped, the section label and the "fill both fields
          first" line would have been given animation delays as well, and the label would have
          arrived 60ms after the heading it belongs to.
        */}
        <div className="t-stagger t-materialize">
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
                    <Pill label={c.improve} onClick={() => rewrite(it, "duty_improve")} />
                    <Pill label={c.shorter} onClick={() => rewrite(it, "duty_shorter")} />
                    <Pill label={c.metric} onClick={() => askForFigure(it)} />
                    <Pill label={c.drop} onClick={() => {
                      dispatch({ t: "reject", id: it.id });
                      // Dismissals are the honest half of the acceptance rate: a
                      // section where nine in ten suggestions are dropped is a
                      // section whose prompt is wrong, and nothing else reports that.
                      track("builder_suggestion_rejected", { section: "experience", source: it.source });
                    }} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        </div>

        {offered.length > 6 && !showAll && (
          <button onClick={() => setShowAll(true)} className="btn-ghost mt-2 rounded-full px-3 text-xs">
            {c.showMore} ({offered.length - 6})
          </button>
        )}

        {ready && (
          <button
            onClick={ai.busy ? ai.cancel : () => suggest(true)}
            className={`t-tap mt-3 flex items-center gap-2 rounded-full px-3 text-xs font-bold${
              ai.busy ? " t-busy" : ""}`}
            style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.35)", color: "var(--info)" }}
          >
            <BrandOrb variant="button" size={20} busy={ai.busy && ai.task === "duties_draft"} />
            {ai.busy ? c.stop : c.more}
          </button>
        )}
        {ready && (
          <>
            <button
              onClick={askForAchievement} disabled={ai.busy}
              className="t-tap ms-2 mt-3 rounded-full px-3 text-xs font-bold"
              style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.35)", color: "#6ee7b7" }}
            >
              {c.achieve}
            </button>
            <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>{c.achieveHint}</p>
          </>
        )}
        {/* One line for all four tasks and all five states, worded by the hook — plus the
            one state only this section has, where the answer arrived and was entirely
            duplicates. */}
        {(ai.message || deduped) && (
          <p
            className="mt-2 text-xs leading-relaxed"
            style={{ color: ai.state === "loading" ? "var(--muted)" : ai.throttled ? "var(--warn)" : (deduped || ai.state === "empty") ? "var(--faint)" : "var(--danger)" }}
          >
            {ai.message || c.allKnown}
          </p>
        )}
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
            {!ask.id && <Pill label={c.achieveAgain} onClick={askForAchievement} />}
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
      className="t-tap rounded-full px-2.5 text-[11px] font-semibold disabled:opacity-40"
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
      className="t-tap rounded-md px-1.5 text-[11px] disabled:opacity-25"
      style={{ minHeight: 28, border: "1px solid var(--line)", color: "var(--muted)" }}
    >
      {label}
    </button>
  );
}
