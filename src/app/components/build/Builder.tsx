"use client";

/**
 * The form-first builder.
 *
 * Replaces the conversation as the way a CV gets made. The form drives; the AI
 * suggests inside each section and nothing it writes reaches the document until the
 * user confirms it. That last part is not enforced here — it is a property of the
 * data model in `lib/builderDoc.ts`, where confirmed content lives in `profile` and
 * suggestions live somewhere the renderer cannot see.
 *
 * This file is the shell only: state, autosave, layout, progress, section framing.
 * Each section is its own component so they can be built and reviewed one at a time.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import "../../build.css";

import ResumeTemplate from "../ResumeTemplate";
import OrbBrand from "../OrbBrand";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import { assembleResume } from "@/app/lib/mergeProfile";
import { computeProgress } from "@/app/lib/interviewGuards";
import { readDraft, writeDraft, contactLine } from "@/app/lib/draftStore";
import { setBuilderMode } from "@/app/lib/flags";
import {
  type BuilderState, type SectionId, type Item, type Credential, type CredentialKind,
  type LanguageEntry,
  EMPTY_BUILDER,
  newItem, confirmItem, rejectItem, pending, editItem, newId, summaryBasis,
  cvLang, levelWord, validToWord,
} from "@/app/lib/builderDoc";
import { type Role, rolesToLines } from "@/app/lib/resumeDoc";
import { findRolePack, type RolePack } from "@/app/lib/rolePacks";
import { type ParsedCv } from "@/app/lib/importCv";
import ExperienceSection from "./ExperienceSection";
import { EducationBlock, CredentialsBlock, LanguagesBlock } from "./DetailSections";
import AskAi from "./AskAi";
import ImportPanel from "./ImportPanel";
import SummarySection from "./SummarySection";
import ReviewSection from "./ReviewSection";
import DesignSection from "./DesignSection";

/* ───────────────────────── copy ───────────────────────── */

const T = {
  en: {
    brand: "Sira", chat: "Talk to the AI instead",
    h1a: "You fill the facts.", h1b: "AI completes the professional wording.",
    promise: "Suggested skills and responsibilities for your profession — grouped, editable, and never added until you approve them.",
    trust: [
      "Never invents an employer, a date, a certification or a number",
      "ATS-ready structure — single column, standard headings",
      "Free, no signup, works with the AI switched off",
    ],
    saving: "Saving…", saved: "Saved", failed: "Save failed — your work is still on screen",
    cont: "Save & continue", edit: "Edit", preview: "Preview",
    sections: {
      start: "Where do you want to start?",
      target: "The job you are aiming for",
      personal: "How employers reach you",
      experience: "Your work experience",
      education: "Education",
      credentials: "Licences & certifications",
      skills: "Skills",
      languages: "Languages",
      summary: "Professional summary",
      review: "Review",
      design: "Design & download",
    } as Record<SectionId, string>,
    subs: {
      start: "Pick a starting point. Nothing is written until you confirm it.",
      target: "This comes first because everything the AI suggests is based on it.",
      personal: "Only what an employer needs. Nothing sensitive is requested.",
      experience: "One position at a time. AI drafts the duties; you keep what is true.",
      education: "AI may tidy the wording. It will not invent a degree.",
      credentials: "Suggestions start unchecked. Nothing is claimed on your behalf.",
      skills: "Choose what you actually do. Nothing is pre-selected.",
      languages: "You choose the level. Nothing is assumed.",
      summary: "Written last, from what you confirmed above.",
      review: "What is missing, and what would make this stronger.",
      design: "Content first, design last.",
    } as Record<SectionId, string>,
    newCv: "Build a new CV",
    newCvSub: "Step by step. AI suggests skills and responsibilities for your profession — you approve everything.",
    upCv: "Upload and improve my CV",
    upCvSub: "We read your file, score it, and rewrite it without inventing anything.",
  },
  ar: {
    brand: "سيرة", chat: "أفضّل المحادثة",
    h1a: "أنت تكتب الحقائق.", h1b: "والذكاء يصوغها بلغة مهنية.",
    promise: "مهارات ومهام مقترحة لمهنتك — مجمّعة، قابلة للتعديل، ولا تُضاف قبل أن تعتمدها.",
    trust: [
      "لا يختلق جهة عمل ولا تاريخاً ولا شهادة ولا رقماً",
      "بنية تعبر أنظمة الفرز — عمود واحد وعناوين قياسية",
      "مجاناً، بلا تسجيل، ويعمل والذكاء مطفأ",
    ],
    saving: "يحفظ…", saved: "محفوظ", failed: "تعذّر الحفظ — عملك لا يزال أمامك",
    cont: "احفظ وواصل", edit: "تعديل", preview: "معاينة",
    sections: {
      start: "من أين تبدأ؟",
      target: "الوظيفة التي تستهدفها",
      personal: "كيف يصل إليك أصحاب العمل",
      experience: "خبرتك العملية",
      education: "التعليم",
      credentials: "الرخص والشهادات",
      skills: "المهارات",
      languages: "اللغات",
      summary: "الملخص المهني",
      review: "المراجعة",
      design: "التصميم والتنزيل",
    } as Record<SectionId, string>,
    subs: {
      start: "اختر نقطة البداية. لا يُكتب شيء في سيرتك قبل أن تؤكّده.",
      target: "تأتي أولاً لأن كل ما يقترحه الذكاء مبني عليها.",
      personal: "ما يحتاجه صاحب العمل فقط. لا نطلب أي بيانات حسّاسة.",
      experience: "وظيفة واحدة كل مرة. الذكاء يكتب المهام، وأنت تُبقي الصحيح.",
      education: "قد يرتّب الذكاء الصياغة. لن يختلق شهادة.",
      credentials: "الاقتراحات تبدأ غير مختارة. لا يُنسب إليك شيء بلا تأكيدك.",
      skills: "اختر ما تفعله فعلاً. لا شيء محدَّد مسبقاً.",
      languages: "أنت تختار المستوى. لا شيء يُفترض.",
      summary: "يُكتب آخراً، من الذي أكّدته أعلاه.",
      review: "ما ينقص، وما يجعلها أقوى.",
      design: "المحتوى أولاً، التصميم أخيراً.",
    } as Record<SectionId, string>,
    newCv: "أنشئ سيرة جديدة",
    newCvSub: "خطوة بخطوة. الذكاء يقترح المهارات والمهام لمهنتك — وأنت تعتمد كل شيء.",
    upCv: "ارفع سيرتي وحسّنها",
    upCvSub: "نقرأ ملفك، نقيّمه، ونعيد صياغته دون اختلاق أي شيء.",
  },
};

