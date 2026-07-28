"use client";

/**
 * The four form sections that used to be declared inside `Builder.tsx`, with the framing
 * taken off.
 *
 * Each one now renders its FIELDS and nothing else — no section heading, no locked
 * state, no Continue button. That is the whole point: the long scrolling page wraps them
 * in `SectionShell`, and each step route wraps them in a page. Two surfaces, one form.
 *
 * Getting this wrong would have been easy and expensive. Copying the target-job fields
 * into a step route would have produced two job-title inputs, two `/api/fetch-job`
 * callers and two sets of Arabic labels to keep in sync — the "duplicated business
 * logic" the root-cause audit found three times over. So the sections moved out whole,
 * unchanged apart from losing the wrapper they no longer own.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useJustArrived } from "./useJustArrived";
import { track } from "@vercel/analytics";

import { type BuilderState, type Item, newItem, pending } from "@/app/lib/builderDoc";
import { findRolePack } from "@/app/lib/rolePacks";
import { toArabicDigits } from "@/app/lib/plans";
import { type Action } from "./builderState";
import ImportPanel from "./ImportPanel";
import BlueprintStrip from "./BlueprintStrip";
import OccupationClarify from "./OccupationClarify";
import SuggestionChip from "./SuggestionChip";
import { sharedWhy } from "@/app/lib/provenance";

/** What every section needs and nothing more: who is reading, and the document. */
export interface Common {
  lang: "ar" | "en";
  state: BuilderState;
  dispatch: React.Dispatch<Action>;
}

/** The entry-point copy. Lives here because `StartCards` is the only thing that uses it. */
const C_EN = {
  newCv: "Build a new CV",
  newCvSub: "Step by step. AI suggests skills and responsibilities for your profession — you approve everything.",
  upCv: "Upload and improve my CV",
  upCvSub: "We read your file, score it, and rewrite it without inventing anything.",
};
const C_AR = {
  newCv: "أنشئ سيرة جديدة",
  newCvSub: "خطوة بخطوة. الذكاء يقترح المهارات والمهام لمهنتك — وأنت تعتمد كل شيء.",
  upCv: "ارفع سيرتي وحسّنها",
  upCvSub: "نقرأ ملفك، نقيّمه، ونعيد صياغته دون اختلاق أي شيء.",
};

