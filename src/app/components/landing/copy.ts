/**
 * Every word the cinematic landing says, both languages, one module.
 *
 * The scenes read from here and render ALL of it in the server HTML — the film is an
 * enhancement layered over real content, so a crawler, a screen reader, or a browser with
 * JavaScript off still receives the whole argument: what Sira is, what it does, and the CTA.
 */

export const LANDING_COPY = {
  en: {
    nav: { explore: "Explore", product: "Product", templates: "Templates", pricing: "Pricing", login: "Login", cta: "Start Building" },
    intro: {
      lines: ["Your career starts here.", "Not another resume builder.", "Your Career Operating System."],
      skip: "Skip intro",
      cta: "Start Building",
    },
    hero: {
      kicker: "Sira — Career Operating System",
      h1: "Your Career Operating System.",
      sub: "One confirmed profile. Every resume, match, application and interview flows from it — and nothing is ever invented about you.",
      cta: "Start Building",
      docTitle: "Career Profile",
      fields: { title: "Job title", exp: "Experience", skills: "Skills" },
      values: { title: "Radiology Technologist", exp: "4 years", skills: ["CT", "MRI", "PACS"] },
      hint: "You provide the facts once. Sira builds the professional profile.",
    },
    tailor: {
      kicker: "Job tailoring",
      h2: "Paste a job. Watch your resume answer it.",
      jdTitle: "Job Description",
      jd: [
        { text: "Senior CT Technologist — Riyadh", k: false },
        { text: "3+ years of CT experience required", k: true },
        { text: "PACS proficiency essential", k: true },
        { text: "SCFHS registration required", k: true },
        { text: "Team training experience preferred", k: true },
      ],
      resumeTitle: "Your resume",
      moves: [
        "CT experience moved to the top — the role leads with it",
        "PACS emphasized — named as essential",
        "SCFHS registration surfaced from your credentials",
        "Summary rephrased in the role's own wording",
      ],
      never: "Nothing you have not confirmed is ever added.",
      match: "ATS match",
    },
    road: {
      kicker: "The journey",
      h2: "One road, from profile to offer.",
      steps: [
        { t: "Career Profile", d: "Your confirmed facts — entered once." },
        { t: "Master Resume", d: "The source document every version derives from." },
        { t: "Job Tailoring", d: "Each application gets its own honest version." },
        { t: "ATS", d: "Scored against the real job, with reasons." },
        { t: "Application", d: "Sent, and tracked from one place." },
        { t: "Interview", d: "Prepared with your own experience." },
        { t: "Offer", d: "The destination — reached with what is true." },
      ],
    },
    mission: {
      kicker: "Career dashboard",
      h2: "Mission control for your career.",
      identity: "Career Profile",
      master: "Master Resume",
      stats: [
        { n: "3", l: "active applications" },
        { n: "1", l: "interview tomorrow" },
        { n: "2", l: "follow-ups needed" },
      ],
      jobs: [
        { role: "Senior CT Technologist", org: "Riyadh", status: "Interview tomorrow", tone: "focus" },
        { role: "MRI Technologist", org: "Jeddah", status: "Applied — follow up", tone: "wait" },
        { role: "Imaging Supervisor", org: "Dammam", status: "Resume needs tailoring", tone: "act" },
      ],
      alert: "1 ATS gap needs your evidence — team-training experience.",
      cta: "Open your dashboard",
    },
    interview: {
      kicker: "Interview preparation",
      h2: "The Orb asks. You answer. It coaches.",
      q: "“Tell me about a time you trained a team on a new CT protocol.”",
      a: "At Dallah Hospital I introduced the low-dose CT protocol — I wrote the quick guide and walked the night shift through it over two weeks…",
      checks: [
        { l: "Structure", ok: true },
        { l: "Relevance", ok: true },
        { l: "Evidence", ok: true },
        { l: "Clarity", ok: true },
        { l: "Result", ok: false },
      ],
      gap: "Missing the result — what changed after the training?",
      star: ["Situation", "Task", "Action", "Result"],
      note: "Sira never invents your experience. It helps you tell what is true, better.",
    },
    pricing: {
      kicker: "Pricing",
      h2: "Free to build. Pay once when it matters.",
      freeName: "Free",
      freeLines: ["Full builder, both languages", "Job matching & ATS check", "Watermarked downloads"],
      paidNote: "One payment. No subscription.",
      all: "Compare all plans",
      cta: "Unlock",
    },
    final: {
      s1: "Your next opportunity starts with what you already know.",
      s2: "Build your Career Profile.",
      cta: "Start Building",
    },
    footer: { rights: "Sira — by Rabit", terms: "Terms", privacy: "Privacy" },
  },
  ar: {
    nav: { explore: "استكشف", product: "المنتج", templates: "القوالب", pricing: "الأسعار", login: "تسجيل الدخول", cta: "ابدأ البناء" },
    intro: {
      lines: ["مسيرتك تبدأ من هنا.", "ليست أداة سير ذاتية أخرى.", "نظام تشغيل مسيرتك المهنية."],
      skip: "تخطَّ المقدمة",
      cta: "ابدأ البناء",
    },
    hero: {
      kicker: "سيرة — نظام تشغيل المسيرة المهنية",
      h1: "نظام تشغيل مسيرتك المهنية.",
      sub: "ملف واحد مؤكَّد. كل سيرة ومطابقة وتقديم ومقابلة تتدفق منه — ولا يُخترع عنك شيء أبداً.",
      cta: "ابدأ البناء",
      docTitle: "الملف المهني",
      fields: { title: "المسمى الوظيفي", exp: "الخبرة", skills: "المهارات" },
      values: { title: "أخصائي أشعة", exp: "٤ سنوات", skills: ["الأشعة المقطعية", "الرنين المغناطيسي", "PACS"] },
      hint: "تعطي الحقائق مرة واحدة، وسيرة تبني الملف المهني.",
    },
    tailor: {
      kicker: "التفصيل على الوظيفة",
      h2: "الصق وظيفة، وشاهد سيرتك تجيب عليها.",
      jdTitle: "الوصف الوظيفي",
      jd: [
        { text: "أخصائي أشعة مقطعية أول — الرياض", k: false },
        { text: "خبرة ٣ سنوات فأكثر في الأشعة المقطعية", k: true },
        { text: "إتقان نظام PACS أساسي", k: true },
        { text: "تسجيل هيئة التخصصات الصحية مطلوب", k: true },
        { text: "خبرة تدريب فريق ميزة إضافية", k: true },
      ],
      resumeTitle: "سيرتك",
      moves: [
        "خبرة الأشعة المقطعية صعدت للأعلى — الوظيفة تبدأ بها",
        "PACS أصبح بارزاً — ذُكر أساسياً",
        "تسجيل الهيئة ظهر من شهاداتك",
        "الملخص أعيدت صياغته بلغة الوظيفة نفسها",
      ],
      never: "لا يُضاف شيء لم تؤكده أنت.",
      match: "تطابق ATS",
    },
    road: {
      kicker: "الرحلة",
      h2: "طريق واحد، من الملف إلى العرض.",
      steps: [
        { t: "الملف المهني", d: "حقائقك المؤكدة — تُدخل مرة واحدة." },
        { t: "السيرة الأم", d: "المستند المصدر الذي تشتق منه كل نسخة." },
        { t: "التفصيل على الوظيفة", d: "كل تقديم يحصل على نسخته الصادقة." },
        { t: "فحص ATS", d: "درجة مقابل الوظيفة الحقيقية، مع الأسباب." },
        { t: "التقديم", d: "يُرسل ويُتابع من مكان واحد." },
        { t: "المقابلة", d: "تحضير مبني على خبرتك أنت." },
        { t: "العرض", d: "الوجهة — تصلها بما هو صحيح." },
      ],
    },
    mission: {
      kicker: "لوحة المسيرة",
      h2: "غرفة عمليات لمسيرتك المهنية.",
      identity: "الملف المهني",
      master: "السيرة الأم",
      stats: [
        { n: "٣", l: "تقديمات نشطة" },
        { n: "١", l: "مقابلة غداً" },
        { n: "٢", l: "متابعتان مطلوبتان" },
      ],
      jobs: [
        { role: "أخصائي أشعة مقطعية أول", org: "الرياض", status: "مقابلة غداً", tone: "focus" },
        { role: "أخصائي رنين مغناطيسي", org: "جدة", status: "قُدّمت — تحتاج متابعة", tone: "wait" },
        { role: "مشرف تصوير طبي", org: "الدمام", status: "السيرة تحتاج تفصيلاً", tone: "act" },
      ],
      alert: "فجوة ATS واحدة تحتاج دليلك — خبرة تدريب الفريق.",
      cta: "افتح لوحتك",
    },
    interview: {
      kicker: "تحضير المقابلة",
      h2: "الجرم يسأل. أنت تجيب. وهو يدرّب.",
      q: "«أخبرني عن مرة درّبت فيها فريقاً على بروتوكول أشعة مقطعية جديد.»",
      a: "في مستشفى دلة أدخلت بروتوكول الجرعة المنخفضة — كتبت الدليل السريع ودرّبت وردية الليل عليه خلال أسبوعين…",
      checks: [
        { l: "البنية", ok: true },
        { l: "الصلة", ok: true },
        { l: "الدليل", ok: true },
        { l: "الوضوح", ok: true },
        { l: "النتيجة", ok: false },
      ],
      gap: "النتيجة ناقصة — ماذا تغيّر بعد التدريب؟",
      star: ["الموقف", "المهمة", "الفعل", "النتيجة"],
      note: "سيرة لا تخترع خبرتك أبداً. تساعدك أن تروي الصحيح، بشكل أفضل.",
    },
    pricing: {
      kicker: "الأسعار",
      h2: "البناء مجاني. تدفع مرة واحدة عندما يهم الأمر.",
      freeName: "مجاني",
      freeLines: ["البِنّاء كاملاً، باللغتين", "مطابقة الوظائف وفحص ATS", "تنزيلات بعلامة مائية"],
      paidNote: "دفعة واحدة. بدون اشتراك.",
      all: "قارن كل الخطط",
      cta: "افتح الوصول",
    },
    final: {
      s1: "فرصتك القادمة تبدأ مما تعرفه بالفعل.",
      s2: "ابنِ ملفك المهني.",
      cta: "ابدأ البناء",
    },
    footer: { rights: "سيرة — من رابِت", terms: "الشروط", privacy: "الخصوصية" },
  },
} as const;

export type LandingCopy = (typeof LANDING_COPY)["en"] | (typeof LANDING_COPY)["ar"];
