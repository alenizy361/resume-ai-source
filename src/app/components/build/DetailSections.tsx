"use client";

/**
 * Education, credentials and languages — the three sections where inventing
 * something would be a lie the user has to defend in an interview.
 *
 * Each one is deliberately more restrictive than the sections above it:
 *  - Education: the AI may tidy formatting and nothing else. It cannot propose a
 *    degree, an institution, a year or a GPA, because none of those can be guessed
 *    from a job title.
 *  - Credentials: suggestions arrive UNCHECKED, always. "Common for this profession"
 *    is not evidence that this person holds it. Selecting one opens the fields that
 *    make it a real claim — issuer, dates, credential number.
 *  - Languages: the level is never defaulted. Nothing here may quietly assert
 *    "fluent English", which is the single most common untruth on a CV.
 */

import { useMemo, useState } from "react";
import AiSuggest from "../AiSuggest";
import {
  type BuilderState, type Credential, type CredentialKind,
  type LanguageEntry, type LanguageLevel, newId,
} from "@/app/lib/builderDoc";
import { findRolePack } from "@/app/lib/rolePacks";

type Lang = "ar" | "en";
type Dispatch = React.Dispatch<{ t: string; [k: string]: unknown }>;

const KIND_LABEL: Record<CredentialKind, { en: string; ar: string }> = {
  licence: { en: "Professional licence", ar: "رخصة مهنية" },
  registration: { en: "Professional registration", ar: "تسجيل مهني" },
  classification: { en: "Professional classification", ar: "تصنيف مهني" },
  certification: { en: "Certification", ar: "شهادة" },
  training: { en: "Training course", ar: "دورة تدريبية" },
  membership: { en: "Membership", ar: "عضوية" },
};

const LEVELS: LanguageLevel[] = ["native", "fluent", "professional", "intermediate", "basic"];
const LEVEL_LABEL: Record<LanguageLevel, { en: string; ar: string }> = {
  native: { en: "Native", ar: "اللغة الأم" },
  fluent: { en: "Fluent", ar: "طليق" },
  professional: { en: "Professional working proficiency", ar: "إجادة مهنية" },
  intermediate: { en: "Intermediate", ar: "متوسط" },
  basic: { en: "Basic", ar: "مبتدئ" },
};

const C = {
  en: {
    eduHint: "AI may tidy the wording. It will not invent a degree, an institution, a year or a GPA — those are yours alone.",
    eduPh: "BSc Radiological Sciences — King Saud bin Abdulaziz University for Health Sciences, 2022\nGPA 2.84 / 5.00",
    credHint: "Suggestions start unchecked, always. Common for the profession is not proof that you hold it.",
    credAdd: "+ Add manually", pick: "Add", kind: "Type",
    cTitle: "Exact title", issuer: "Issuing organization", issued: "Issue date",
    expiry: "Expiry date", num: "Credential number", url: "Credential URL",
    opt: "optional", remove: "Remove", expired: "Expired — kept on file, not removed",
    confirmIt: "I hold this credential",
    langHint: "Choose the level yourself. Nothing is assumed — least of all fluent English.",
    langAdd: "+ Add a language", name: "Language", level: "Level", pickLevel: "Choose a level",
    needLevel: "Add a level and this appears on your CV.",
  },
  ar: {
    eduHint: "قد يرتّب الذكاء الصياغة. لن يختلق شهادة ولا جامعة ولا سنة ولا معدلاً — هذه لك وحدك.",
    eduPh: "بكالوريوس علوم الأشعة — جامعة الملك سعود بن عبدالعزيز للعلوم الصحية، ٢٠٢٢\nالمعدل ٢٫٨٤ من ٥",
    credHint: "الاقتراحات تبدأ غير مختارة دائماً. شيوعها في المهنة ليس دليلاً أنك تحملها.",
    credAdd: "+ أضف يدوياً", pick: "أضف", kind: "النوع",
    cTitle: "الاسم الدقيق", issuer: "الجهة المانحة", issued: "تاريخ الإصدار",
    expiry: "تاريخ الانتهاء", num: "رقم الشهادة", url: "رابط الشهادة",
    opt: "اختياري", remove: "حذف", expired: "منتهية — محفوظة ولم تُحذف",
    confirmIt: "أحمل هذه الشهادة فعلاً",
    langHint: "أنت تختار المستوى. لا شيء يُفترض — وأقلّه «إنجليزية بطلاقة».",
    langAdd: "+ أضف لغة", name: "اللغة", level: "المستوى", pickLevel: "اختر المستوى",
    needLevel: "أضف المستوى لتظهر في سيرتك.",
  },
};