export function Field({
  label, opt, value, onChange, placeholder, type = "text", optLabel,
}: {
  label: string; opt?: boolean; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; optLabel: string;
}) {
  return (
    <label>
      <span className="bd-label">
        {label}{opt && <span className="bd-opt"> — {optLabel}</span>}
      </span>
      <input
        className="bd-input" type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* ───────────────────────── sections ───────────────────────── */

export function StartCards(p: Common & {
  onPicked: () => void;
  /*
   * "Build a new CV" — distinct from `onPicked`. Continuing a draft or opening the importer both
   * proceed into WHATEVER context already exists; starting fresh has to first make a genuinely new,
   * empty draft exist (a fresh id, written as the newest record) before there is anywhere to proceed
   * INTO. Only `BuilderStart.tsx` — which owns `owner`/the router/`newResumeId` — can do that, so it
   * is a separate callback rather than folded into `onPicked` with an `entry` flag `onPicked` would
   * have to branch on.
   */
  onNew: () => void;
  openImport?: boolean;
  /**
   * Whose browser this is, as `resumeStore.ownerKey` computes it, or `""` while the answer is still in
   * flight. Only this one of the `Common` components needs it — it renders `ImportPanel`, which lists
   * previously saved CVs, and that list is owner-scoped (`lib/personalStore.ts`). It is a prop here
   * rather than a field on `Common` so the four sections that store nothing personal are not made to
   * carry an owner they have no use for.
   */
  owner: string;
}) {
  /*
   * `openImport` is how the home page's "I already have a CV" card arrives here.
   *
   * That card used to link to `/optimize` — a separate three-step tool with its own state, its own
   * preview and its own export path — so the visitor who pressed the most popular button left the
   * product they had just chosen and could not continue building in the form afterwards. It now
   * links to `/builder?entry=upload`, and this opens the importer on arrival so the visitor sees a
   * file picker rather than having to find the same card a second time.
   */
  const [showImport, setShowImport] = useState(Boolean(p.openImport));
  const ar = p.lang === "ar";
  const C = ar ? C_AR : C_EN;
  return (
    <>
      <div className="bd-grid two">
        <button
          className="card card-hover t-lift t-tap p-4 text-start"
          onClick={p.onNew}
        >
          <div className="text-sm font-bold">{C.newCv}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{C.newCvSub}</div>
        </button>
        {/*
          Upload used to be a LINK to /optimize — a different engine, a different state, a different
          export path — while a working in-builder importer sat directly underneath it. So the card
          most people with a CV would press was the one that took them out of the product they had
          just chosen, and the correct path was the third thing on the page.

          It now opens the importer that was already there. `/optimize` still exists and still has its
          own traffic; it is simply no longer the builder's front door for a file.
        */}
        <button
          className="card card-hover t-lift t-tap p-4 text-start"
          onClick={() => {
            setShowImport(true);
            track("builder_entry_selected", { entry: "upload" });
          }}
        >
          <div className="text-sm font-bold">{C.upCv}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{C.upCvSub}</div>
        </button>
      </div>

      {/*
        Revealed by the card rather than always visible.

        Three entry points competing on one screen is why the good one was being missed — a file
        picker sitting under two large choices reads as a footnote to them. One decision first, then
        the thing that decision needs.
      */}
      {showImport && (
        <ImportPanel
          lang={p.lang}
          owner={p.owner}
          onImport={(cv) => {
            p.dispatch({ t: "import", cv, lang: p.lang });
            p.dispatch({ t: "entry", v: "upload" });
            p.onPicked();
          }}
        />
      )}
    </>
  );
}

export function TargetFields(p: Common) {
  const ar = p.lang === "ar";
  const L = ar
    ? { title: "المسمى الوظيفي", level: "مستوى الخبرة", langq: "لغة السيرة", ind: "المجال",
        country: "الدولة", city: "المدينة", emp: "جهة العمل المستهدفة", opt: "اختياري",
        jd: "وصف الوظيفة", jdWhy: "أضف وصف الوظيفة لنطابق سيرتك مع متطلبات صاحب العمل الحقيقية.",
        jdPh: "الصق نص الإعلان هنا…",
        url: "أو الصق رابط الإعلان", urlPh: "https://…", fetch: "اقرأ الرابط",
        fetching: "يقرأ…", got: (n: number) => `قرأنا ${toArabicDigits(n)} حرفاً من الإعلان — راجعه أدناه وعدّله إن لزم.`,
        levels: ["مبتدئ", "متوسط", "أول/خبير", "قيادي"] }
    : { title: "Job title", level: "Experience level", langq: "CV language", ind: "Industry",
        country: "Country", city: "City", emp: "Target employer", opt: "optional",
        jd: "Job description", jdWhy: "Add the job description to match your CV to the employer's real requirements.",
        jdPh: "Paste the advert's text here…",
        url: "Or paste the posting's link", urlPh: "https://…", fetch: "Read the link",
        fetching: "Reading…", got: (n: number) => `Read ${n} characters from the posting — check it below and edit if needed.`,
        levels: ["Entry", "Mid", "Senior", "Lead"] };
  const set = (patch: Partial<BuilderState["target"]>) => p.dispatch({ t: "target", patch });

  /*
   * Paste a link instead of a posting.
   *
   * On a phone, copying a whole advert out of a job board is the step where people
   * give up — and without the advert there is no match score, so the most valuable
   * part of the review is gated behind the most annoying piece of typing. /api/fetch-job
   * already existed for the upload flow, SSRF-guarded and rate-limited; this just gives
   * the builder the same door.
   *
   * The fetched text lands in the SAME textarea the user could have typed into, visible
   * and editable. A job page carries navigation and boilerplate along with the advert,
   * and the honest handling of that is to show what was read rather than to hide it and
   * quietly score against menu items.
   */
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [got, setGot] = useState(0);
  const readLink = async () => {
    const url = p.state.target.jobAdUrl.trim();
    if (!url || busy) return;
    setErr(""); setGot(0); setBusy(true);
    try {
      const res = await fetch("/api/fetch-job", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      // The route's own message is the useful one — it distinguishes "the site blocks
      // bots" from "that is not a link", and both have different next actions.
      if (!res.ok || !data?.text) throw new Error(String(data?.error || "Couldn't read that link."));
      set({ jobAdText: String(data.text) });
      setGot(String(data.text).length);
      track("builder_jd_fetched", { chars: String(data.text).length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read that link.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="bd-grid two">
        <Field label={L.title} value={p.state.target.title} onChange={(v) => set({ title: v })}
          placeholder={ar ? "أخصائي أشعة" : "Radiology Technologist"} optLabel={L.opt} />
        {/* Directly under the title, because that is the field it is about. A question that appears
            at the bottom of a form reads as being about the form. */}
        <div className="sm:col-span-2"><OccupationClarify /></div>
        <label>
          <span className="bd-label">{L.level}</span>
          <select className="bd-input" value={p.state.target.level} onChange={(e) => set({ level: e.target.value })}>
            <option value="">—</option>
            {L.levels.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label>
          <span className="bd-label">{L.langq}</span>
          <select
            className="bd-input" value={p.state.target.language}
            onChange={(e) => set({ language: e.target.value as "en" | "ar" | "both" })}
          >
            {/*
              The reader's own language is listed FIRST, because it is now also the default for a new
              draft — a list whose first option is not the selected one reads as if the default were
              chosen at random.

              Labelled honestly either way: the PDF export cannot shape Arabic script, so an Arabic
              CV downloads as Word plus a rendered PDF rather than a text PDF.
            */}
            {(ar ? ["ar", "en"] : ["en", "ar"]).map((code) => (
              <option key={code} value={code}>
                {code === "en"
                  ? (ar ? "الإنجليزية — PDF + Word" : "English — PDF + Word")
                  : (ar ? "العربية — Word + PDF مصمّم" : "Arabic — Word + designed PDF")}
              </option>
            ))}
            <option value="both">{ar ? "كلاهما" : "Both"}</option>
          </select>
        </label>
        <Field label={L.ind} opt value={p.state.target.industry} onChange={(v) => set({ industry: v })} optLabel={L.opt} />
        <Field label={L.country} opt value={p.state.target.country} onChange={(v) => set({ country: v })} optLabel={L.opt} />
        <Field label={L.city} opt value={p.state.target.city} onChange={(v) => set({ city: v })} optLabel={L.opt} />
      </div>
      <div className="mt-3">
        <span className="bd-label">{L.jd} <span className="bd-opt">— {L.opt}</span></span>
        <textarea
          className="bd-textarea" value={p.state.target.jobAdText}
          onChange={(e) => set({ jobAdText: e.target.value })}
          placeholder={L.jdPh}
        />
        <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>{L.jdWhy}</p>

        <div className="mt-3">
          {/* A real label bound by htmlFor, not a styled span: the input sits beside a
              button, so it cannot be wrapped, and an unassociated caption is invisible
              to a screen reader. */}
          <label className="bd-label" htmlFor="bd-jd-url">
            {L.url} <span className="bd-opt">— {L.opt}</span>
          </label>
          <div className="flex gap-2">
            <input
              id="bd-jd-url"
              className="bd-input" type="url" inputMode="url" dir="ltr"
              value={p.state.target.jobAdUrl} placeholder={L.urlPh}
              onChange={(e) => set({ jobAdUrl: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); readLink(); } }}
            />
            <button
              onClick={readLink} disabled={busy || !p.state.target.jobAdUrl.trim()}
              className="rounded-xl px-3 text-xs font-bold disabled:opacity-40"
              style={{ border: "1px solid var(--line)", color: "var(--muted)", whiteSpace: "nowrap" }}
            >
              {busy ? L.fetching : L.fetch}
            </button>
          </div>
          {got > 0 && <p className="mt-1.5 text-xs" style={{ color: "#6ee7b7" }}>{L.got(got)}</p>}
          {err && <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{err}</p>}
        </div>
      </div>
    </>
  );
}

export function PersonalFields(p: Common) {
  const ar = p.lang === "ar";
  const [openExtra, setOpenExtra] = useState(false);
  const L = ar
    ? { name: "الاسم الكامل", title: "المسمى المهني", city: "المدينة", country: "الدولة",
        phone: "الجوال", email: "البريد", li: "LinkedIn", pf: "الأعمال/Portfolio",
        opt: "اختياري", more: "تفاصيل إضافية يتوقعها بعض أصحاب العمل في الخليج",
        nat: "الجنسية", visa: "حالة الإقامة",
        why: "هذه الحقول اختيارية تماماً — أضفها فقط إن كان سوقك يتوقعها." }
    : { name: "Full name", title: "Professional title", city: "City", country: "Country",
        phone: "Mobile", email: "Email", li: "LinkedIn", pf: "Portfolio",
        opt: "optional", more: "Extra details some Gulf employers expect",
        nat: "Nationality", visa: "Visa / Iqama status",
        why: "Entirely optional — add them only if your market expects them." };
  const set = (patch: Partial<BuilderState["personal"]>) => p.dispatch({ t: "personal", patch });
  const v = p.state.personal;

  return (
    <>
      <div className="bd-grid two">
        <Field label={L.name} value={v.fullName} onChange={(x) => set({ fullName: x })} optLabel={L.opt} />
        <Field label={L.title} value={v.professionalTitle} onChange={(x) => set({ professionalTitle: x })} optLabel={L.opt} />
        <Field label={L.city} value={v.city} onChange={(x) => set({ city: x })} optLabel={L.opt} />
        <Field label={L.country} value={v.country} onChange={(x) => set({ country: x })} optLabel={L.opt} />
        <Field label={L.phone} type="tel" value={v.phone} onChange={(x) => set({ phone: x })} optLabel={L.opt} />
        <Field label={L.email} type="email" value={v.email} onChange={(x) => set({ email: x })} optLabel={L.opt} />
        <Field label={L.li} opt value={v.linkedin} onChange={(x) => set({ linkedin: x })} optLabel={L.opt} />
        <Field label={L.pf} opt value={v.portfolio} onChange={(x) => set({ portfolio: x })} optLabel={L.opt} />
      </div>

      {/* Collapsed by default: a Saudi employer often expects these, and plenty of
          applicants would rather not state them. Asking quietly beats forcing or
          omitting. */}
      <button
        onClick={() => setOpenExtra((o) => !o)}
        className="mt-3 rounded-full px-3 text-xs font-semibold"
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        {openExtra ? "▾" : "▸"} {L.more}
      </button>
      {openExtra && (
        <div className="mt-3">
          <div className="bd-grid two">
            <Field label={L.nat} opt value={v.nationality ?? ""} onChange={(x) => set({ nationality: x })} optLabel={L.opt} />
            <Field label={L.visa} opt value={v.visaStatus ?? ""} onChange={(x) => set({ visaStatus: x })} optLabel={L.opt} />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{L.why}</p>
        </div>
      )}
    </>
  );
}

/* ───────────────────── blueprint ───────────────────── */

/** Hoisted: declaring a component inside a render creates a new type every pass. */
export function ChipRow({ head, items }: { head: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="bd-label">{head}</div>
      <div className="bd-chips">
        {items.map((x) => <span key={x} className="bd-chip" style={{ cursor: "default" }}>{x}</span>)}
      </div>
    </div>
  );
}

/**
 * What the product knows about this job, shown the instant the title is entered.
 *
 * Read-only on purpose. It is not a place to accept anything — it is the answer to
 * "does this thing understand my profession?", which a user asks before they are
 * willing to spend ten minutes filling a form. Confirmation happens later, in the
 * sections that own each kind of content.
 */
export function BlueprintBody(p: Common) {
  const ar = p.lang === "ar";
  const L = ar
    ? { none: "اكتب المسمى الوظيفي أعلاه وسيظهر هنا ما نعرفه عن المهنة فوراً.",
        alsoKnown: "مسميات أخرى", groups: "مهارات وأنظمة شائعة", duties: "مهام معتادة",
        creds: "شهادات ورخص محتملة", nothingYet: "لا شيء من هذا في سيرتك بعد — تختار أنت في الأقسام التالية.",
        generic: "لا توجد حزمة جاهزة لهذا المسمى — سنعتمد على الذكاء الاصطناعي في الأقسام التالية." }
    : { none: "Enter a job title above and what we know about the profession appears here instantly.",
        alsoKnown: "Also known as", groups: "Common skills & systems", duties: "Typical responsibilities",
        creds: "Possible licences & certifications", nothingYet: "None of this is in your CV yet — you choose, in the sections below.",
        generic: "No cached pack for this title — the AI will suggest in the sections below." };

  const pack = useMemo(() => findRolePack(p.state.target.title), [p.state.target.title]);

  /*
   * Seeding moved to `BuilderProvider`. It was here, and here only runs when THIS step is on
   * screen — which on a long page meant always and on a route means only if the user visits
   * `/builder/<id>/blueprint`. Anyone who skipped it found the skills step empty.
   *
   * What stays is the analytics event, which genuinely is about this view being seen.
   */
  const seen = useRef("");
  useEffect(() => {
    if (pack && seen.current !== pack.slug) {
      seen.current = pack.slug;
      track("builder_blueprint_shown", { pack: pack.slug });
    }
  }, [pack]);

  if (!p.state.target.title.trim()) {
    return <><p className="text-xs" style={{ color: "var(--faint)" }}>{L.none}</p></>;
  }
  if (!pack) {
    return (
      <>
        <p className="text-xs" style={{ color: "var(--faint)" }}>{L.generic}</p>
      </>
    );
  }

  return (
    <>
      <div className="card p-4">
        <div className="text-sm font-bold">{pack.title[p.lang]}</div>
        {pack.aliases.length > 0 && (
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {L.alsoKnown}: {pack.aliases.slice(0, 5).join(" · ")}
          </div>
        )}
        {pack.groups.map((g) => <ChipRow key={g.label.en} head={g.label[p.lang]} items={g.items.map((i) => i[p.lang])} />)}
        <div className="mt-3">
          <div className="bd-label">{L.duties}</div>
          <ul className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
            {pack.duties.slice(0, 6).map((d) => <li key={d.en}>• {d[p.lang]}</li>)}
          </ul>
        </div>
        <ChipRow head={L.creds} items={pack.credentials.map((c) => c.title[p.lang])} />
        <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>{L.nothingYet}</p>
      </div>
    </>
  );
}

/* ───────────────────── skills ───────────────────── */

/**
 * Grouped chips, none pre-selected.
 *
 * The grouping is the usable part: a flat list of twenty-three radiology terms is
 * unreadable, and "Modalities / Systems / Clinical & Safety" is how someone in the
 * field already thinks. Nothing starts selected because the product must not assume
 * every radiographer runs MRI or administers contrast.
 */
export function SkillsBody(p: Common) {
  const ar = p.lang === "ar";
  /*
   * THREE messages where there used to be one, and that conflation was the production bug.
   *
   * `none` was shown whenever this step had no suggestions and no confirmed skills — and it said
   * "Enter a job title first", which is a claim about a DIFFERENT thing. Suggestions are seeded from
   * `findRolePack`, and there are seven role packs, so every job title outside those seven produced
   * zero suggestions and this step told the user to enter the title they had already entered while
   * Target Job displayed a tick beside it.
   *
   *   missingTarget  the target genuinely is not there — the only case that may say so
   *   nothingYet     the target is fine and no suggestions exist yet, which is not an error
   *   failed         a generation was attempted and did not work
   */
  const L = ar
    ? {
      nothingYet: "لا توجد مهارات مقترحة بعد. اطلبها بالذكاء أو أضِفها بنفسك.",
      chosen: "في سيرتك", tapToAdd: "انقر لإضافتها لسيرتك",
    }
    : {
      nothingYet: "No suggested skills yet. Ask the AI, or add your own.",
      chosen: "In your CV", tapToAdd: "Tap to add to your CV",
    };

  const offered = pending(p.state, "skills");
  const chosen = String(p.state.profile.skills || "").split(/[,،]/).map((x) => x.trim()).filter(Boolean);
  /* Skills have no ids — the text IS the identity, which is also how `removeSkill` addresses them. */
  const arrivedSkills = useJustArrived(chosen);

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of offered) {
      const k = it.group || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return [...m.entries()];
  }, [offered]);

  /*
   * The occupations `rolePacks.ts` does not have.
   *
   * A recognised title fills this stage instantly, offline and free — that is what the hand-written
   * packs are for and it is why this section has never made a model call. An UNRECOGNISED title got
   * nothing at all, which is most titles, and "Enter a job title first" was shown to someone who
   * had entered one.
   *
   * The blueprint fills that gap and costs nothing extra: credentials and languages already read
   * it, so by the time a user reaches skills it usually exists. Offered here as `source: "ai"` so
   * the provenance stays honest about which suggestions a person wrote and which a model did.
   */
  const gap = (
    <BlueprintStrip
      field="skillGroups"
      section="skills"
      onPick={(text) => {
        /*
         * Offered then confirmed, in two dispatches, rather than written straight in as confirmed.
         *
         * Not ceremony. `confirm` is the audited path into `profile` — it is where the skill is
         * normalised, de-duplicated against what is already there, and where the invariant that
         * `profile` holds only confirmed content is actually maintained. A "confirmed" item created
         * directly in the suggestion bag would be a second path into the document, which is the one
         * thing `builderDoc.ts` exists to prevent.
         */
        const item = newItem({ section: "skills", type: "skill", text, source: "ai" });
        p.dispatch({ t: "offer", items: [item] });
        p.dispatch({ t: "confirm", id: item.id });
        track("builder_suggestion_accepted", { section: "skills", source: "ai" });
      }}
    />
  );

  /*
   * The missing-prerequisite banner used to live here, as a special case for this one section.
   *
   * It has moved to `StepGate`, above every step's content. Fixing it only here fixed one screen and
   * left the other ten to solve the same problem their own way — which is how this product ended up
   * with one section saying "the assistant is busy" for an empty answer and another saying nothing at
   * all. What is left in this file is the honest EMPTY state, which is a different thing entirely:
   * the step has what it needs and has nothing to show yet.
   */
  if (!offered.length && !chosen.length) {
    return (
      <>
        <p className="text-xs" style={{ color: "var(--faint)" }}>{L.nothingYet}</p>
        {gap}
      </>
    );
  }

  return (
    <>
      {chosen.length > 0 && (
        <div className="mb-4">
          <div className="bd-label">{L.chosen}</div>
          <div className="bd-chips">
            {/* A tapped suggestion lands here. The chip that was tapped is gone by the time any
                animation on it could run — measured — so the acknowledgement is on the arrival. */}
            {chosen.map((x) => (
              <span key={x} className={`bd-chip on${arrivedSkills.has(x) ? " t-land" : ""}`}>
                {x}
                {/* Confirmed skills had no way off the CV. Importing a dozen at once made
                    that impossible to ignore. */}
                <button
                  onClick={() => p.dispatch({ t: "removeSkill", text: x })}
                  aria-label={`remove ${x}`}
                  style={{ minHeight: 0, lineHeight: 1, color: "var(--faint)", fontSize: 12 }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{L.tapToAdd}</p>
      {groups.map(([label, items]) => {
        /*
         * One provenance line for the group when every chip in it would say the same thing, and
         * per-chip buttons only when they would not.
         *
         * A group is uniform in the ordinary case — a role pack fills it, or the blueprint does —
         * and twenty-five identical "why" buttons was what that looked like on a phone. It stops
         * being uniform exactly when it matters: after a CV import, some skills are the user's own
         * and some are suggestions, and then each chip answers for itself.
         */
        const shared = sharedWhy(items, p.lang);
        return (
        <div key={label} className="mt-3">
          {label && <div className="bd-label">{label}</div>}
          {shared && <p className="bd-why-note mb-1.5 text-xs">{shared}</p>}
          <div className="bd-chips t-stagger t-materialize">
            {items.map((it) => (
              <SuggestionChip
                key={it.id}
                text={it.text}
                lang={p.lang}
                source={it.source}
                reason={it.reason}
                showWhy={!shared}
                onAdd={() => {
                  p.dispatch({ t: "confirm", id: it.id });
                  track("builder_suggestion_accepted", { section: "skills", source: it.source });
                }}
                /*
                 * A real rejection, not a hide. `rejectItem` keeps the item as `rejected` and
                 * `filterFresh` reads that list, so a skill someone declined does not come back
                 * reworded the next time the blueprint is asked for more.
                 */
                onReject={() => {
                  p.dispatch({ t: "reject", id: it.id });
                  track("builder_suggestion_rejected", { section: "skills", source: it.source });
                }}
              />
            ))}
          </div>
        </div>
        );
      })}
      {gap}
    </>
  );
}
