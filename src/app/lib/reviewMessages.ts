/**
 * The review's findings, in the language of the CV.
 *
 * ── the bug this closes ──
 *
 * `reviewChecks.ts` produces its titles and details as English strings, inline, at the point each
 * check fires. So an Arabic user builds an Arabic CV, reaches the review, and is told "Weak openers"
 * and "Two bullets say the same thing" in English — the one stage of the builder that switches
 * language on them, at the moment they are deciding whether their CV is finished.
 *
 * The scoring is not the problem and is not touched. The checks are deterministic, they are already
 * tested by 91 assertions in `ops/reviewchecks.test.mjs`, and rewriting them to carry two strings each
 * would double the surface of the file whose correctness matters most. What was missing is a table.
 *
 * ── why keyed by id rather than translated in place ──
 *
 * Every finding already has a stable id, because the UI needs one to jump to the right section. That
 * id is a better translation key than the English sentence: a reworded English title does not silently
 * orphan its Arabic, and a NEW check that forgets its Arabic is caught by a test that walks the ids
 * rather than by someone noticing on a screenshot.
 *
 * The English is the fallback, deliberately. A missing Arabic string shows English — imperfect and
 * legible — rather than an empty finding, which would hide a real problem with the CV in the name of
 * consistency.
 */

export interface LocalizedFinding {
  title: string;
  detail: string;
  /** The one-line "how to fix it". Absent when the reader's language has none — see `AR_FIX`. */
  fixHint?: string;
}

/**
 * Arabic for every finding id.
 *
 * `detail` is written to explain rather than to scold, matching the English. A review that reads as a
 * telling-off is a review people close — and this one appears at the exact moment someone is deciding
 * whether their CV is good enough to send.
 *
 * `{n}` is substituted with the count the check reported, so the Arabic sentence can put the number
 * where Arabic puts it rather than where English does.
 */
