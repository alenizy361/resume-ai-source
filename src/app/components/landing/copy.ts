/**
 * Every word the landing says, both languages, one module.
 *
 * The scenes read from here and render ALL of it in the server HTML, so a crawler, a screen
 * reader, or a browser with JavaScript off still gets the whole argument.
 *
 * ── the voice, and what was edited OUT of it ──
 *
 * The first draft of this file read like machine copy: em-dash asides in every sentence,
 * mirrored three-beat aphorisms, and "Career Operating System" translated literally into
 * Arabic where it lands as foreign. This revision is written to conversion-copy rules that
 * hold up in this market: the HEADLINE sells the outcome (the job), not the tool; claims are
 * concrete (Arabic and English, passes screening software, free, no signup) rather than
 * grand; each language is written in its own idiom, not translated from the other; and the
 * one honesty promise the product actually keeps is said once, plainly, instead of chanted.
 */

export const LANDING_COPY = {
  en: {
    nav: { explore: "Examples", product: "How it works", templates: "Templates", pricing: "Pricing", login: "Sign in", cta: "Build my resume" },
    intro: {
      lines: ["Your next job is closer than you think.", "It starts with your resume.", "Let's make yours impossible to ignore."],
      skip: "Skip",
      cta: "Build my resume",
    },
    hero: {
      kicker: "Sira · Resume, job match, interview",
      h1: "Your next job starts with your resume.",
      sub: "Enter your details once. Sira turns them into a clean, professional resume in Arabic and English, matches it to real job ads, and gets it past the screening software recruiters use. Free to build, no signup.",
      cta: "Build my resume",
      docTitle: "Career Profile",
      fields: { title: "Job title", exp: "Experience", skills: "Skills" },
      values: { title: "Radiology Technologist", exp: "4 years", skills: ["CT", "MRI", "PACS"] },
      hint: "You write it once. Every resume, application and interview builds on it.",
    },
    tailor: {
      kicker: "Match it to the job",
      h2: "Paste a job ad. Your resume adapts to it.",
      jdTitle: "Job ad",
      jd: [
        { text: "Senior CT Technologist, Riyadh", k: false },
        { text: "3+ years of CT experience required", k: true },
        { text: "PACS proficiency essential", k: true },
        { text: "SCFHS registration required", k: true },
        { text: "Team training experience preferred", k: true },
      ],
      resumeTitle: "Your resume",
      moves: [
        "Your CT experience moves to the top, because the job leads with it",
        "PACS gets emphasis, the ad calls it essential",
        "Your SCFHS registration is pulled up from your credentials",
        "Your summary is rewritten in the job's own wording",
      ],
      never: "Only what you actually did goes in. Nothing gets made up.",
      match: "Match score",
    },
    road: {
      kicker: "The full journey",
      h2: "From first draft to job offer, in one place.",
      steps: [
        { t: "Career Profile", d: "Your experience and skills, written down once." },
        { t: "Master Resume", d: "The clean base version every application starts from." },
        { t: "Tailored Versions", d: "A fitted resume for each job you apply to." },
        { t: "Screening Check", d: "See your match score and what to fix before you send it." },
        { t: "Applications", d: "Track where you applied and what happened." },
        { t: "Interview Practice", d: "Rehearse answers built on your real experience." },
        { t: "The Offer", d: "Where all of this is headed." },
      ],
    },
    mission: {
      kicker: "Your dashboard",
      h2: "Every application, one screen.",
      identity: "Career Profile",
      master: "Master Resume",
      stats: [
        { n: "3", l: "active applications" },
        { n: "1", l: "interview tomorrow" },
        { n: "2", l: "need a follow-up" },
      ],
      jobs: [
        { role: "Senior CT Technologist", org: "Riyadh", status: "Interview tomorrow", tone: "focus" },
        { role: "MRI Technologist", org: "Jeddah", status: "Applied, follow up", tone: "wait" },
        { role: "Imaging Supervisor", org: "Dammam", status: "Resume needs tailoring", tone: "act" },
      ],
      alert: "One gap in your CT job match needs your input: team training experience.",
      cta: "Open my dashboard",
    },
    interview: {
      kicker: "Interview practice",
      h2: "Rehearse before it counts.",
      q: "“Tell me about a time you trained a team on a new CT protocol.”",
      a: "At Dallah Hospital I introduced the low-dose CT protocol. I wrote the quick guide and walked the night shift through it over two weeks…",
      checks: [
        { l: "Structure", ok: true },
        { l: "Relevance", ok: true },
        { l: "Evidence", ok: true },
        { l: "Clarity", ok: true },
        { l: "Result", ok: false },
      ],
      gap: "One thing missing: what changed after the training? End with the result.",
      star: ["Situation", "Task", "Action", "Result"],
      note: "The practice is built on your real experience, so the answers stay yours.",
    },
    pricing: {
      kicker: "Pricing",
      h2: "Build for free. Pay once, only when you need the extras.",
      freeName: "Free",
      freeAmount: "Free",
      freeLines: ["The full builder, Arabic and English", "Job matching and screening check", "Downloads carry a small watermark"],
      paidNote: "One payment. No subscription.",
      all: "Compare all plans",
      cta: "Unlock",
    },
    final: {
      s1: "You already have what it takes. Put it on paper properly.",
      s2: "It takes about ten minutes.",
      cta: "Build my resume",
    },
    footer: { rights: "Sira, by Rabit", terms: "Terms", privacy: "Privacy" },
  },
  ar: {
    nav: { explore: "نماذج", product: "كيف تعمل", templates: "القوالب", pricing: "الأسعار", login: "تسجيل الدخول", cta: "ابنِ سيرتك" },
    intro: {
      lines: ["وظيفتك القادمة أقرب مما تتوقع.", "وأول خطوة لها سيرتك الذاتية.", "خلّنا نجعلها تفتح لك الأبواب."],
      skip: "تخطّي",
      cta: "ابنِ سيرتك",
    },
    hero: {
      kicker: "سيرة · سيرة ذاتية، مطابقة وظائف، تجهيز مقابلات",
      h1: "وظيفتك القادمة تبدأ من سيرتك.",
      sub: "اكتب معلوماتك مرة واحدة، وسيرة ترتّبها لك سيرة احترافية بالعربي والإنجليزي، تطابقها مع إعلانات وظائف حقيقية، وتضمن أنها تعدّي برامج الفرز التي تستخدمها الشركات. البناء مجاني وبدون تسجيل.",
      cta: "ابنِ سيرتك",
      docTitle: "الملف المهني",
      fields: { title: "المسمى الوظيفي", exp: "الخبرة", skills: "المهارات" },
      values: { title: "أخصائي أشعة", exp: "٤ سنوات", skills: ["الأشعة المقطعية", "الرنين المغناطيسي", "PACS"] },
      hint: "تكتبها مرة واحدة، وكل سيرة وتقديم ومقابلة يُبنى عليها.",
    },
    tailor: {
      kicker: "طابقها مع الوظيفة",
      h2: "الصق إعلان الوظيفة، وسيرتك تتكيّف معه.",
      jdTitle: "إعلان الوظيفة",
      jd: [
        { text: "أخصائي أشعة مقطعية أول، الرياض", k: false },
        { text: "خبرة ٣ سنوات فأكثر في الأشعة المقطعية", k: true },
        { text: "إتقان نظام PACS أساسي", k: true },
        { text: "تسجيل هيئة التخصصات الصحية مطلوب", k: true },
        { text: "خبرة تدريب فريق ميزة إضافية", k: true },
      ],
      resumeTitle: "سيرتك",
      moves: [
        "خبرتك في الأشعة المقطعية تصعد للأعلى لأن الوظيفة تبدأ بها",
        "PACS يأخذ مساحة أوضح لأن الإعلان يعتبره أساسياً",
        "تسجيلك في هيئة التخصصات يظهر من شهاداتك",
        "ملخصك يُعاد بصياغة الإعلان نفسه",
      ],
      never: "ما يدخل سيرتك إلا الذي فعلته فعلاً. ما نضيف شيئاً من عندنا.",
      match: "نسبة التطابق",
    },
    road: {
      kicker: "الرحلة كاملة",
      h2: "من أول مسودة إلى عرض العمل، في مكان واحد.",
      steps: [
        { t: "الملف المهني", d: "خبراتك ومهاراتك، مكتوبة مرة واحدة." },
        { t: "السيرة الأساس", d: "النسخة النظيفة التي يبدأ منها كل تقديم." },
        { t: "نسخ مفصّلة", d: "سيرة مضبوطة لكل وظيفة تقدّم عليها." },
        { t: "فحص الفرز", d: "شف نسبة تطابقك وما الذي تصلحه قبل الإرسال." },
        { t: "التقديمات", d: "تابع أين قدّمت وماذا صار." },
        { t: "تجهيز المقابلة", d: "تدرّب على إجابات مبنية على خبرتك الحقيقية." },
        { t: "عرض العمل", d: "الهدف الذي نشتغل له من البداية." },
      ],
    },
    mission: {
      kicker: "لوحتك",
      h2: "كل تقديماتك في شاشة واحدة.",
      identity: "الملف المهني",
      master: "السيرة الأساس",
      stats: [
        { n: "٣", l: "تقديمات نشطة" },
        { n: "١", l: "مقابلة غداً" },
        { n: "٢", l: "تحتاج متابعة" },
      ],
      jobs: [
        { role: "أخصائي أشعة مقطعية أول", org: "الرياض", status: "مقابلة غداً", tone: "focus" },
        { role: "أخصائي رنين مغناطيسي", org: "جدة", status: "قدّمت، تحتاج متابعة", tone: "wait" },
        { role: "مشرف تصوير طبي", org: "الدمام", status: "السيرة تحتاج ضبطاً", tone: "act" },
      ],
      alert: "نقطة واحدة في تطابقك تحتاج منك إجابة: خبرة تدريب الفريق.",
      cta: "افتح لوحتي",
    },
    interview: {
      kicker: "تجهيز المقابلة",
      h2: "تدرّب قبل ما تكون المقابلة على حقيقتها.",
      q: "«حدّثني عن مرة درّبت فيها فريقاً على بروتوكول أشعة مقطعية جديد.»",
      a: "في مستشفى دلة أدخلت بروتوكول الجرعة المنخفضة. كتبت الدليل السريع ودرّبت وردية الليل عليه خلال أسبوعين…",
      checks: [
        { l: "الترتيب", ok: true },
        { l: "الصلة", ok: true },
        { l: "الدليل", ok: true },
        { l: "الوضوح", ok: true },
        { l: "النتيجة", ok: false },
      ],
      gap: "ناقصك شيء واحد: ماذا تغيّر بعد التدريب؟ اختم بالنتيجة.",
      star: ["الموقف", "المهمة", "الفعل", "النتيجة"],
      note: "التدريب مبني على خبرتك الحقيقية، فالإجابات تبقى إجاباتك.",
    },
    pricing: {
      kicker: "الأسعار",
      h2: "ابنِ مجاناً، وادفع مرة واحدة فقط عند حاجتك للمزايا الكاملة.",
      freeName: "مجاني",
      freeAmount: "مجاناً",
      freeLines: ["البنّاء كامل، بالعربي والإنجليزي", "مطابقة الوظائف وفحص الفرز", "التنزيلات تحمل علامة مائية صغيرة"],
      paidNote: "دفعة واحدة. بدون اشتراك.",
      all: "قارن كل الخطط",
      cta: "افتح المزايا",
    },
    final: {
      s1: "أنت مؤهل أكثر مما تكتبه سيرتك الحالية. خلّنا نصلح هذا.",
      s2: "تحتاج عشر دقائق تقريباً.",
      cta: "ابنِ سيرتك",
    },
    footer: { rights: "سيرة، من رابِت", terms: "الشروط", privacy: "الخصوصية" },
  },
} as const;

export type LandingCopy = (typeof LANDING_COPY)["en"] | (typeof LANDING_COPY)["ar"];
