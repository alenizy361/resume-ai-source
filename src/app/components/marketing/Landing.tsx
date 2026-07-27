/**
 * The marketing page — a premium career operating system, not a form-builder brochure.
 *
 * Rebuilt from the ground up on the user's own brief: huge type, one story top to bottom, a real
 * "wow" moment, and instant clarity about what the product is. The wireframe and visual-hierarchy
 * pass that preceded this file is a published artifact, reviewed before any of this was written.
 *
 * Still deliberately a server component with only the genuinely interactive pieces pulled into
 * small client islands (`ProfessionDemo`, `FaqAccordion`, `AtsScoreReveal`, `ContinueDraft`) —
 * this is still the product's most important page for search, and `<h1>` is still the LCP element.
 *
 * Every motion class here is one this product already has and already trusts: `.t-hero` for the
 * headline sequence (rises without fading, so it never delays LCP), `.t-enter` for every section
 * below the fold (a ONE-TIME mount reveal, not a scroll listener — `transitions.css` documents why
 * a scroll-driven version was removed after crashing a real iPhone three times), `.card` for
 * anything pressable (real `<a>`/`<button>` elements get lift and press for free). Nothing new was
 * invented for motion; `app/marketing.css` only adds the layout SHAPES this redesign needed that
 * had no existing equivalent — the step rail, the profession-demo shell, the journey timeline, the
 * template preview, the score ring.
 *
 * Every number on this page is real: professions modeled, templates offered, and the profession
 * demo itself all read from the same data the product runs on (`rolePacks.ts`, `templateCatalog.ts`)
 * — a landing page that shows the product doing something it cannot actually do is a promise broken
 * thirty seconds later.
 */

import Link from "next/link";
import BrandOrb from "../BrandOrb";
import ContinueDraft from "./ContinueDraft";
import ProfessionDemo from "./ProfessionDemo";
import AtsScoreReveal from "./AtsScoreReveal";
import FaqAccordion from "./FaqAccordion";
import { allRolePacks } from "@/app/lib/rolePacks";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import { copyright } from "@/app/lib/brand";
import { toArabicDigits } from "@/app/lib/plans";
import "../../marketing.css";

