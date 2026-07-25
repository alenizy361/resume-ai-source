/**
 * A sentence for every reason a step is not ready, in the reader's language.
 *
 * Kept apart from `stepReady.ts` so the validators stay pure and testable in plain Node, and so the
 * codes cannot be shown to a user by accident. That is not a hypothetical: this codebase has already
 * printed `http-500` to a jobseeker because an internal token and a human sentence shared one field.
 *
 * The rule these strings follow: name the FIELD, not the step. "Target job is incomplete" makes the
 * user open a form and hunt; "the target country is missing" sends them to one input. Every code
 * here has a sentence, and an unmapped code falls back to prose rather than printing itself.
 */

const EN: Record<string, string> = {
  "no-title": "The job title you are aiming for is missing.",
  "no-country": "The country you are applying in is missing — it decides which credentials apply.",
  "no-cv-language": "The language the CV itself will be written in has not been chosen.",
  "no-name": "Your full name is missing.",
  "no-contact": "There is no email or phone number for an employer to reach you on.",
  "no-experience": "No work experience has been added yet.",
  "role-no-title": "One of your jobs has no position title.",
  "role-no-employer": "One of your jobs has no employer.",
  "role-no-start": "One of your jobs has no start date.",
};

const AR: Record<string, string> = {
  "no-title": "المسمى الوظيفي المستهدف غير مكتوب.",
  "no-country": "الدولة التي تتقدم فيها غير محددة — وهي التي تحدد الاعتمادات المطلوبة.",
  "no-cv-language": "لغة السيرة نفسها لم تُختَر بعد.",
  "no-name": "الاسم الكامل ناقص.",
  "no-contact": "لا يوجد بريد ولا رقم هاتف يتواصل عبره صاحب العمل.",
  "no-experience": "لم تُضَف أي خبرة عمل بعد.",
  "role-no-title": "إحدى وظائفك بلا مسمى.",
  "role-no-employer": "إحدى وظائفك بلا جهة عمل.",
  "role-no-start": "إحدى وظائفك بلا تاريخ بداية.",
};

/**
 * The sentence for one missing-field code.
 *
 * Falls back to a generic sentence rather than to the code. An unmapped code reaching the screen as
 * itself is the failure this indirection exists to prevent, so the fallback is prose and never the
 * identifier.
 */
export function missingLabel(code: string, lang: "ar" | "en"): string {
  const table = lang === "ar" ? AR : EN;
  return table[code] ?? (lang === "ar" ? "هناك حقل مطلوب ناقص." : "A required field is missing.");
}

/** Every code that has a sentence, so a test can prove none is orphaned. */
export const MESSAGE_CODES = Object.keys(EN);