const AR: Record<string, LocalizedFinding> = {
  /* ── errors: things that are missing ── */
  /*
   * The language mismatch, in the language of the person reading it.
   *
   * Both sentences deliberately avoid blaming: choosing English and typing Arabic is a thing a
   * bilingual person does without noticing, and the finding's job is to make it visible before an
   * employer's filter does — not to imply a mistake was made.
   */
  "language-mismatch:input-not-authoring": {
    title: "لغة السيرة لا تطابق ما كُتب فيها",
    detail: "اخترتَ لغةً للسيرة وكتبتَ محتواها بلغة أخرى. أياً كانت الصحيحة، لا بد أن تتفقا — فالبحث بلغةٍ لا يجد نصاً مكتوباً بغيرها.",
  },
  "language-mismatch:input-mixed": {
    title: "السيرة مكتوبة بلغتين",
    detail: "مهامك ومهاراتك مكتوبة بالعربية والإنجليزية معاً. نظام الفرز يفهرس مستنداً واحداً بلغة واحدة، والمستند المقسوم لا يطابق أي بحث، والقارئ البشري يضطر لتغيير اتجاه القراءة في منتصف الصفحة.",
  },
  "missing-contact": {
    title: "لا توجد وسيلة للتواصل",
    detail: "لا يوجد بريد ولا رقم هاتف. صاحب العمل الذي أعجبته سيرتك لن يجد طريقة يصل بها إليك.",
  },
  "missing-dates": {
    title: "خبرة بلا تواريخ",
    detail: "وظيفة بلا تاريخ بداية تُقرأ كفجوة في سيرتك، وأنظمة التتبع تتجاهلها أحياناً بالكامل.",
  },
  "empty-experience": {
    title: "لا توجد خبرة عملية",
    detail: "قسم الخبرة هو أول ما يقرأه المُوظِّف. حتى تدريب صيفي واحد أفضل من قسم فارغ.",
  },
  "empty-skills": {
    title: "لا توجد مهارات",
    detail: "أنظمة التتبع تطابق المهارات نصاً. قسم مهارات فارغ يعني صفر تطابق مهما كانت خبرتك.",
  },
  "empty-education": {
    title: "لا يوجد تعليم",
    detail: "أضف مؤهلك حتى لو لم يكن جامعياً — الشهادة الثانوية والدورات المهنية تُحتسب.",
  },
  "no-summary": {
    title: "لا يوجد ملخص مهني",
    detail: "الملخص هو السطور الثلاثة التي تُقرأ أولاً. بدونه يبدأ القارئ من وظيفتك الأخيرة وحدها.",
  },
  "pending-suggestions": {
    title: "اقتراحات لم تؤكّدها بعد",
    detail: "لديك {n} اقتراحاً معروضاً ولم تنقره. لا شيء منها في سيرتك — انقر ما ينطبق عليك أو تجاهله.",
  },

  /* ── recommendations: things that could be better ── */
  "duplicate-skills": {
    title: "مهارات مكرّرة",
    detail: "نفس المهارة مذكورة أكثر من مرة. التكرار لا يزيد التطابق، ويشغل مساحة يقرؤها المُوظِّف.",
  },
  "repeated-duties": {
    title: "مهام متشابهة",
    detail: "نقطتان تقولان الشيء نفسه بصياغتين. احتفظ بالأوضح واحذف الأخرى — المساحة أثمن من العدد.",
  },
  "long-bullets": {
    title: "نقاط طويلة",
    detail: "{n} نقطة تتجاوز الطول الذي يُقرأ فعلاً. النقطة فوق أربعين كلمة تُمسح بالعين لا تُقرأ.",
  },
  "weak-openers": {
    title: "بدايات ضعيفة",
    detail: "نقاط تبدأ بـ«مسؤول عن» أو «القيام بـ» تصف توصيفاً وظيفياً لا شخصاً. ابدأ بفعل: نفّذت، أدرت، راجعت.",
  },
  "no-linkedin": {
    title: "لا يوجد رابط لينكدإن",
    detail: "أغلب المُوظِّفين في السوق السعودي يبحثون عن الملف قبل المقابلة. غيابه ليس خطأً لكنه فرصة ضائعة.",
  },
  "past-role-heavier": {
    title: "وظيفة قديمة أطول من الحالية",
    detail: "وظيفتك الأقدم فيها تفاصيل أكثر من الحالية. القارئ يفترض أن الأحدث هي الأهم.",
  },
  "title-mismatch": {
    title: "المسمى لا يطابق الهدف",
    detail: "المسمى في سيرتك يختلف عن الوظيفة التي تستهدفها. هذا مقبول، لكن اذكر الصلة في الملخص.",
  },
  "missing-from-cv": {
    title: "متطلبات في الإعلان غير موجودة في سيرتك",
    detail: "الإعلان يذكر {n} مصطلحاً لا يظهر في سيرتك. أضف ما تملكه فعلاً — ولا تضف ما لا تملكه.",
  },
  "unsupported-requirements": {
    title: "ادعاءات بلا دليل",
    detail: "مصطلح موجود في سيرتك ولا تدعمه أي خبرة مؤكَّدة. المقابلة ستسأل عنه.",
  },
};

/**
 * Dimension labels — the named scores on the review's dial.
 *
 * Separate table because they are labels, not findings: no detail, no count, and they appear whether
 * or not anything is wrong.
 */
/**
 * The one-line "how to fix it", in Arabic.
 *
 * A separate table rather than a field on every `AR` entry: only fourteen findings carry a hint, and
 * threading an optional field through twenty-five entries to fill fourteen of them is a bigger diff
 * that says less. Keyed by the same id — or its stem — that `localizeFinding` looks up.
 */