/** The journey, in order. The rail and the cinema both read this. */
const ORDER: SectionId[] = [
  "start", "target", "blueprint", "personal", "experience", "education",
  "credentials", "skills", "languages", "summary", "review", "design",
];

/* ───────────────────────── state ───────────────────────── */

type Action =
  | { t: "hydrate"; state: BuilderState }
  | { t: "entry"; v: BuilderState["entry"] }
  | { t: "target"; patch: Partial<BuilderState["target"]> }
  | { t: "personal"; patch: Partial<BuilderState["personal"]> }
  | { t: "template"; slug: string }
  | { t: "seed"; pack: RolePack; ui: "ar" | "en"; cv: "ar" | "en" }
  | { t: "addRole" }
  | { t: "role"; id: string; patch: Partial<Role> }
  | { t: "removeRole"; id: string }
  | { t: "moveBullet"; roleId: string; from: number; to: number }
  | { t: "removeBullet"; roleId: string; index: number }
  | { t: "offer"; items: Item[] }
  | { t: "editItem"; id: string; text: string }
  | { t: "education"; text: string }
  | { t: "credAdd"; cred: Credential }
  | { t: "cred"; id: string; patch: Partial<Credential> }
  | { t: "credRemove"; id: string }
  | { t: "langAdd"; entry: LanguageEntry }
  | { t: "lang"; id: string; patch: Partial<LanguageEntry> }
  | { t: "langRemove"; id: string }
  | { t: "offerSummary"; items: Item[] }
  | { t: "pickSummary"; id: string }
  | { t: "summaryText"; text: string }
  | { t: "import"; cv: ParsedCv; lang: "ar" | "en" }
  | { t: "removeSkill"; text: string }
  | { t: "tailorCopy" }
  | { t: "confirm"; id: string }
  | { t: "reject"; id: string }
  | { t: "done"; section: SectionId };

/**
 * Rebuild the certifications block from the confirmed credentials only.
 *
 * "valid to" is chosen by the CV's language, not the interface's. An Arabic CV that
 * says "الرخصة — valid to 2027" was written by a tool that could not tell the two
 * apart, and a recruiter can see that at a glance.
 */
function withCreds(s: BuilderState, credentials: Credential[]): BuilderState {
  const cv = cvLang(s.target);
  const text = credentials
    .filter((c) => c.status === "confirmed" && c.title.trim())
    .map((c) => [
      c.title.trim(),
      c.issuer.trim(),
      c.issueDate.trim(),
      c.expiryDate.trim() && `${validToWord(cv)} ${c.expiryDate.trim()}`,
      c.credentialNumber?.trim(),
    ].filter(Boolean).join(" — "))
    .join("\n");
  return { ...s, credentials, profile: { ...s.profile, certifications: text } };
}

/**
 * Rebuild the languages line. An entry with no level is not published.
 *
 * The level is STORED as an English key and PUBLISHED as a word in the CV's language.
 * Storing the word would make the data un-comparable across languages; publishing the
 * key would print "العربية (native)" on an Arabic resume.
 */
function withLangs(s: BuilderState, languages: LanguageEntry[]): BuilderState {
  const cv = cvLang(s.target);
  const text = languages
    .filter((l) => l.status === "confirmed" && l.name.trim() && l.level)
    .map((l) => `${l.name.trim()} (${levelWord(l.level as Exclude<LanguageEntry["level"], "">, cv)})`)
    .join(cv === "ar" ? "، " : ", ");
  return { ...s, languages, profile: { ...s.profile, languages: text } };
}