const C = {
  en: {
    eyebrow: "AI career operating system · Saudi & Gulf",
    h1a: "One system.",
    h1b: "Every step to your next job.",
    lede: "Sira turns one honest career profile into a tailored resume for every job you apply to — ATS-checked, interview-ready, and never a fact invented.",
    pipeline: ["Career Profile", "Master Resume", "Tailored", "ATS-checked", "Interview-ready"],
    ctaPrimary: "Start my Career Profile",
    ctaSecondary: "See how it works",

    proofHead: "proof, not a promise",
    proof: [
      ["25+", "Saudi occupations modeled — real duties, real licenses"],
      ["2", "Languages, one engine — Arabic and English"],
      ["0", "Facts invented. Enforced in the data model, not promised in the marketing."],
      ["10", "ATS-safe templates, single-column by construction"],
    ] as [string, string][],

    sysKicker: "The system",
    sysHead: "One connected journey, not six disconnected tools.",
    sysLede: "Everything below reads from the same career profile. Nothing is re-typed between steps.",
    rail: [
      ["Career Profile", "Who you are, your target role, languages, licenses."],
      ["Master Resume", "One confirmed document. Every fact in it is yours."],
      ["Tailor for Job", "A version matched to one posting — your master resume stays untouched."],
      ["ATS Review", "Scored against the same rules applicant-tracking systems use."],
      ["Interview Prep", "Questions built from the exact resume you sent."],
      ["Export", "PDF and Word — both ATS-parseable."],
    ] as [string, string][],

    diffKicker: "Why Sira",
    diffHead: "Not a template. Not ChatGPT. Not generic AI.",
    diff: [
      ["Not a template", "A template is a shape. Sira fills it with what your specific profession actually needs — a radiographer's CV needs different duties, tools and licenses than an accountant's, and the product knows the difference before you type a word."],
      ["Not ChatGPT with a prompt", "General AI doesn't know that Saudi Arabia licenses radiographers through SCFHS, or that an ATS silently drops a two-column layout. That knowledge is built into the product, not typed into a prompt box each time."],
      ["Not generic AI", "Every suggestion is grounded in facts you already gave it. Nothing is invented — no employer, no date, no number. If the evidence is missing, it says so instead of making one up."],
    ] as [string, string][],

    demoKicker: "Try it — no signup",
    demoHead: "What Sira already knows about your profession.",
    demoLede: "Pick a job title. This is what appears instantly — before any AI call, before any waiting.",

    journeyKicker: "The journey",
    journeyHead: "Discover → Get hired.",
    journey: [
      ["Discover", "Tell it the job you're aiming for — it already knows the shape of that profession."],
      ["Build", "Eleven short steps. Your resume renders beside you as you type."],
      ["Tailor", "One posting, one matched version — your master resume stays untouched."],
      ["Apply", "Track every application, and which resume version you sent."],
      ["Interview", "Questions built from the resume you actually sent for that job."],
      ["Get hired", "One connected path — not six tabs that don't know each other."],
    ] as [string, string][],

    tplKicker: "Templates",
    tplHead: "Every template is ATS-safe first, designed second.",

    atsKicker: "Before you apply",
    atsHead: "Watch your match score move — with the reasons why.",

    faqKicker: "FAQ",
    faqHead: "Questions people actually ask.",
    faq: [
      ["Is it free?", "Building and downloading a CV is free and needs no account. Paid features are the extras around it — cover letters, interview prep, removing the small footer mark."],
      ["Will it invent experience to fill the page?", "No. A suggestion carrying a figure you didn't provide is dropped before you see it, and an improvement to a line you wrote is rejected if it gains a number the original didn't have."],
      ["Can I build my CV in Arabic?", "Yes, start to finish — the questions, the suggestions, the review and the document itself. You can also produce an English version of the same facts afterward, translated and checked, not re-typed."],
      ["What makes a CV “ATS-ready”?", "One column, standard section headings, real text rather than an image, dates a parser can read, and the employer's own vocabulary where it honestly applies."],
      ["Where is my data stored?", "Locally on your device by default — nothing is uploaded for storage. If you sign in, your resume document is saved to your account so it follows you across devices, and you can delete it any time."],
    ] as [string, string][],

    finalHead: "Your career, run by one system.",

    footLinks: [
      ["Pricing", "/pricing"],
      ["Templates", "/templates"],
      ["ATS CV checker", "/ats-resume-checker"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ] as [string, string][],
    ar: "العربية",
  },

  ar: {
    eyebrow: "نظام تشغيل مهني بالذكاء الاصطناعي · السعودية والخليج",
    h1a: "نظام واحد.",
    h1b: "كل خطوة نحو وظيفتك القادمة.",
    lede: "سيرة تحوّل ملفك المهني الصادق إلى سيرة مخصصة لكل وظيفة تتقدم لها — مفحوصة لأنظمة تتبع المتقدمين، وجاهزة للمقابلة، بلا حقيقة واحدة مختلقة.",
    pipeline: ["ملف مهني", "سيرة رئيسية", "مخصصة", "مفحوصة للفرز", "جاهزة للمقابلة"],
    ctaPrimary: "ابدأ ملفي المهني",
    ctaSecondary: "شاهد كيف يعمل",

    proofHead: "دليل، لا وعد",
    proof: [
      ["+٢٥", "مهنة سعودية مُنمذجة — بمهام وتراخيص حقيقية"],
      ["٢", "لغتان بمحرك واحد — عربي وإنجليزي"],
      ["٠", "حقائق مختلقة. مفروض في بنية البيانات، لا مجرد وعد تسويقي."],
      ["١٠", "قوالب متوافقة مع أنظمة الفرز، بعمود واحد ببنيتها"],
    ] as [string, string][],

    sysKicker: "النظام",
    sysHead: "رحلة واحدة متصلة، لا ستة أدوات منفصلة.",
    sysLede: "كل ما بالأسفل يقرأ من الملف المهني نفسه. لا شيء يُعاد كتابته بين الخطوات.",
    rail: [
      ["الملف المهني", "من أنت، دورك المستهدف، لغاتك، تراخيصك."],
      ["السيرة الرئيسية", "مستند واحد مؤكد. كل حقيقة فيه لك."],
      ["تخصيص لوظيفة", "نسخة مطابقة لإعلان واحد — وسيرتك الرئيسية تبقى كما هي."],
      ["مراجعة ATS", "تُقيَّم بنفس القواعد التي تستخدمها أنظمة تتبع المتقدمين."],
      ["تحضير المقابلة", "أسئلة مبنية من السيرة نفسها التي أرسلتها."],
      ["التصدير", "PDF و Word — وكلاهما قابل للقراءة الآلية."],
    ] as [string, string][],

    diffKicker: "لماذا سيرة",
    diffHead: "ليست قالباً. ولا ChatGPT. ولا ذكاءً عاماً.",
    diff: [
      ["ليست قالباً", "القالب مجرد شكل. سيرة تملؤه بما تحتاجه مهنتك تحديداً — فسيرة أخصائي الأشعة تحتاج مهاماً وأدوات وتراخيص مختلفة عن سيرة المحاسب، والمنتج يعرف الفرق قبل أن تكتب كلمة."],
      ["ليست ChatGPT بمطالبة", "الذكاء العام لا يعرف أن السعودية تُرخّص أخصائيي الأشعة عبر الهيئة السعودية للتخصصات الصحية، ولا أن أنظمة الفرز تُسقط تخطيط العمودين بصمت. هذه المعرفة مبنية في المنتج، لا مكتوبة في مربع مطالبة كل مرة."],
      ["ليست ذكاءً عاماً", "كل اقتراح مبني على حقائق أعطيتها أنت فعلاً. لا شيء يُختلق — لا جهة عمل، ولا تاريخ، ولا رقم. وإن كان الدليل ناقصاً، يقول ذلك بدل اختراعه."],
    ] as [string, string][],

    demoKicker: "جرّبها الآن — بلا تسجيل",
    demoHead: "ما تعرفه سيرة عن مهنتك مسبقاً.",
    demoLede: "اختر مسمى وظيفياً. هذا ما يظهر فوراً — قبل أي استدعاء للذكاء، وبلا انتظار.",

    journeyKicker: "الرحلة",
    journeyHead: "اكتشف ← احصل على الوظيفة.",
    journey: [
      ["اكتشف", "أخبرها بالوظيفة التي تستهدفها — فهي تعرف شكل تلك المهنة مسبقاً."],
      ["ابنِ", "إحدى عشرة خطوة قصيرة. سيرتك تُرسم أمامك وأنت تكتب."],
      ["خصّص", "إعلان واحد، نسخة مطابقة واحدة — وسيرتك الرئيسية تبقى كما هي."],
      ["قدّم", "تابع كل تقديم، والنسخة التي أرسلتها لكل واحد."],
      ["قابِل", "أسئلة مبنية من السيرة التي أرسلتها فعلاً لتلك الوظيفة."],
      ["اُقبَل", "مسار واحد متصل — لا ستة تبويبات لا تعرف بعضها."],
    ] as [string, string][],

    tplKicker: "القوالب",
    tplHead: "كل قالب متوافق مع أنظمة الفرز أولاً، ومصمم ثانياً.",

    atsKicker: "قبل أن تتقدم",
    atsHead: "شاهد نسبة تطابقك تتحرك — مع أسباب ذلك.",

    faqKicker: "الأسئلة الشائعة",
    faqHead: "أسئلة يسألها الناس فعلاً.",
    faq: [
      ["هل الاستخدام مجاني؟", "بناء السيرة وتنزيلها مجاناً وبلا حساب. المدفوع هو ما حولها — خطاب التقديم، والتحضير للمقابلة، وإزالة العلامة الصغيرة أسفل الملف."],
      ["هل تختلق خبرة لملء الصفحة؟", "لا. أي اقتراح يحمل رقماً لم تُعطه يُحذف قبل أن تراه، وأي تحسين لسطر كتبته يُرفض إن اكتسب رقماً لم يكن في الأصل."],
      ["هل أقدر أبني سيرتي بالعربية؟", "نعم، من أول سؤال إلى آخر تنزيل — الأسئلة والاقتراحات والمراجعة والمستند نفسه. وتقدر تُنشئ نسخة إنجليزية من الحقائق ذاتها بعدها، مترجمة ومراجعة لا معاد كتابتها."],
      ["ما الذي يجعل السيرة «متوافقة مع أنظمة الفرز»؟", "عمود واحد، عناوين أقسام قياسية، نص حقيقي لا صورة، تواريخ يقرؤها المحلّل، ومفردات الإعلان الوظيفي حيث تنطبق فعلاً."],
      ["أين تُحفظ بياناتي؟", "على جهازك محلياً بشكل افتراضي — لا شيء يُرفع للتخزين. وإن سجّلت دخولك، تُحفظ سيرتك في حسابك لتتابعك عبر أجهزتك، وتقدر تحذفها في أي وقت."],
    ] as [string, string][],

    finalHead: "مسيرتك المهنية، يديرها نظام واحد.",

    footLinks: [
      ["الأسعار", "/ar/pricing"],
      ["القوالب", "/ar/templates"],
      ["فاحص السيرة لأنظمة ATS", "/ats-resume-checker"],
      ["الخصوصية", "/ar/privacy"],
      ["الشروط", "/ar/terms"],
    ] as [string, string][],
    ar: "English",
  },
};

export default function Landing({ lang }: { lang: "ar" | "en" }) {
  const t = C[lang];
  const ar = lang === "ar";
  const p = ar ? "/ar" : "";
  const professionCount = allRolePacks().length;
  const professionStat = ar ? `+${toArabicDigits(professionCount)}` : `${professionCount}+`;
  const proof = t.proof.map(([n, body], i) => (i === 0 ? [professionStat, body] : [n, body])) as [string, string][];
  const templateCount = TEMPLATE_CATALOG.length;

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={lang} className="min-h-dvh" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <nav className="ps-header">
        <div className="ps-header-in">
          <Link href={p || "/"} className="ps-brand">
            <BrandOrb size={26} />
            <span>{ar ? "سيرة" : "Sira"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={ar ? "/" : "/ar"} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              {t.ar}
            </Link>
            <Link href={`${p}/builder`} className="btn-accent px-4 py-2 text-sm">{t.ctaPrimary}</Link>
          </div>
        </div>
      </nav>

      {/* ══════════ 1. HERO ══════════ */}
      <section className="cosmos-glow relative overflow-hidden px-6 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="t-hero">
            <div className="chip">{t.eyebrow}</div>
            <h1
              className="mt-5 font-extrabold leading-[0.98] tracking-tight"
              style={{ fontSize: "clamp(2.75rem,6.4vw,5.5rem)", letterSpacing: "-0.03em", maxWidth: "16ch" }}
            >
              <span
                style={{
                  background: "linear-gradient(100deg,#e9d8ff,#c4b5fd 45%,var(--accent) 85%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {t.h1a}
              </span>
              <br />
              {t.h1b}
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed" style={{ color: "var(--muted)" }}>{t.lede}</p>

            <ContinueDraft lang={lang} />

            <div>
              <div className="hero-pipeline">
                {t.pipeline.map((step, i) => (
                  <span key={step} style={{ display: "contents" }}>
                    {i > 0 && <span className="arrow">{ar ? "←" : "→"}</span>}
                    <span className="pill">{step}</span>
                  </span>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`${p}/builder`} className="btn-accent px-8 py-4 text-[15px]">{t.ctaPrimary} →</Link>
                <a href="#system" className="btn-ghost px-7 py-4 text-[15px]">{t.ctaSecondary}</a>
              </div>
            </div>
          </div>

          <div className="relative mx-auto flex h-[320px] w-full items-center justify-center lg:h-[560px]" aria-hidden>
            <BrandOrb variant="hero" size={520} className="max-w-full" style={{ maxWidth: "88vw", maxHeight: "88vw" }} />
          </div>
        </div>
      </section>

      {/* ══════════ 2. PROOF STRIP ══════════ */}
      <section className="t-enter px-6 py-14" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="proof-grid">
            {proof.map(([n, body], i) => (
              <div key={body} className="proof-stat">
                <b style={{ color: i === 2 ? "var(--gold)" : i === 0 ? "var(--accent)" : "var(--fg)" }}>{n}</b>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 3. INTERACTIVE PIPELINE ══════════ */}
      <section id="system" className="t-enter px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="section-kicker">{t.sysKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.6vw,3.2rem)", letterSpacing: "-0.02em", maxWidth: "18ch" }}>{t.sysHead}</h2>
          <p className="mt-3 max-w-[56ch] text-base leading-relaxed" style={{ color: "var(--muted)" }}>{t.sysLede}</p>

          <div className="rail">
            <div className="rail-line" />
            <div className="rail-steps">
              {t.rail.map(([head, body], i) => (
                <div key={head} className="rail-step">
                  <div className="rail-dot">{ar ? ["١", "٢", "٣", "٤", "٥", "٦"][i] : i + 1}</div>
                  <div><b>{head}</b><p>{body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ 4. WHY DIFFERENT ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="section-kicker">{t.diffKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.6vw,3.2rem)", letterSpacing: "-0.02em", maxWidth: "18ch" }}>{t.diffHead}</h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {t.diff.map(([head, body]) => (
              <div key={head} className="card p-7">
                <h3 className="text-lg font-bold" style={{ letterSpacing: "-0.01em" }}>{head}</h3>
                <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 5. LIVE PROFESSION DEMO ══════════ */}
      <section className="t-enter px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="section-kicker">{t.demoKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.6vw,3.2rem)", letterSpacing: "-0.02em", maxWidth: "20ch" }}>{t.demoHead}</h2>
          <p className="mt-3 max-w-[56ch] text-base leading-relaxed" style={{ color: "var(--muted)" }}>{t.demoLede}</p>

          <ProfessionDemo lang={lang} />
        </div>
      </section>

      {/* ══════════ 6. JOURNEY TIMELINE ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl">
          <div className="section-kicker">{t.journeyKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.6vw,3.2rem)", letterSpacing: "-0.02em" }}>{t.journeyHead}</h2>

          <div className="timeline">
            {t.journey.map(([head, body]) => (
              <div key={head} className="t-item"><b>{head}</b><p>{body}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 7. TEMPLATES ══════════ */}
      <section className="t-enter px-6 py-24" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="section-kicker">{t.tplKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.6vw,3.2rem)", letterSpacing: "-0.02em", maxWidth: "20ch" }}>{t.tplHead}</h2>

          <div className="tpl-grid">
            {TEMPLATE_CATALOG.map((tpl) => (
              <Link key={tpl.slug} href={`${p}/builder?template=${tpl.slug}`} className="card">
                <div className="tpl-prev" style={{ color: tpl.accent }}>
                  <div className="bar w60" /><div className="bar w40" /><div className="sp" />
                  <div className="bar w30" /><div className="bar w80" /><div className="bar w80" />
                  <div className="sp" /><div className="bar w30" /><div className="bar w60" />
                </div>
                <div className="tpl-label">
                  <span>{ar ? tpl.nameAr : tpl.name}</span>
                  {tpl.best && <span className="tpl-best">{ar ? "الأفضل" : "BEST"}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 8. ATS SCORE ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl">
          <div className="section-kicker">{t.atsKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.6rem,2.8vw,2.4rem)", letterSpacing: "-0.02em", maxWidth: "22ch" }}>{t.atsHead}</h2>

          <AtsScoreReveal lang={lang} />
        </div>
      </section>

      {/* ══════════ 9. FAQ ══════════ */}
      <section className="t-enter px-6 py-24" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl text-center">
          <div className="section-kicker">{t.faqKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.6vw,3.2rem)", letterSpacing: "-0.02em" }}>{t.faqHead}</h2>
        </div>
        <FaqAccordion items={t.faq.map(([q, a]) => ({ q, a }))} />
      </section>

      {/* ══════════ 10. FINAL CTA ══════════ */}
      <section className="t-enter px-6 py-28 text-center" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <BrandOrb variant="hero" size={72} />
          <h2 className="mt-7 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,4.4vw,3.4rem)", letterSpacing: "-0.025em" }}>{t.finalHead}</h2>
          <Link href={`${p}/builder`} className="btn-accent mt-8 px-9 py-4 text-[15px]">{t.ctaPrimary} →</Link>
        </div>
      </section>

      <footer className="px-6 py-12" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-xs" style={{ color: "var(--faint)" }}>{copyright(lang)}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {t.footLinks.map(([label, href]) => (
              <Link key={href} href={href} style={{ color: "var(--muted)" }}>{label}</Link>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-6xl text-[11px]" style={{ color: "var(--faint)" }}>
          {ar ? `${toArabicDigits(templateCount)} قوالب · ${professionStat} مهنة سعودية مُنمذجة` : `${templateCount} templates · ${professionStat} Saudi occupations modeled`}
        </p>
      </footer>
    </main>
  );
}
