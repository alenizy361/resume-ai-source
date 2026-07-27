/**
 * The marketing page — a career operating system that DEMONSTRATES instead of explaining.
 *
 * Third pass, from a section-by-section audit against the user's conversion brief (the audit and
 * its verdicts are in the conversation and in F-40; the updated wireframe was published and
 * approved before this file changed). What moved and why, in one line each:
 *
 *   · Hero — kept; the static pipeline chips became a small live mockup card, because a claim
 *     ("tailored, scored") shown as UI needs no paragraph.
 *   · Proof strip — dissolved; three of its numbers now sit UNDER the hero CTAs (trust at the
 *     moment of decision), the rest moved to the dedicated trust section before the final CTA.
 *   · Six-label rail — replaced by `DemoWalkthrough`: eight auto-advancing beats that show a real
 *     application moving profile → tailor → score → export → track → interview. This was the
 *     "still feels like a CV builder" root cause: the page NAMED the journey without showing it.
 *   · Three "not X" cards — replaced by a Traditional-vs-Sira comparison table; same argument,
 *     scannable in five seconds instead of three paragraphs.
 *   · How-it-works — three icon cards, one line each. The old version's paragraphs are gone.
 *   · Profession demo — kept (already interactive, already real data); Teacher replaced Sales
 *     Manager per the brief's own list, and arrivals now use the same `t-materialize` animation
 *     the real builder plays when AI suggestions land.
 *   · Journey timeline — kept as-is; it already matched the brief exactly.
 *   · Templates grid — removed as a section. A template wall is the single most "resume builder"
 *     visual a page can carry; export is now one beat in the walkthrough. `/templates` itself is
 *     untouched and stays in the footer.
 *   · Dashboard preview — new: Resume score, ATS match, applications, interviews, next recommended
 *     action — labeled an illustrative example, because it is one.
 *   · ATS reveal — kept.
 *   · Trust — honest numbers plus the no-fabrication pledge. Deliberately NOT testimonials: this
 *     product has no real user quotes to publish, and inventing them two sections below "0 facts
 *     invented" would be self-refuting.
 *   · Final CTA — reframed on the outcome ("your next job"), not the artifact ("one system").
 *
 * Still a server component with small client islands (`DemoWalkthrough`, `ProfessionDemo`,
 * `AtsScoreReveal`, `FaqAccordion`, `ContinueDraft`); `<h1>` is still the LCP element and still
 * never fades. All reveals remain the one-time mount animations from `transitions.css` — nothing
 * scroll-linked (§9 documents the crashes), and the walkthrough's auto-advance is a plain interval
 * that reduced-motion turns off.
 */