/* ───────────────────────── education ───────────────────────── */

export function EducationBlock({ lang, cv, state, dispatch, targetRole }: {
  /** Interface language for labels; `cv` is the document's language for content. */
  lang: Lang; cv: Lang; state: BuilderState; dispatch: Dispatch; targetRole: string;
}) {
  const c = C[lang];
  return (
    <div>
      <textarea
        className="bd-textarea" value={state.profile.education}
        placeholder={c.eduPh}
        onChange={(e) => dispatch({ t: "education", text: e.target.value })}
      />
      {/* AiSuggest is the right control here and only here: a single string field
          where "the AI writes into your input and undo restores yours" is the whole
          interaction. It cannot express per-item accept/reject, so it is not used
          for duties or skills. */}
      <AiSuggest
        kind="education" lang={lang} outLang={cv} targetRole={targetRole}
        value={state.profile.education}
        jobAd={state.target.jobAdText}
        onWrite={(text) => dispatch({ t: "education", text })}
      />
      <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{c.eduHint}</p>
    </div>
  );
}

/* ──────────────────────── credentials ──────────────────────── */

export function CredentialsBlock({ lang, cv, state, dispatch, referenceDate }: {
  lang: Lang; cv: Lang; state: BuilderState; dispatch: Dispatch; referenceDate: string;
}) {
  const c = C[lang];
  const pack = useMemo(() => findRolePack(state.target.title), [state.target.title]);

  /** What the pack offers that is not already on the list. */
  const offers = useMemo(() => {
    if (!pack) return [];
    const have = new Set(state.credentials.map((x) => x.title.trim().toLowerCase()));
    return pack.credentials.filter((p) => !have.has(p.title[cv].trim().toLowerCase()));
  }, [pack, state.credentials, cv]);

  const add = (kind: CredentialKind, title = "", issuer = "") => {
    dispatch({
      t: "credAdd",
      cred: {
        id: newId("cr"), kind, title, issuer,
        issueDate: "", expiryDate: "",
        // Suggested, not confirmed. The user ticks it, or it never reaches the CV.
        status: "suggested", source: title ? "occupation" : "user",
      } as Credential,
    });
  };

  return (
    <div>
      <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>{c.credHint}</p>

      {offers.length > 0 && (
        <div className="bd-chips mb-4">
          {offers.map((o) => (
            <button key={o.title.en} className="bd-chip" onClick={() => add(o.kind, o.title[cv], o.issuer ?? "")}>
              + {o.title[cv]}
              <span className="bd-opt"> · {KIND_LABEL[o.kind][lang]}</span>
            </button>
          ))}
        </div>
      )}

      {state.credentials.map((cr) => (
        <CredentialCard key={cr.id} cred={cr} lang={lang} dispatch={dispatch} referenceDate={referenceDate} />
      ))}

      <button onClick={() => add("certification")} className="btn-ghost mt-2 rounded-xl px-4 text-sm font-semibold">
        {c.credAdd}
      </button>
    </div>
  );
}