const AR_FIX: Record<string, string> = {
  "missing-contact": "البيانات الشخصية ← الجوال والبريد الإلكتروني.",
  "missing-dates": "الشهر والسنة يكفيان، مثل «سبتمبر ٢٠٢٤».",
  "pending-suggestions": "كل عنصر يمكن اعتماده، أو تعديله أولاً، أو رفضه.",
  "expired-credential": "حدِّث تاريخ الانتهاء، أو احذفها حتى تُجدَّد.",
  "title-mismatch": "استخدم التهجئة التي يكتبها الإعلان الوظيفي.",
  "repeated-duties": "أبقِها في الوظيفة التي كانت الأهم فيها، واذكر ما اختلف في الأخرى.",
  "long-bullets": "إنجاز واحد لكل سطر؛ وزّع البقية على سطر ثانٍ.",
  "weak-openers": "ابدأ بالفعل: شغّلت، قدت، خفّضت، دربت، بنيت.",
  "keyword-stuffing": "أبقِها في قائمة المهارات وفي السطر الواحد الذي تستطيع إثباتها فيه.",
  "past-role-heavier": "انقل سطراً من التفاصيل إلى الوظيفة الأحدث، أو اختصر الأقدم.",
  "missing-from-cv": "أضِفها في القسم الذي تنتمي إليه، بكلماتك أنت.",
  "unsupported-requirements": "تمتلكها فعلاً؟ أضِفها في القسم المناسب ثم أعد هذه المراجعة.",
  "duplicate-skills": "احذف المكرّرة من قائمة المهارات.",
};

const AR_DIMENSIONS: Record<string, string> = {
  completeness: "الاكتمال",
  specificity: "التحديد",
  evidence: "الأدلة",
  readability: "سهولة القراءة",
  "ats-structure": "التوافق مع أنظمة التتبع",
  language: "جودة اللغة",
  "keyword-alignment": "تطابق الكلمات المفتاحية",
  "title-alignment": "تطابق المسمى",
  "relevant-experience": "الخبرة ذات الصلة",
  /*
   * These three are built when a job advert is present, and they were missed by reading the source for
   * `id: "..."` literals — the test found them by running real reports instead. That is the difference
   * between a list that matches itself and one that matches what a user can be shown.
   */
  "required-coverage": "تغطية المتطلبات الأساسية",
  "preferred-coverage": "تغطية المتطلبات المفضّلة",
  "credential-alignment": "تطابق الاعتمادات",
};

/**
 * Localize one finding.
 *
 * Falls back to the English the check produced. That is the honest failure: a finding shown in English
 * is imperfect and legible, and an empty one hides a real problem with someone's CV to keep a screen
 * consistent.
 */
export function localizeFinding(
  f: { id: string; title: string; detail: string; fixHint?: string },
  lang: "ar" | "en",
  count?: number,
): LocalizedFinding {
  if (lang === "en") return { title: f.title, detail: f.detail, fixHint: f.fixHint };
  /*
   * Exact id first, then the STEM before the colon.
   *
   * Three findings mint per-item ids — `expired-credential:<id>`, `keyword-stuffing:<term>`,
   * `thin-role:<i>` — so an exact-match table could never hold them and the "English fallback" was
   * permanent rather than a degradation. One of them (an expired credential) is CRITICAL, so an
   * Arabic reader met a red English block at the moment they decide whether the CV is finished.
   */
  const hit = AR[f.id] ?? AR[f.id.split(":")[0]];
  /*
   * The hint is localized SEPARATELY, and rendering the English one was the other half of the bug.
   * `ReviewSection` printed `f.fixHint` raw, so an otherwise-Arabic finding ended in "Month and year
   * is enough, e.g. \"Sep 2024\"." Returning `undefined` when there is no Arabic hint is deliberate:
   * losing a line of help is better than a sentence that switches language mid-finding, and the
   * title and detail already carry the substance.
   */
  const fixHint = AR_FIX[f.id] ?? AR_FIX[f.id.split(":")[0]];
  if (!hit) return { title: f.title, detail: f.detail, fixHint };
  const n = typeof count === "number" ? toArabicDigits(count) : "";
  return {
    title: hit.title,
    detail: n ? hit.detail.replace(/\{n\}/g, n) : hit.detail.replace(/\s*\{n\}\s*/g, " "),
    fixHint,
  };
}

export function localizeDimension(id: string, label: string, lang: "ar" | "en"): string {
  return lang === "ar" ? (AR_DIMENSIONS[id] ?? label) : label;
}

/** Arabic-Indic digits, so a count inside an Arabic sentence is written the way Arabic writes it. */
function toArabicDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** Every id with an Arabic finding, so a test can prove no check is orphaned. */
export const LOCALIZED_FINDING_IDS = Object.keys(AR);
export const LOCALIZED_DIMENSION_IDS = Object.keys(AR_DIMENSIONS);