function reducer(s: BuilderState, a: Action): BuilderState {
  switch (a.t) {
    case "hydrate":
      return a.state;
    case "entry":
      return { ...s, entry: a.v };
    case "target": {
      const target = { ...s.target, ...a.patch };
      // The role headline on the CV follows the target title, so the preview shows
      // the job being aimed at rather than staying blank until the summary exists.
      const profile = a.patch.title !== undefined
        ? { ...s.profile, role: a.patch.title }
        : s.profile;
      const next = { ...s, target, profile };
      // Switching the CV's language changes strings already published from structured
      // data — "valid to" and every proficiency word. Rebuilding them here is what
      // makes the language field retroactive instead of applying only to what comes
      // after it.
      return a.patch.language !== undefined && a.patch.language !== s.target.language
        ? withLangs(withCreds(next, next.credentials), next.languages)
        : next;
    }
    case "personal": {
      const personal = { ...s.personal, ...a.patch };
      const profile = {
        ...s.profile,
        name: personal.fullName,
        // contactLine composes in the order an employer scans, and drops empties so
        // a half-filled form never renders a dangling separator.
        contact: contactLine(
          { phone: personal.phone, email: personal.email },
          { city: [personal.city, personal.country].filter(Boolean).join(", "),
            nationality: personal.nationality, visaStatus: personal.visaStatus },
        ),
      };
      return { ...s, personal, profile };
    }
    case "template":
      return { ...s, template: a.slug };

    /*
     * Seed the suggestion bag from the cached role pack.
     *
     * This is what makes the blueprint instant: no model call stands between typing
     * a job title and seeing what the builder knows about it. Everything seeded is
     * `status: "suggested"` and `source: "occupation"`, so it is offered and nothing
     * more — an X-ray technologist does not necessarily do MRI, and the pack cannot
     * assert that they do.
     */
    case "seed": {
      // Item TEXT is CV content, so it follows the document's language. `group` is a
      // heading in the form and follows the interface. Same pack, two languages, and
      // the distinction is the whole reason the seeded duties were coming out Arabic
      // on an English CV.
      const L = a.cv;
      const already = new Set(s.suggestions.map((i) => i.normalized));
      const fresh: Item[] = [];
      for (const g of a.pack.groups) {
        for (const it of g.items) {
          const item = newItem({
            section: "skills", type: "skill", text: it[L],
            source: "occupation", sourceRef: a.pack.slug, group: g.label[a.ui],
            reason: a.ui === "ar" ? "شائع في هذا المسمى" : "common for this job title",
          });
          if (!already.has(item.normalized)) { already.add(item.normalized); fresh.push(item); }
        }
      }
      return { ...s, suggestions: [...s.suggestions, ...fresh] };
    }

    /* ── roles ── */
    case "addRole": {
      const role: Role = {
        id: newId("r"), title: "", company: "", location: "",
        department: "", start: "", end: "", bullets: [],
      };
      return { ...s, profile: { ...s.profile, roles: [...(s.profile.roles || []), role] } };
    }
    case "role": {
      const roles = (s.profile.roles || []).map((r) => r.id === a.id ? { ...r, ...a.patch } : r);
      return { ...s, profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) } };
    }
    case "removeRole": {
      const roles = (s.profile.roles || []).filter((r) => r.id !== a.id);
      return {
        ...s,
        profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) },
        // Orphaned suggestions would sit in the bag forever, invisible and counted.
        suggestions: s.suggestions.filter((i) => i.roleId !== a.id),
      };
    }
    case "moveBullet": {
      const roles = (s.profile.roles || []).map((r) => {
        if (r.id !== a.roleId) return r;
        const b = [...r.bullets];
        const [m] = b.splice(a.from, 1);
        b.splice(a.to, 0, m);
        return { ...r, bullets: b };
      });
      return { ...s, profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) } };
    }
    case "removeBullet": {
      const roles = (s.profile.roles || []).map((r) => r.id !== a.roleId
        ? r
        : { ...r, bullets: r.bullets.filter((_, i) => i !== a.index) });
      return { ...s, profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) } };
    }
    case "offer":
      return { ...s, suggestions: [...s.suggestions, ...a.items] };
    case "editItem":
      return editItem(s, a.id, a.text);

    case "education":
      return { ...s, profile: { ...s.profile, education: a.text } };

    /* ── credentials ──
     * A credential reaches the CV only once it is `confirmed` AND has a title. The
     * derived string is rebuilt from scratch each time rather than appended to, so
     * un-confirming one actually removes it from the document.
     */
    case "credAdd":
      return withCreds(s, [...s.credentials, a.cred]);
    case "cred":
      return withCreds(s, s.credentials.map((x) => x.id === a.id ? { ...x, ...a.patch } : x));
    case "credRemove":
      return withCreds(s, s.credentials.filter((x) => x.id !== a.id));

    /* ── languages ──
     * Level is required, never defaulted: an entry without one is held back rather
     * than published as a guess. Nothing may quietly assert "fluent English".
     */
    case "langAdd":
      return withLangs(s, [...s.languages, a.entry]);
    case "lang":
      return withLangs(s, s.languages.map((x) => x.id === a.id ? { ...x, ...a.patch } : x));
    case "langRemove":
      return withLangs(s, s.languages.filter((x) => x.id !== a.id));

    /* ── summary ──
     * The summary is one field, not a list, so its suggestions do not accumulate:
     * a new set of variants replaces the old one outright, and choosing one discards
     * the other two. An unchosen variant is not a pending item the user still owes a
     * decision on — it is a road not taken, and leaving it in the bag would have the
     * review section report unconfirmed AI content forever.
     */
    case "offerSummary":
      return {
        ...s,
        suggestions: [...s.suggestions.filter((i) => i.section !== "summary"), ...a.items],
      };
    case "pickSummary": {
      const next = confirmItem(s, a.id).state;
      return {
        ...next,
        suggestions: next.suggestions.filter((i) => i.section !== "summary"),
        summaryBasis: summaryBasis(next.profile),
      };
    }
    case "summaryText": {
      const text = a.text.trim();
      const profile = { ...s.profile, summary: text };
      return {
        ...s,
        profile,
        // Recomputed from the result, not passed in: the stale notice is only honest
        // if the stored basis is the state the summary was actually written against.
        summaryBasis: text ? summaryBasis(profile) : undefined,
      };
    }

    /*
     * Apply to a second job without rebuilding a career.
     *
     * The profile IS the master career record — employers, dates, duties, credentials
     * are true regardless of which advert they are being sent to. What is target-bound
     * is exactly two things: the advert itself, and the summary that was written to
     * answer it. So those are cleared and nothing else is, which is what makes this a
     * tailored copy rather than a fresh start.
     *
     * `sectionsDone` loses its target-side ticks so the journey asks again rather than
     * showing a green check over a step that now describes the previous application.
     * `reached` is monotonic, so nothing re-locks — the user is asked, not blocked.
     */
    case "tailorCopy": {
      const stale: SectionId[] = ["target", "summary", "review", "design"];
      return {
        ...s,
        target: { ...s.target, jobAdText: "", jobAdUrl: "", employer: "" },
        profile: { ...s.profile, summary: "", jobAd: "" },
        summaryBasis: undefined,
        suggestions: s.suggestions.filter((i) => i.section !== "summary"),
        sectionsDone: s.sectionsDone.filter((x) => !stale.includes(x)),
      };
    }

    /*
     * A CV the user already has, brought into the form.
     *
     * Three rules decide what lands where, and each one is about not losing or not
     * over-claiming the user's own words:
     *
     * 1. Their FACTS go straight in — name, contact, jobs with dates, education, their
     *    own summary. This is transcription, not suggestion: the document is theirs and
     *    a form that made them re-approve their own employer would be insulting.
     * 2. Duties land up to the role's budget, and the OVERFLOW becomes suggestions.
     *    `capBullets` keeps the earliest six, so importing ten silently would delete
     *    four of their lines with no trace. Offered, they are one tap from returning.
     * 3. Skills, credentials and languages arrive UNCONFIRMED. Not because they are
     *    doubted, but because each needs something the parse cannot supply: a skill
     *    needs to fit the target job, a credential needs its issuer and expiry, and a
     *    language needs a level this product refuses to guess.
     *
     * Existing input is never overwritten. Someone who typed their phone number and
     * then imported a file keeps what they typed.
     */
    case "import": {
      const cv = a.cv;
      const keep = (mine: string, theirs: string) => mine.trim() || theirs.trim();
      const personal = {
        ...s.personal,
        fullName: keep(s.personal.fullName, cv.name),
        phone: keep(s.personal.phone, cv.phone),
        email: keep(s.personal.email, cv.email),
        linkedin: keep(s.personal.linkedin, cv.linkedin),
      };

      const roles: Role[] = [...(s.profile.roles || [])];
      const offered: Item[] = [];
      for (const r of cv.roles) {
        const id = newId("r");
        const current = /present|now|الآن|حالي/i.test(r.end) || !r.end;
        const cap = current ? 6 : 4;
        roles.push({
          id, title: r.title, company: r.company, location: r.location,
          department: "", start: r.start, end: r.end,
          bullets: r.bullets.slice(0, cap),
        });
        for (const extra of r.bullets.slice(cap)) {
          offered.push(newItem({
            section: "experience", type: "duty", text: extra, roleId: id,
            source: "imported", sourceRef: "cv-upload",
            reason: a.lang === "ar" ? "من سيرتك المرفوعة — تجاوزت حد المهام" : "from your uploaded CV — over this job's bullet limit",
          }));
        }
      }

      for (const skill of cv.skills) {
        offered.push(newItem({
          section: "skills", type: "skill", text: skill,
          source: "imported", sourceRef: "cv-upload",
          reason: a.lang === "ar" ? "من سيرتك المرفوعة" : "from your uploaded CV",
        }));
      }

      const credentials: Credential[] = [
        ...s.credentials,
        ...cv.certifications.map((title) => ({
          id: newId("cr"), kind: "certification" as CredentialKind, title,
          issuer: "", issueDate: "", expiryDate: "",
          status: "suggested" as const, source: "imported" as const,
        })),
      ];

      const languages: LanguageEntry[] = [
        ...s.languages,
        ...cv.languages
          // A parsed "English (Fluent)" carries a level we did not ask for; the name is
          // kept and the level is not, because a level has to be the user's own claim.
          .map((raw) => raw.replace(/\s*[([].*$/, "").trim())
          .filter((name) => name && !s.languages.some((l) => l.name === name))
          .map((name) => ({
            id: newId("lg"), name, level: "" as const,
            status: "suggested" as const, source: "imported" as const,
          })),
      ];

      const education = [s.profile.education, ...cv.education].filter((x) => x && x.trim()).join("\n");

      const next: BuilderState = {
        ...s,
        entry: "upload",
        personal,
        suggestions: [...s.suggestions, ...offered],
        profile: {
          ...s.profile,
          name: personal.fullName,
          contact: contactLine(
            { phone: personal.phone, email: personal.email },
            { city: [personal.city, personal.country].filter(Boolean).join(", ") },
          ),
          roles,
          wovenLines: rolesToLines(roles),
          education,
          summary: s.profile.summary || cv.summary,
        },
      };
      return withLangs(withCreds({ ...next, credentials, languages }, credentials), languages);
    }

    /* A confirmed skill had no way off the CV. Importing twelve of them made that
       impossible to ignore. */
    case "removeSkill": {
      const kept = String(s.profile.skills || "")
        .split(/[,،]/).map((x) => x.trim()).filter(Boolean)
        .filter((x) => x !== a.text);
      return { ...s, profile: { ...s.profile, skills: kept.join("، ") } };
    }

    case "confirm":
      return confirmItem(s, a.id).state;

    case "reject":
      return rejectItem(s, a.id);
    case "done":
      return s.sectionsDone.includes(a.section)
        ? s
        : { ...s, sectionsDone: [...s.sectionsDone, a.section] };
    default:
      return s;
  }
}