import Link from "next/link";
import BrandOrb from "../BrandOrb";
import ContinueDraft from "./ContinueDraft";
import DemoWalkthrough from "./DemoWalkthrough";
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
    h1a: "Stop building CVs.",
    h1b: "Start getting hired.",
    lede: "Sira builds one honest career profile, then tailors, scores, tracks and preps every application from it — so your time goes to interviews, not formatting.",
    ctaPrimary: "Start my Career Profile",
    ctaSecondary: "Watch it work",
    trustlite: (packs: string) => [
      [packs, "professions modeled"],
      ["0", "facts invented"],
      ["2", "languages, one engine"],
    ] as [string, string][],

    walkKicker: "See it work",
    walkHead: "One walkthrough. The whole product.",
    walkLede: "Eight moments, no paragraphs — a real application moving from profile to interview.",

    cmpKicker: "Why Sira",
    cmpHead: "A career operating system, not a form.",
    cmpFeature: "What you get",
    cmpOld: "Traditional builder",
    cmpSira: "Sira",
    cmpRows: [
      ["Career Profile", "no", "yes"],
      ["AI tailoring per job", "no", "yes"],
      ["ATS optimization", "basic", "scored"],
      ["Application tracking", "no", "yes"],
      ["Interview preparation", "no", "yes"],
      ["LinkedIn optimization", "no", "yes"],
    ] as [string, string, string][],
    cmpBasic: "Basic",
    cmpScored: "✓ Scored",

    howKicker: "How it works",
    howHead: "Three moves, not a manual.",
    how: [
      ["🎯", "Name the job", "Title, level, and the posting itself."],
      ["✍️", "Confirm the facts", "AI suggests; you approve every line."],
      ["📊", "Review and send", "ATS score, gaps — then export and track."],
    ] as [string, string, string][],

    demoKicker: "Try it — no signup",
    demoHead: "What Sira already knows about your profession.",
    demoLede: "Pick a job title. This appears instantly — before any AI call, before any waiting.",

    journeyKicker: "The journey",
    journeyHead: "Discover → Get hired.",
    journey: [
      ["Discover", "Tell it the job you're aiming for — it already knows the shape of that profession."],
      ["Build", "Your master resume, confirmed fact by fact, rendering beside you."],
      ["Tailor", "One posting, one matched version — the master stays untouched."],
      ["Apply", "Tracked, with the exact resume version you sent."],
      ["Interview", "Prepped from that resume, not a generic question bank."],
      ["Get hired", "One connected path — not six tabs that don't know each other."],
    ] as [string, string][],

    dashKicker: "Your career dashboard",
    dashHead: "Your whole search, one screen.",
    dashRings: [
      ["Resume score", 87],
      ["ATS match", 91],
    ] as [string, number][],
    dashCards: [
      ["Applications", "12"],
      ["Interviews", "3"],
      ["Tailored versions", "4"],
    ] as [string, string][],
    dashNextLabel: "Next recommended action",
    dashNext: "Prepare for your ABC Trading interview — 6 questions ready.",
    dashNote: "Illustrative example — not live account data",
    dashCta: "Open your dashboard →",

    atsKicker: "Before you apply",
    atsHead: "Watch your match score move — with the reasons why.",

    trustKicker: "Before you start",
    trustHead: "Trust, stated plainly — not borrowed.",
    trust: (packs: string, tpls: string) => [
      [packs, "Saudi occupations modeled — real duties, real licenses"],
      ["2", "Languages, one engine — Arabic and English"],
      ["0", "Facts invented — enforced in the data model"],
      [tpls, "ATS-safe templates, single-column by construction"],
    ] as [string, string][],
    pledge: "No invented testimonials here: this product doesn't publish quotes it can't stand behind. Everything above is measurable — and the same no-fabrication rule guards every line of your CV.",

    faqKicker: "FAQ",
    faqHead: "Quick answers.",
    faq: [
      ["Is it free?", "Building and downloading a CV is free and needs no account. Paid features are the extras around it — cover letters, interview prep, removing the small footer mark."],
      ["Will it invent experience to fill the page?", "No. A suggestion carrying a figure you didn't provide is dropped before you see it, and an improvement to a line you wrote is rejected if it gains a number the original didn't have."],
      ["Can I build my CV in Arabic?", "Yes, start to finish — the questions, the suggestions, the review and the document itself. An English version of the same facts can be produced afterward, translated and checked, not re-typed."],
      ["What makes a CV “ATS-ready”?", "One column, standard section headings, real text rather than an image, dates a parser can read, and the employer's own vocabulary where it honestly applies."],
      ["Where is my data stored?", "Locally on your device by default — nothing is uploaded for storage. If you sign in, your resume document is saved to your account so it follows you across devices, and you can delete it any time."],
    ] as [string, string][],

    finalHead: "Your next job is one profile away.",
    finalSub: "Not a resume. A system that keeps working after you hit export.",

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
    h1a: "لا تكتفِ ببناء سيرة.",
    h1b: "احصل على الوظيفة.",
    lede: "سيرة تبني ملفاً مهنياً صادقاً واحداً، ثم تخصص وتقيّم وتتتبع وتجهّز كل طلب توظيف منه — ليذهب وقتك إلى المقابلات لا إلى التنسيق.",
    ctaPrimary: "ابدأ ملفي المهني",
    ctaSecondary: "شاهدها تعمل",
    trustlite: (packs: string) => [
      [packs, "مهنة مُنمذجة"],
      ["٠", "حقائق مختلقة"],
      ["٢", "لغتان بمحرك واحد"],
    ] as [string, string][],

    walkKicker: "شاهدها تعمل",
    walkHead: "جولة واحدة. المنتج كله.",
    walkLede: "ثماني لحظات بلا فقرات — طلب توظيف حقيقي ينتقل من الملف إلى المقابلة.",

    cmpKicker: "لماذا سيرة",
    cmpHead: "نظام تشغيل مهني، لا مجرد نموذج.",
    cmpFeature: "ما الذي تحصل عليه",
    cmpOld: "منشئ السير التقليدي",
    cmpSira: "سيرة",
    cmpRows: [
      ["الملف المهني", "no", "yes"],
      ["تخصيص بالذكاء لكل وظيفة", "no", "yes"],
      ["التحسين لأنظمة الفرز", "basic", "scored"],
      ["تتبع الطلبات", "no", "yes"],
      ["التحضير للمقابلة", "no", "yes"],
      ["تحسين لينكدإن", "no", "yes"],
    ] as [string, string, string][],
    cmpBasic: "أساسي",
    cmpScored: "✓ مُقيَّم",

    howKicker: "كيف يعمل",
    howHead: "ثلاث خطوات، لا دليل استخدام.",
    how: [
      ["🎯", "حدد الوظيفة", "المسمى والمستوى والإعلان نفسه."],
      ["✍️", "أكّد الحقائق", "الذكاء يقترح، وأنت تعتمد كل سطر."],
      ["📊", "راجع وأرسل", "نتيجة الفرز والفجوات — ثم صدّر وتتبّع."],
    ] as [string, string, string][],

    demoKicker: "جرّبها الآن — بلا تسجيل",
    demoHead: "ما تعرفه سيرة عن مهنتك مسبقاً.",
    demoLede: "اختر مسمى وظيفياً. هذا يظهر فوراً — قبل أي استدعاء للذكاء، وبلا انتظار.",

    journeyKicker: "الرحلة",
    journeyHead: "اكتشف ← احصل على الوظيفة.",
    journey: [
      ["اكتشف", "أخبرها بالوظيفة التي تستهدفها — فهي تعرف شكل تلك المهنة مسبقاً."],
      ["ابنِ", "سيرتك الرئيسية، مؤكدة حقيقةً حقيقة، تُرسم أمامك."],
      ["خصّص", "إعلان واحد، نسخة مطابقة واحدة — والرئيسية تبقى كما هي."],
      ["قدّم", "متتبَّع، مع نسخة السيرة التي أرسلتها بالضبط."],
      ["قابِل", "تحضير مبني من تلك السيرة، لا من بنك أسئلة عام."],
      ["اُقبَل", "مسار واحد متصل — لا ستة تبويبات لا تعرف بعضها."],
    ] as [string, string][],

    dashKicker: "لوحتك المهنية",
    dashHead: "بحثك كله في شاشة واحدة.",
    dashRings: [
      ["تقييم السيرة", 87],
      ["تطابق ATS", 91],
    ] as [string, number][],
    dashCards: [
      ["الطلبات", "١٢"],
      ["المقابلات", "٣"],
      ["نسخ مخصصة", "٤"],
    ] as [string, string][],
    dashNextLabel: "الخطوة الموصى بها الآن",
    dashNext: "استعد لمقابلة شركة ABC — ٦ أسئلة جاهزة.",
    dashNote: "مثال توضيحي — ليست بيانات حساب حقيقية",
    dashCta: "افتح لوحتك ←",

    atsKicker: "قبل أن تتقدم",
    atsHead: "شاهد نسبة تطابقك تتحرك — مع أسباب ذلك.",

    trustKicker: "قبل أن تبدأ",
    trustHead: "ثقة تُقال بوضوح — لا تُستعار.",
    trust: (packs: string, tpls: string) => [
      [packs, "مهنة سعودية مُنمذجة — بمهام وتراخيص حقيقية"],
      ["٢", "لغتان بمحرك واحد — عربي وإنجليزي"],
      ["٠", "حقائق مختلقة — مفروض في بنية البيانات"],
      [tpls, "قوالب متوافقة مع أنظمة الفرز، بعمود واحد ببنيتها"],
    ] as [string, string][],
    pledge: "لا شهادات مختلقة هنا: هذا المنتج لا ينشر اقتباسات لا يستطيع الوقوف خلفها. كل ما فوق قابل للقياس — ونفس قاعدة عدم الاختلاق تحرس كل سطر في سيرتك.",

    faqKicker: "الأسئلة الشائعة",
    faqHead: "إجابات سريعة.",
    faq: [
      ["هل الاستخدام مجاني؟", "بناء السيرة وتنزيلها مجاناً وبلا حساب. المدفوع هو ما حولها — خطاب التقديم، والتحضير للمقابلة، وإزالة العلامة الصغيرة أسفل الملف."],
      ["هل تختلق خبرة لملء الصفحة؟", "لا. أي اقتراح يحمل رقماً لم تُعطه يُحذف قبل أن تراه، وأي تحسين لسطر كتبته يُرفض إن اكتسب رقماً لم يكن في الأصل."],
      ["هل أقدر أبني سيرتي بالعربية؟", "نعم، من أول سؤال إلى آخر تنزيل — الأسئلة والاقتراحات والمراجعة والمستند نفسه. وتقدر تُنشئ نسخة إنجليزية من الحقائق ذاتها بعدها، مترجمة ومراجعة لا معاد كتابتها."],
      ["ما الذي يجعل السيرة «متوافقة مع أنظمة الفرز»؟", "عمود واحد، عناوين أقسام قياسية، نص حقيقي لا صورة، تواريخ يقرؤها المحلّل، ومفردات الإعلان الوظيفي حيث تنطبق فعلاً."],
      ["أين تُحفظ بياناتي؟", "على جهازك محلياً بشكل افتراضي — لا شيء يُرفع للتخزين. وإن سجّلت دخولك، تُحفظ سيرتك في حسابك لتتابعك عبر أجهزتك، وتقدر تحذفها في أي وقت."],
    ] as [string, string][],

    finalHead: "وظيفتك القادمة على بُعد ملف واحد.",
    finalSub: "ليست مجرد سيرة — نظام يواصل العمل بعد التصدير.",

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
  const packsStat = ar ? `+${toArabicDigits(professionCount)}` : `${professionCount}+`;
  const tplsStat = ar ? toArabicDigits(TEMPLATE_CATALOG.length) : String(TEMPLATE_CATALOG.length);

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={lang} className="landing-root min-h-dvh" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <nav className="ps-header">
        <div className="ps-header-in">
          <Link href={p || "/"} className="ps-brand">
            <BrandOrb size={26} />
            <span>{ar ? "سيرة" : "Sira"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={ar ? "/" : "/ar"} className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
              {t.ar}
            </Link>
            <Link href={`${p}/builder`} className="btn-accent px-4 py-2.5 text-[16px]">{t.ctaPrimary}</Link>
          </div>
        </div>
      </nav>

      {/* ══════════ 1. HERO — the promise, the orb, and a live mockup instead of static text ══════════ */}
      <section className="cosmos-glow relative overflow-hidden px-6 pb-16 pt-12 sm:pt-20">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="t-hero">
            <div className="chip">{t.eyebrow}</div>
            <h1
              className="mt-5 font-extrabold tracking-tight"
              style={{ fontSize: "clamp(2.75rem,6vw,4.75rem)", lineHeight: 1.04, letterSpacing: "-0.04em", maxWidth: "16ch" }}
            >
              {t.h1a}
              <br />
              <span
                style={{
                  background: "linear-gradient(100deg,#e9d8ff,#c4b5fd 45%,var(--accent-bright,var(--accent)) 85%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {t.h1b}
              </span>
            </h1>
            <p className="mt-6 max-w-[64ch] leading-relaxed" style={{ color: "var(--body, var(--muted))", fontSize: 18 }}>{t.lede}</p>

            <ContinueDraft lang={lang} />

            <div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`${p}/builder`} className="btn-accent magnetic px-8 py-4 text-[16px]">{t.ctaPrimary} →</Link>
                <a href="#demo" className="btn-ghost magnetic px-7 py-4 text-[16px]">{t.ctaSecondary}</a>
              </div>
              <div className="trustlite">
                {t.trustlite(packsStat).map(([n, label]) => (
                  <span key={label}><b>{n}</b> {label}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="hero-orb-col order-first mx-auto w-full lg:order-last">
            <div className="relative flex items-center justify-center h-[190px] sm:h-[240px] lg:h-[400px]" aria-hidden>
              <div className="hero-particles"><i /><i /><i /></div>
              <BrandOrb variant="hero" size={440} style={{ maxWidth: "clamp(140px,40vw,440px)", maxHeight: "clamp(140px,40vw,440px)" }} />
            </div>
            {/* The hero-side preview — the same eight-beat DemoWalkthrough data, compact and
                auto-cycling on its own faster tempo, so "a live animated product preview" is
                true beside the headline rather than a single static card. */}
            <DemoWalkthrough lang={lang} compact />
          </div>
        </div>
      </section>

      {/* ══════════ 2. LIVE PRODUCT DEMO ══════════ */}
      <section id="demo" className="t-enter px-6 py-24" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-[1200px]">
          <div className="section-kicker">{t.walkKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em", maxWidth: "18ch" }}>{t.walkHead}</h2>
          <p className="mt-3 max-w-[56ch] text-lg leading-relaxed" style={{ color: "var(--body, var(--muted))" }}>{t.walkLede}</p>

          <DemoWalkthrough lang={lang} />
        </div>
      </section>

      {/* ══════════ 3. WHY SIRA — comparison, not concepts ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-4xl">
          <div className="section-kicker">{t.cmpKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em", maxWidth: "18ch" }}>{t.cmpHead}</h2>

          <div className="compare">
            <div className="compare-row head">
              <div>{t.cmpFeature}</div>
              <div>{t.cmpOld}</div>
              <div style={{ color: "var(--accent-bright, var(--accent))" }}>{t.cmpSira}</div>
            </div>
            {t.cmpRows.map(([feat, old, sira]) => (
              <div key={feat} className="compare-row">
                <div className="feat">{feat}</div>
                <div className="no">{old === "basic" ? t.cmpBasic : "✕"}</div>
                <div className="yes">{sira === "scored" ? t.cmpScored : "✓"}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 4. HOW IT WORKS — three cards, one line each ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-[1200px]">
          <div className="section-kicker">{t.howKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em" }}>{t.howHead}</h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {t.how.map(([icon, head, body], i) => (
              <div key={head} className="card p-8">
                <div className="flex items-center justify-between">
                  <span className="how-step-num" aria-hidden>{ar ? toArabicDigits(i + 1) : String(i + 1).padStart(2, "0")}</span>
                  <span style={{ fontSize: 22 }} aria-hidden>{icon}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold" style={{ letterSpacing: "-0.01em" }}>{head}</h3>
                <p className="mt-2 text-base leading-relaxed" style={{ color: "var(--body, var(--muted))" }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 5. INTERACTIVE PROFESSION EXAMPLE ══════════ */}
      <section className="t-enter px-6 py-24" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-[1200px]">
          <div className="section-kicker">{t.demoKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em", maxWidth: "20ch" }}>{t.demoHead}</h2>
          <p className="mt-3 max-w-[56ch] text-lg leading-relaxed" style={{ color: "var(--body, var(--muted))" }}>{t.demoLede}</p>

          <ProfessionDemo lang={lang} />
        </div>
      </section>

      {/* ══════════ 6. CAREER JOURNEY ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl">
          <div className="section-kicker">{t.journeyKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em" }}>{t.journeyHead}</h2>

          <div className="timeline">
            {t.journey.map(([head, body]) => (
              <div key={head} className="t-item"><b>{head}</b><p>{body}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 7. DASHBOARD PREVIEW ══════════ */}
      <section className="t-enter px-6 py-24" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl">
          <div className="section-kicker">{t.dashKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em", maxWidth: "18ch" }}>{t.dashHead}</h2>

          <div className="dash">
            <div className="dash-grid">
              {t.dashRings.map(([label, pct]) => (
                <div key={label} className="dash-card dash-card-ring">
                  <div className="ring" style={{ ["--pct" as string]: pct }}>
                    <span>{pct}</span>
                  </div>
                  <div className="lbl">{label}</div>
                </div>
              ))}
              {t.dashCards.map(([label, value]) => (
                <div key={label} className="dash-card">
                  <div className="lbl">{label}</div>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <div className="dash-next">
              <div className="ic" aria-hidden>→</div>
              <div>
                <b style={{ fontSize: 16 }}>{t.dashNextLabel}</b>
                <div style={{ fontSize: 14.5, color: "var(--muted)", marginTop: 3 }}>{t.dashNext}</div>
              </div>
            </div>
            <div className="dash-foot">
              <span className="dash-note">{t.dashNote}</span>
              <Link href={`${p}/account`} className="text-sm font-semibold" style={{ color: "var(--accent-bright, var(--accent))" }}>{t.dashCta}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ 8. ATS PREVIEW ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl">
          <div className="section-kicker">{t.atsKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.6rem,2.8vw,2.4rem)", letterSpacing: "-0.02em", maxWidth: "22ch" }}>{t.atsHead}</h2>

          <AtsScoreReveal lang={lang} />
        </div>
      </section>

      {/* ══════════ 9. TRUST — honest numbers, no borrowed quotes ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-[1200px]">
          <div className="section-kicker">{t.trustKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em", maxWidth: "20ch" }}>{t.trustHead}</h2>

          <div className="trust-grid">
            {t.trust(packsStat, tplsStat).map(([n, body], i) => (
              <div key={body} className="trust-stat">
                <b style={{ color: i === 2 ? "var(--gold)" : i === 0 ? "var(--accent)" : "var(--fg)" }}>{n}</b>
                <span>{body}</span>
              </div>
            ))}
          </div>
          <div className="trust-pledge">
            <span aria-hidden>🔒</span>
            <div>{t.pledge}</div>
          </div>
        </div>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section className="t-enter px-6 py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl text-center">
          <div className="section-kicker">{t.faqKicker}</div>
          <h2 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,3.8vw,3rem)", letterSpacing: "-0.02em" }}>{t.faqHead}</h2>
        </div>
        <FaqAccordion items={t.faq.map(([q, a]) => ({ q, a }))} />
      </section>

      {/* ══════════ 10. FINAL CTA — the outcome, not the artifact ══════════ */}
      <section className="t-enter px-6 py-28 text-center" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <BrandOrb variant="hero" size={72} />
          <h2 className="mt-7 font-extrabold tracking-tight" style={{ fontSize: "clamp(1.9rem,4.4vw,3.4rem)", letterSpacing: "-0.025em" }}>{t.finalHead}</h2>
          <p className="mt-3 text-lg" style={{ color: "var(--body, var(--muted))" }}>{t.finalSub}</p>
          <Link href={`${p}/builder`} className="btn-accent magnetic mt-8 px-9 py-4 text-[16px]">{t.ctaPrimary} →</Link>
        </div>
      </section>

      <footer className="px-6 py-12" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-xs" style={{ color: "var(--faint)" }}>{copyright(lang)}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {t.footLinks.map(([label, href]) => (
              <Link key={href} href={href} style={{ color: "var(--muted)" }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