function CredentialCard({ cred, lang, dispatch, referenceDate }: {
  cred: Credential; lang: Lang; dispatch: Dispatch; referenceDate: string;
}) {
  const c = C[lang];
  const set = (patch: Partial<Credential>) => dispatch({ t: "cred", id: cred.id, patch });
  // Expiry is compared against a date passed in, not read from the clock, so the
  // same draft renders identically in a test and in a browser.
  const expired = Boolean(cred.expiryDate && referenceDate && cred.expiryDate < referenceDate);

  return (
    <div className={cred.status === "confirmed" ? "bd-confirmed mb-2 block" : "bd-sug mb-2 block"}>
      <div className="bd-grid two">
        <label>
          <span className="bd-label">{c.kind}</span>
          <select className="bd-input" value={cred.kind}
            onChange={(e) => set({ kind: e.target.value as CredentialKind })}>
            {(Object.keys(KIND_LABEL) as CredentialKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k][lang]}</option>
            ))}
          </select>
        </label>
        <Text label={c.cTitle} value={cred.title} onChange={(v) => set({ title: v })} />
        <Text label={c.issuer} value={cred.issuer} onChange={(v) => set({ issuer: v })} />
        <Text label={c.issued} value={cred.issueDate} onChange={(v) => set({ issueDate: v })} placeholder="2026-05" />
        <Text label={c.expiry} value={cred.expiryDate} onChange={(v) => set({ expiryDate: v })} placeholder="2028-05" />
        <Text label={c.num} opt optLabel={c.opt} value={cred.credentialNumber ?? ""} onChange={(v) => set({ credentialNumber: v })} />
      </div>

      {expired && <p className="mt-2 text-xs" style={{ color: "#fbbf24" }}>⚠ {c.expired}</p>}

      <div className="mt-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          <input
            type="checkbox" checked={cred.status === "confirmed"}
            onChange={(e) => set({ status: e.target.checked ? "confirmed" : "suggested" })}
          />
          {c.confirmIt}
        </label>
        <button
          onClick={() => dispatch({ t: "credRemove", id: cred.id })}
          className="rounded-full px-2.5 text-[11px]"
          style={{ minHeight: 32, border: "1px solid var(--line)", color: "var(--faint)" }}
        >
          {c.remove}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── languages ───────────────────────── */

export function LanguagesBlock({ lang, cv, state, dispatch }: {
  lang: Lang; cv: Lang; state: BuilderState; dispatch: Dispatch;
}) {
  const c = C[lang];
  // Arabic and English are offered because this market's CVs almost always list
  // both — but offered with NO level, so the user states their own proficiency.
  const add = (name = "") => dispatch({
    t: "langAdd",
    entry: { id: newId("lg"), name, level: "", status: "suggested", source: name ? "occupation" : "user" } as LanguageEntry,
  });

  const suggestions = ["العربية / Arabic", "English"]
    .filter((n) => !state.languages.some((l) => l.name.toLowerCase().includes(n.split(" / ")[0].toLowerCase())));

  return (
    <div>
      <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>{c.langHint}</p>

      {suggestions.length > 0 && (
        <div className="bd-chips mb-4">
          {suggestions.map((n) => (
            <button key={n} className="bd-chip" onClick={() => add(n.includes("Arabic") ? (cv === "ar" ? "العربية" : "Arabic") : "English")}>
              + {n}
            </button>
          ))}
        </div>
      )}

      {state.languages.map((l) => {
        const set = (patch: Partial<LanguageEntry>) => dispatch({ t: "lang", id: l.id, patch });
        const published = l.status === "confirmed" && Boolean(l.level);
        return (
          <div key={l.id} className={published ? "bd-confirmed mb-2 block" : "bd-sug mb-2 block"}>
            <div className="bd-grid two">
              <Text label={c.name} value={l.name} onChange={(v) => set({ name: v })} />
              <label>
                <span className="bd-label">{c.level}</span>
                <select
                  className="bd-input" value={l.level}
                  onChange={(e) => set({
                    level: e.target.value as LanguageLevel,
                    // Picking a level is the act of claiming it.
                    status: e.target.value ? "confirmed" : "suggested",
                  })}
                >
                  <option value="">{c.pickLevel}</option>
                  {LEVELS.map((lv) => <option key={lv} value={lv}>{LEVEL_LABEL[lv][lang]}</option>)}
                </select>
              </label>
            </div>
            {!l.level && <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>{c.needLevel}</p>}
            <button
              onClick={() => dispatch({ t: "langRemove", id: l.id })}
              className="mt-2 rounded-full px-2.5 text-[11px]"
              style={{ minHeight: 32, border: "1px solid var(--line)", color: "var(--faint)" }}
            >
              {c.remove}
            </button>
          </div>
        );
      })}

      <button onClick={() => add()} className="btn-ghost mt-2 rounded-xl px-4 text-sm font-semibold">
        {c.langAdd}
      </button>
    </div>
  );
}

/* ───────────────────────── shared ───────────────────────── */

function Text({ label, value, onChange, placeholder, opt, optLabel }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; opt?: boolean; optLabel?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);
  return (
    <label>
      <span className="bd-label">{label}{opt && <span className="bd-opt"> — {optLabel}</span>}</span>
      <input
        className="bd-input" placeholder={placeholder}
        value={local ?? value}
        onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }}
        onBlur={() => setLocal(null)}
      />
    </label>
  );
}