/* ───────────────────────── shell ───────────────────────── */

export default function Builder({ lang }: { lang: "ar" | "en" }) {
  const t = T[lang];
  const ar = lang === "ar";
  const [state, dispatch] = useReducer(reducer, EMPTY_BUILDER);
  const [save, setSave] = useState<"" | "saving" | "saved" | "failed">("");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const hydrated = useRef(false);

  const cinema = useSectionCinemaSafe(ORDER.length);
  // Read once per mount and passed down: an expiry check that re-reads the clock on
  // every render makes the same draft render differently for no reason.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /* hydrate once — a refresh must not cost the user their work */
  useEffect(() => {
    const d = readDraft(lang);
    const saved = (d as unknown as { builder?: BuilderState }).builder;
    if (saved?.schemaVersion) {
      dispatch({ t: "hydrate", state: { ...EMPTY_BUILDER, ...saved } });
      cinema.restore(Math.max(0, saved.sectionsDone.length));
    } else if (d.profile?.role || d.profile?.name) {
      // A draft started in the chat: carry the confirmed resume across, which is
      // the entire point of sharing the key.
      dispatch({ t: "hydrate", state: { ...EMPTY_BUILDER, profile: d.profile } });
      cinema.restore(1);
    }
    hydrated.current = true;
    track("builder_started", { lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  /* autosave — debounced, local-first, never blocking */
  useEffect(() => {
    if (!hydrated.current) return;
    setSave("saving");
    const id = setTimeout(() => {
      try {
        writeDraft(lang, {
          profile: state.profile,
          door: "form",
          // Nested so the chat's own keys and the builder's cannot collide.
          ...({ builder: state } as unknown as Record<string, unknown>),
        });
        setSave("saved");
      } catch { setSave("failed"); }
    }, 450);
    return () => clearTimeout(id);
     
  }, [state, lang]);

  /* The preview is expensive: ResumeTemplate re-parses and re-measures on every
   * text change, so binding it to raw keystrokes re-lays out an A4 page per letter. */
  const [previewText, setPreviewText] = useState("");
  /** The document's language. Everything written INTO the CV is chosen by this. */
  const cv = cvLang(state.target);
  const resumeRtl = cv === "ar";
  useEffect(() => {
    const id = setTimeout(() => setPreviewText(assembleResume(state.profile, resumeRtl)), 250);
    return () => clearTimeout(id);
  }, [state.profile, resumeRtl]);

  const tpl = useMemo(
    () => TEMPLATE_CATALOG.find((x) => x.slug === state.template) ?? TEMPLATE_CATALOG[0],
    [state.template],
  );
  const progress = useMemo(() => computeProgress(state.profile), [state.profile]);

  const finish = useCallback((section: SectionId, index: number) => {
    dispatch({ t: "done", section });
    track("builder_section_completed", { section });
    cinema.open(index + 1);
     
  }, [cinema]);

  /*
   * The drop-off signal.
   *
   * `builder_section_completed` alone cannot say where a build died — it only fires
   * for the steps someone finished. Pairing it with "reached" turns the funnel into
   * arithmetic: reached(experience) minus completed(experience) is the number of
   * people the experience section lost. Fired once per section, guarded by a ref so
   * a re-render or a restored draft cannot inflate the count.
   */
  const reported = useRef(-1);
  useEffect(() => {
    if (cinema.reached <= reported.current) return;
    for (let i = reported.current + 1; i <= cinema.reached; i++) {
      track("builder_section_reached", { section: ORDER[i], index: i });
    }
    reported.current = cinema.reached;
  }, [cinema.reached]);

  /** Review findings name the section they belong to; this is how "go there" works. */
  const jump = useCallback((section: SectionId) => {
    const i = ORDER.indexOf(section);
    if (i >= 0) cinema.scrollTo(i);
     
  }, [cinema]);

  const sectionProps = (id: SectionId, i: number) => ({
    id, index: i, lang,
    title: t.sections[id], sub: t.subs[id],
    locked: i > cinema.reached,
    done: state.sectionsDone.includes(id),
    justOpened: cinema.justOpened === i,
    setRef: cinema.setRef(i),
    onDone: () => finish(id, i),
    contLabel: t.cont,
  });

  return (
    <div className="build-root" dir={ar ? "rtl" : "ltr"}>
      <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
        <header
          className="sticky top-0 z-50"
          style={{ background: "linear-gradient(180deg, rgba(5,7,13,0.92), rgba(5,7,13,0.72))", backdropFilter: "blur(8px)" }}
        >
          <div className="mx-auto max-w-6xl px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link href={ar ? "/ar" : "/"} className="flex items-center gap-2">
                <OrbBrand size={26} />
                <span className="text-sm font-extrabold">{t.brand}</span>
              </Link>
              <div className="flex items-center gap-3">
                <span className={`bd-save${save === "failed" ? " err" : ""}`}>
                  {save === "saving" ? t.saving : save === "saved" ? t.saved : save === "failed" ? t.failed : ""}
                </span>
                <Link
                  href={ar ? "/ar/journey" : "/journey"}
                  onClick={() => { setBuilderMode("chat"); track("builder_chose_chat_door", {}); }}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                >
                  {t.chat}
                </Link>
              </div>
            </div>
            <div className="bd-rail mt-2.5" aria-label={`${progress}%`}>
              {ORDER.map((s, i) => <i key={s} className={i <= cinema.reached ? "on" : ""} />)}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-5 pb-24 pt-6">
          {/* The page's claim, as a heading rather than as decoration. This is also the
              homepage now, and a homepage with no h1 leaves the strongest on-page signal
              in the product unused. */}
          <header className="mb-6">
            <h1 className="text-xl font-extrabold leading-snug sm:text-2xl" style={{ letterSpacing: "-0.02em" }}>
              {t.h1a}{" "}
              <span style={{ color: "var(--accent)" }}>{t.h1b}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>{t.promise}</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--faint)" }}>
              {t.trust.map((x) => <li key={x}>✓ {x}</li>)}
            </ul>
          </header>

          {/* Mobile: never show the CV beside the form — neither would be usable. */}
          <div className="mb-4 flex gap-2 lg:hidden">
            {(["edit", "preview"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setMobileView(v)}
                className="flex-1 rounded-full px-3 text-xs font-semibold"
                style={mobileView === v
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}
              >
                {v === "edit" ? t.edit : t.preview}
              </button>
            ))}
          </div>

          <div className="bd-cols">
            <div className={`bd-form${mobileView === "preview" ? " hide" : ""}`}>
              <StartSection {...sectionProps("start", 0)} state={state} dispatch={dispatch} copy={t} />
              <TargetSection {...sectionProps("target", 1)} state={state} dispatch={dispatch} />
              <BlueprintSection {...sectionProps("blueprint", 2)} state={state} dispatch={dispatch} />
              <PersonalSection {...sectionProps("personal", 3)} state={state} dispatch={dispatch} />
              {ORDER.slice(4).map((id, k) => {
                const props = sectionProps(id, k + 4);
                if (id === "experience") {
                  return (
                    <SectionShell key={id} {...props}>
                      <ExperienceSection
                        lang={lang} cv={cv} state={state} target={state.target}
                        dispatch={dispatch as unknown as React.Dispatch<{ t: string; [k: string]: unknown }>}
                      />
                      <AskAi lang={lang} section="experience" targetRole={state.target.title}
                        current={(state.profile.wovenLines || []).join("\n")} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "skills") return <SkillsSection key={id} {...props} state={state} dispatch={dispatch} />;
                if (id === "education") {
                  return (
                    <SectionShell key={id} {...props}>
                      <EducationBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never} targetRole={state.target.title} />
                      <AskAi lang={lang} section="education" targetRole={state.target.title}
                        current={state.profile.education} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "credentials") {
                  return (
                    <SectionShell key={id} {...props}>
                      <CredentialsBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never} referenceDate={today} />
                      {/* The question this section actually gets asked is "do I put my
                          licence number on a CV?" — which a form cannot answer and a
                          one-line AI answer can. */}
                      <AskAi lang={lang} section="credentials" targetRole={state.target.title}
                        current={state.profile.certifications} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "summary") {
                  return (
                    <SectionShell key={id} {...props}>
                      <SummarySection lang={lang} state={state} dispatch={dispatch as never} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "review") {
                  return (
                    <SectionShell key={id} {...props}>
                      <ReviewSection lang={lang} state={state} referenceDate={today} onJump={jump} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "design") {
                  return (
                    <SectionShell key={id} {...props}>
                      <DesignSection
                        lang={lang} state={state} cv={previewText} referenceDate={today}
                        onTemplate={(slug) => dispatch({ t: "template", slug })}
                        onJump={jump}
                        onTailorCopy={() => { dispatch({ t: "tailorCopy" }); jump("target"); }}
                      />
                    </SectionShell>
                  );
                }
                if (id === "languages") {
                  return (
                    <SectionShell key={id} {...props}>
                      <LanguagesBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                // Every id in ORDER is handled above; this is the exhaustiveness tail.
                return null;
              })}
            </div>

            <aside className={`bd-preview${mobileView === "edit" ? " hide" : ""}`}>
              <div className="card overflow-hidden p-2">
                {previewText.trim() ? (
                  <ResumeTemplate
                    text={previewText}
                    name={state.profile.name || "resume"}
                    variant={tpl.variant}
                    accent={tpl.accent}
                    /* Explicit: detectDir guesses, and on a half-empty draft it flips
                       the whole preview mid-build. */
                    dir={resumeRtl ? "rtl" : "ltr"}
                    fitWidth
                  />
                ) : (
                  <div className="p-8 text-center text-xs" style={{ color: "var(--faint)" }}>
                    {ar ? "ستظهر سيرتك هنا وأنت تكتب." : "Your CV appears here as you fill it in."}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

/* Imported lazily below the component so the hook file stays a separate module. */
import { useSectionCinema } from "./useSectionCinema";
function useSectionCinemaSafe(total: number) { return useSectionCinema(total); }

/* ───────────────────── section framing ───────────────────── */

interface ShellProps {
  id: SectionId; index: number; lang: "ar" | "en";
  title: string; sub: string;
  locked: boolean; done: boolean; justOpened: boolean;
  setRef: (el: HTMLElement | null) => void;
  onDone: () => void; contLabel: string;
}

function SectionShell({
  title, sub, locked, done, justOpened, setRef, children,
}: ShellProps & { children: React.ReactNode }) {
  return (
    <section
      ref={setRef as (el: HTMLElement | null) => void}
      className={`bd-section${locked ? " locked" : ""}${justOpened ? " just-opened" : ""}`}
      aria-hidden={locked}
    >
      <div className="bd-head">
        <span className={`bd-num${done ? " done" : ""}`}>{done ? "✓" : ""}</span>
        <div>
          <h2 className="bd-title">{title}</h2>
          <p className="bd-sub">{sub}</p>
        </div>
      </div>
      {/*
        Children of a section the user has not reached are not rendered at all, not
        merely hidden. The review section recomputes the whole report from `profile`,
        so mounting it early would run a full CV analysis on every keystroke typed
        eight sections above it, invisibly. Safe because `reached` is monotonic — a
        section never goes back to locked, so nothing mounted is ever torn down.
      */}
      <div className="bd-body">{locked ? null : children}</div>
    </section>
  );
}

function Field({
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

function ContinueButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="btn-accent mt-5 rounded-xl px-5 text-sm font-bold">
      {label}
    </button>
  );
}

/* ───────────────────────── sections ───────────────────────── */

function StartSection(p: ShellProps & {
  state: BuilderState; dispatch: React.Dispatch<Action>; copy: typeof T["en"];
}) {
  const ar = p.lang === "ar";
  return (
    <SectionShell {...p}>
      <div className="bd-grid two">
        <button
          className="card card-hover p-4 text-start"
          onClick={() => {
            p.dispatch({ t: "entry", v: "new" });
            track("builder_entry_selected", { entry: "new" });
            p.onDone();
          }}
        >
          <div className="text-sm font-bold">{p.copy.newCv}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{p.copy.newCvSub}</div>
        </button>
        <Link
          href={ar ? "/ar/optimize" : "/optimize"}
          onClick={() => track("builder_entry_selected", { entry: "upload" })}
          className="card card-hover p-4 text-start"
        >
          <div className="text-sm font-bold">{p.copy.upCv}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{p.copy.upCvSub}</div>
        </Link>
      </div>
      {/* The third way in, and the one most people with a CV actually want: read it and
          carry on building here, rather than being sent to a different product. */}
      <ImportPanel
        lang={p.lang}
        onImport={(cv) => {
          p.dispatch({ t: "import", cv, lang: p.lang });
          p.dispatch({ t: "entry", v: "upload" });
          p.onDone();
        }}
      />
    </SectionShell>
  );
}

function TargetSection(p: ShellProps & { state: BuilderState; dispatch: React.Dispatch<Action> }) {
  const ar = p.lang === "ar";
  const L = ar
    ? { title: "المسمى الوظيفي", level: "مستوى الخبرة", langq: "لغة السيرة", ind: "المجال",
        country: "الدولة", city: "المدينة", emp: "جهة العمل المستهدفة", opt: "اختياري",
        jd: "وصف الوظيفة", jdWhy: "أضف وصف الوظيفة لنطابق سيرتك مع متطلبات صاحب العمل الحقيقية.",
        url: "أو الصق رابط الإعلان", urlPh: "https://…", fetch: "اقرأ الرابط",
        fetching: "يقرأ…", got: (n: number) => `قرأنا ${n} حرفاً من الإعلان — راجعه أدناه وعدّله إن لزم.`,
        levels: ["مبتدئ", "متوسط", "أول/خبير", "قيادي"] }
    : { title: "Job title", level: "Experience level", langq: "CV language", ind: "Industry",
        country: "Country", city: "City", emp: "Target employer", opt: "optional",
        jd: "Job description", jdWhy: "Add the job description to match your CV to the employer's real requirements.",
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
    <SectionShell {...p}>
      <div className="bd-grid two">
        <Field label={L.title} value={p.state.target.title} onChange={(v) => set({ title: v })}
          placeholder={ar ? "أخصائي أشعة" : "Radiology Technologist"} optLabel={L.opt} />
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
            {/* Labelled honestly: the PDF export cannot shape Arabic script, so an
                Arabic CV downloads as Word plus a rendered PDF, not a text PDF. */}
            <option value="en">English — PDF + Word</option>
            <option value="ar">{ar ? "العربية — Word + PDF مصمّم" : "Arabic — Word + designed PDF"}</option>
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
          placeholder={L.jdWhy}
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
          {err && <p className="mt-1.5 text-xs" style={{ color: "#fca5a5" }}>{err}</p>}
        </div>
      </div>
      <ContinueButton onClick={p.onDone} label={p.contLabel} />
    </SectionShell>
  );
}

function PersonalSection(p: ShellProps & { state: BuilderState; dispatch: React.Dispatch<Action> }) {
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
    <SectionShell {...p}>
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
      <ContinueButton onClick={p.onDone} label={p.contLabel} />
    </SectionShell>
  );
}

/* ───────────────────── blueprint ───────────────────── */

/** Hoisted: declaring a component inside a render creates a new type every pass. */
function ChipRow({ head, items }: { head: string; items: string[] }) {
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
function BlueprintSection(p: ShellProps & { state: BuilderState; dispatch: React.Dispatch<Action> }) {
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

  // Seeding is a side effect of a title arriving, so it must not run on every render.
  const seeded = useRef("");
  useEffect(() => {
    if (pack && seeded.current !== pack.slug) {
      seeded.current = pack.slug;
      p.dispatch({ t: "seed", pack, ui: p.lang, cv: cvLang(p.state.target) });
      track("builder_blueprint_shown", { pack: pack.slug });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, p.lang, p.state.target.language]);

  if (!p.state.target.title.trim()) {
    return <SectionShell {...p}><p className="text-xs" style={{ color: "var(--faint)" }}>{L.none}</p></SectionShell>;
  }
  if (!pack) {
    return (
      <SectionShell {...p}>
        <p className="text-xs" style={{ color: "var(--faint)" }}>{L.generic}</p>
        <ContinueButton onClick={p.onDone} label={p.contLabel} />
      </SectionShell>
    );
  }

  return (
    <SectionShell {...p}>
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
      <ContinueButton onClick={p.onDone} label={p.contLabel} />
    </SectionShell>
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
function SkillsSection(p: ShellProps & { state: BuilderState; dispatch: React.Dispatch<Action> }) {
  const ar = p.lang === "ar";
  const L = ar
    ? { none: "اكتب المسمى الوظيفي أولاً.", chosen: "في سيرتك", tapToAdd: "انقر لإضافتها لسيرتك", why: "لماذا اقتُرحت؟" }
    : { none: "Enter a job title first.", chosen: "In your CV", tapToAdd: "Tap to add to your CV", why: "Why suggested?" };

  const offered = pending(p.state, "skills");
  const chosen = String(p.state.profile.skills || "").split(/[,،]/).map((x) => x.trim()).filter(Boolean);

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of offered) {
      const k = it.group || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return [...m.entries()];
  }, [offered]);

  if (!offered.length && !chosen.length) {
    return <SectionShell {...p}><p className="text-xs" style={{ color: "var(--faint)" }}>{L.none}</p></SectionShell>;
  }

  return (
    <SectionShell {...p}>
      {chosen.length > 0 && (
        <div className="mb-4">
          <div className="bd-label">{L.chosen}</div>
          <div className="bd-chips">
            {chosen.map((x) => (
              <span key={x} className="bd-chip on">
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
      {groups.map(([label, items]) => (
        <div key={label} className="mt-3">
          {label && <div className="bd-label">{label}</div>}
          <div className="bd-chips">
            {items.map((it) => (
              <button
                key={it.id}
                className="bd-chip"
                title={it.reason ? `${L.why} ${it.reason}` : undefined}
                onClick={() => {
                  p.dispatch({ t: "confirm", id: it.id });
                  track("builder_suggestion_accepted", { section: "skills", source: it.source });
                }}
              >
                + {it.text}
              </button>
            ))}
          </div>
        </div>
      ))}
      <ContinueButton onClick={p.onDone} label={p.contLabel} />
    </SectionShell>
  );
}
