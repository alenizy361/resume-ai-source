/**
 * The journey as a list of addressable steps.
 *
 * One module owns the order, the URL slug, the heading and the subtitle for every step,
 * because four different things need to agree about them and they used to agree only by
 * coincidence: the left navigation, the Back/Continue buttons, the step page's own
 * `<h1>`, and the progress rail. When the order lived in `Builder.tsx` as a bare array
 * and the copy lived beside it in a `Record<SectionId, string>` written with `as`, a
 * missing key rendered an empty `<h2>` on the homepage and the compiler said nothing.
 *
 * `satisfies` rather than `as` throughout: a `SectionId` with no heading is a build
 * failure now, not a blank space on a live page.
 */

import type { SectionId } from "@/app/lib/builderDoc";

/**
 * `start` is not a step — it is the `/builder` landing, where the three ways in are
 * chosen. Everything after it is a page.
 */
export const STEPS: SectionId[] = [
  "target", "blueprint", "personal", "experience", "education",
  "credentials", "skills", "languages", "summary", "review", "design",
];

/** The rail and the cinema on the legacy long page still count `start`. */
export const ORDER: SectionId[] = ["start", ...STEPS];

/**
 * URL aliases.
 *
 * `/builder/<id>/export` is the address the download step was specified under, and it
 * is the one people will link to; `design` is what the section is called in the code
 * because design and download are the same page. Accepting both costs one map entry and
 * saves a 404 on a URL that reads correctly.
 */
const ALIAS: Record<string, SectionId> = {
  export: "design",
  download: "design",
  contact: "personal",
  job: "target",
};

/** A URL segment resolved to a step, or null if it names nothing. */
export function stepFromSlug(slug: string): SectionId | null {
  const s = String(slug || "").toLowerCase();
  if ((STEPS as string[]).includes(s)) return s as SectionId;
  return ALIAS[s] ?? null;
}

export function stepIndex(step: SectionId): number {
  return STEPS.indexOf(step);
}

export function nextStep(step: SectionId): SectionId | null {
  const i = stepIndex(step);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null;
}

export function prevStep(step: SectionId): SectionId | null {
  const i = stepIndex(step);
  return i > 0 ? STEPS[i - 1] : null;
}

/** `/builder/r123/target` or `/ar/builder/r123/target`. One place builds these. */
export function stepHref(lang: "ar" | "en", resumeId: string, step: SectionId): string {
  return `${lang === "ar" ? "/ar" : ""}/builder/${encodeURIComponent(resumeId)}/${step}`;
}

export function builderHome(lang: "ar" | "en"): string {
  return lang === "ar" ? "/ar/builder" : "/builder";
}

/* ─────────────────────────── copy ─────────────────────────── */

/**
 * Headings and subtitles for every section, in both languages.
 *
 * Shared with the legacy long page rather than copied into it: the two surfaces render
 * the same eleven sections, and two sets of headings would drift the first time one was
 * reworded.
 */
export const SECTION_COPY = {
  en: {
    sections: {
      start: "Where do you want to start?",
      target: "The job you are aiming for",
      personal: "How employers reach you",
      experience: "Your work experience",
      education: "Education",
      credentials: "Licenses & certifications",
      skills: "Skills",
      languages: "Languages",
      summary: "Professional summary",
      review: "Review",
      blueprint: "What we know about this job",
      design: "Design & download",
    } satisfies Record<SectionId, string>,
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
      blueprint: "Read it, then decide. Nothing here is on your CV yet.",
      design: "Content first, design last.",
    } satisfies Record<SectionId, string>,
    /** Short form, for the navigation rail where there is no room for a sentence. */
    nav: {
      start: "Start",
      target: "Target job",
      blueprint: "Job profile",
      personal: "Contact",
      experience: "Experience",
      education: "Education",
      credentials: "Licenses",
      skills: "Skills",
      languages: "Languages",
      summary: "Summary",
      review: "Review",
      design: "Download",
    } satisfies Record<SectionId, string>,
  },
  ar: {
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
      blueprint: "ما نعرفه عن هذه الوظيفة",
      design: "التصميم والتنزيل",
    } satisfies Record<SectionId, string>,
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
      blueprint: "اقرأها ثم قرّر. لا شيء منها في سيرتك بعد.",
      design: "المحتوى أولاً، التصميم أخيراً.",
    } satisfies Record<SectionId, string>,
    nav: {
      start: "البداية",
      target: "الوظيفة",
      blueprint: "ملف المهنة",
      personal: "التواصل",
      experience: "الخبرة",
      education: "التعليم",
      credentials: "الرخص",
      skills: "المهارات",
      languages: "اللغات",
      summary: "الملخص",
      review: "المراجعة",
      design: "التنزيل",
    } satisfies Record<SectionId, string>,
  },
};
