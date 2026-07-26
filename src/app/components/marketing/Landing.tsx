/**
 * The marketing page — what this product is, before anyone is asked to fill anything in.
 *
 * `/` used to be the builder itself: twelve sections in one scrolling page, the first
 * eleven of them dimmed to 38% opacity with empty bodies. As a first impression that is
 * backwards. A visitor who has not decided to spend ten minutes on a form is shown a form,
 * and a visitor who HAS decided is shown ten steps at once.
 *
 * So the two are separated. This page explains and offers three doors; `/builder` is the
 * journey. The long single-page builder that used to answer at `/build` is gone — two builders
 * reachable at once meant every fix landed twice or once, and the menu pointed at the older one.
 *
 * Deliberately a server component with no client JavaScript except the returning-visitor
 * banner. It is the product's most important page for search, every claim on it is static,
 * and the one thing that genuinely needs the browser — whether this person already has a
 * draft — is the one thing that is a client component.
 *
 * Every number comes from `lib/plans.ts` and every name from `lib/brand.ts`. The pricing
 * on this page cannot drift from the checkout because it is not written down here.
 */

import Link from "next/link";
import BrandOrb from "../BrandOrb";
import ContinueDraft from "./ContinueDraft";
import { PLANS, formatPrice } from "@/app/lib/plans";
import { copyright } from "@/app/lib/brand";
import { findRolePack } from "@/app/lib/rolePacks";

const C = {
  en: {
    eyebrow: "Free · no signup · Arabic & English",
    h1a: "You provide the facts.",
    h1b: "AI writes the professional CV.",
    lede:
      "A step-by-step CV builder for the Saudi and Gulf market. You type what is true — the jobs, the dates, the licences — and the AI turns it into the wording a recruiter and an applicant-tracking system both expect. It never invents an employer, a date, a certification or a number.",
    ctaBuild: "Build my CV, step by step",
    ctaBuildSub: "Eleven short steps. Nothing enters your CV until you approve it.",
    ctaUpload: "I already have a CV — improve it",
    ctaUploadSub: "We read your file, score it against the job, and rewrite it without inventing anything.",
    /* `ctaChat` used to be here, for a card pointing at `/journey`. The conversation was retired,
       the card was removed, and these two strings stayed behind — an invitation for someone to
       re-add a link to a 308 redirect. Replaced by the third door, which is real. */
    ctaResume: "Continue a CV I saved here",
    ctaResumeSub: "Everything is kept on this device. Pick it up where you stopped, in the same form.",

    howHead: "How it works",
    how: [
      ["Name the job you are aiming for",
       "Everything the AI suggests is based on this one answer, so it comes first. Paste the advert — or its link — and your CV gets matched against the employer's actual requirements."],
      ["Fill in the facts",
       "Employers, dates, education, licences, languages. Short fields, one section at a time, with your CV building itself beside you as you type."],
      ["The AI suggests; you approve",
       "Responsibilities and skills for your profession arrive as suggestions. Keep, edit or reject each one. A suggestion is not on your CV until you say so."],
      ["Review, design, download",
       "What is missing, what would make it stronger, then a template and a PDF or Word file."],
    ] as [string, string][],

    egHead: "What it already knows about your profession",
    egLede:
      "Type a job title and this appears immediately — no model call, no waiting. It is what the product knows about the occupation, offered so you can recognise your own work rather than describe it from a blank page.",
    egTitle: "Radiology Technologist",
    egDuties: "Typical responsibilities",
    egCreds: "Licences it will ask about",
    egNothing: "None of this is on a CV yet. Every item is a suggestion until it is tapped.",

    trustHead: "What it will not do",
    trust: [
      ["It never invents a fact",
       "No employer, date, degree, certification or number comes from the model. Those are yours alone. It drafts the WORDING of work you tell it you did."],
      ["It works with the AI switched off",
       "Every step can be completed by typing. If the model is unavailable or rate-limited, the form still finishes and still exports."],
      ["ATS-ready by construction",
       "Single column, standard headings, no tables or graphics in the parseable export — the structure applicant-tracking systems can actually read."],
      ["Your draft stays in your browser",
       "It is saved locally as you type. Text reaches our servers only when you ask for something specific: an AI suggestion, an ATS scan, or a job link to be read."],
    ] as [string, string][],

    priceHead: "What costs money, and what does not",
    priceFree: "Free, with no account:",
    priceFreeList: [
      "Building the whole CV, step by step",
      "The live preview and every template",
      "The ATS match score, the missing keywords and the review",
    ],
    pricePaid: "One payment removes the watermark and unlocks the downloads:",
    priceNoSub: "One-time payments. There is no subscription.",
    priceMore: "See what each includes →",

    footHead: "More",
    footLinks: [
      ["Pricing", "/pricing"],
      ["CV templates", "/resume-templates"],
      ["CV examples by profession", "/resume-examples"],
      ["ATS CV checker", "/ats-resume-checker"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ] as [string, string][],
    ar: "العربية",
  },

  ar: {
    eyebrow: "مجاناً · بلا تسجيل · بالعربية والإنجليزية",
    h1a: "أنت تكتب الحقائق.",
    h1b: "والذكاء يكتب السيرة المهنية.",
    lede:
      "منشئ سيرة ذاتية خطوة بخطوة للسوق السعودي والخليجي. تكتب ما هو صحيح — الوظائف والتواريخ والرخص — ويحوّله الذكاء إلى الصياغة التي يتوقعها المسؤول عن التوظيف ونظام الفرز معاً. ولا يختلق جهة عمل ولا تاريخاً ولا شهادة ولا رقماً.",
    ctaBuild: "ابنِ سيرتي خطوة بخطوة",
    ctaBuildSub: "إحدى عشرة خطوة قصيرة. لا يدخل شيء سيرتك قبل أن تعتمده.",
    ctaUpload: "لديّ سيرة — حسّنها",
    ctaUploadSub: "نقرأ ملفك، ونقيّمه مقابل الوظيفة، ونعيد صياغته دون اختلاق أي شيء.",
    ctaResume: "أكمل سيرة حفظتها هنا",
    ctaResumeSub: "كل شيء محفوظ على جهازك. واصل من حيث توقفت، في النموذج نفسه.",

    howHead: "كيف يعمل",
    how: [
      ["حدّد الوظيفة التي تستهدفها",
       "كل ما يقترحه الذكاء مبني على هذه الإجابة، فتأتي أولاً. الصق الإعلان — أو رابطه — لتُطابق سيرتك مع متطلبات صاحب العمل الفعلية."],
      ["اكتب الحقائق",
       "جهات العمل والتواريخ والتعليم والرخص واللغات. حقول قصيرة، قسم واحد كل مرة، وسيرتك تُبنى أمامك وأنت تكتب."],
      ["الذكاء يقترح، وأنت تعتمد",
       "تصل المهام والمهارات الخاصة بمهنتك كاقتراحات. أبقِ ما تريد، أو عدّله، أو ارفضه. والاقتراح ليس في سيرتك حتى تقول ذلك."],
      ["راجع، صمّم، نزّل",
       "ما ينقص، وما يجعلها أقوى، ثم قالب وملف PDF أو Word."],
    ] as [string, string][],

    egHead: "ما يعرفه عن مهنتك مسبقاً",
    egLede:
      "اكتب المسمى الوظيفي فيظهر هذا فوراً — بلا استدعاء للذكاء وبلا انتظار. هذا ما يعرفه المنتج عن المهنة، معروضاً لتتعرّف على عملك بدل وصفه من صفحة بيضاء.",
    egTitle: "أخصائي أشعة",
    egDuties: "مهام معتادة",
    egCreds: "رخص سيسألك عنها",
    egNothing: "لا شيء من هذا في سيرة بعد. كل عنصر اقتراح حتى تنقره.",

    trustHead: "ما لن يفعله",
    trust: [
      ["لا يختلق حقيقة",
       "لا جهة عمل ولا تاريخ ولا شهادة ولا مؤهل ولا رقم يأتي من الذكاء. هذه منك وحدك. وهو يصوغ عبارات عمل أخبرته أنك قمت به."],
      ["يعمل والذكاء مطفأ",
       "كل خطوة يمكن إكمالها بالكتابة. وإن تعذّر الذكاء أو تجاوزت حد الاستخدام، يكتمل النموذج ويُصدَّر كما هو."],
      ["مهيّأ لأنظمة الفرز بحكم بنيته",
       "عمود واحد، وعناوين قياسية، ولا جداول ولا رسومات في الملف القابل للقراءة — البنية التي تستطيع أنظمة التوظيف قراءتها فعلاً."],
      ["مسوّدتك تبقى في متصفحك",
       "تُحفظ محلياً وأنت تكتب. ولا يصل أي نص إلى خوادمنا إلا عندما تطلب شيئاً محدداً: اقتراحاً من الذكاء، أو فحص توافق، أو قراءة رابط وظيفة."],
    ] as [string, string][],

    priceHead: "ما يُدفع عليه وما لا يُدفع",
    priceFree: "مجاناً وبلا حساب:",
    priceFreeList: [
      "بناء السيرة كاملة خطوة بخطوة",
      "المعاينة الحيّة وكل القوالب",
      "تقييم التوافق والكلمات الناقصة والمراجعة",
    ],
    pricePaid: "دفعة واحدة تُزيل العلامة المائية وتفتح التنزيلات:",
    priceNoSub: "دفعات لمرة واحدة. لا يوجد اشتراك.",
    priceMore: "اعرف ما يتضمنه كل خيار ←",

    footHead: "المزيد",
    footLinks: [
      ["الأسعار", "/ar/pricing"],
      ["قوالب السير الذاتية", "/resume-templates"],
      ["أمثلة سير بحسب المهنة", "/ar/resume-examples"],
      ["فاحص السيرة لأنظمة ATS", "/ats-resume-checker"],
      ["الخصوصية", "/privacy"],
      ["الشروط", "/terms"],
    ] as [string, string][],
    ar: "English",
  },
};

export default function Landing({ lang }: { lang: "ar" | "en" }) {
  const t = C[lang];
  const ar = lang === "ar";
  const p = ar ? "/ar" : "";

  /*
   * The example is read from the same cached pack the builder seeds from, not retyped.
   * A landing page that advertises chips the product does not actually offer is a
   * promise broken thirty seconds later — and this way, editing the pack edits the ad.
   */
  const pack = findRolePack(t.egTitle);

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={lang} className="min-h-dvh" style={{ background: "var(--bg)", color: "var(--fg)" }}>

      <nav className="ps-header">
        <div className="ps-header-in">
          <Link href={p || "/"} className="flex items-center gap-2.5">
            <BrandOrb size={26} />
            <span className="text-[15px] font-bold tracking-tight">{ar ? "سيرة" : "Sira"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={ar ? "/" : "/ar"} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              {t.ar}
            </Link>
            <Link href={`${p}/builder`} className="btn-accent px-4 py-2 text-sm">{t.ctaBuild}</Link>
          </div>
        </div>
      </nav>

      {/*
        ── hero ──

        `t-hero` staggers these five children — eyebrow, headline, description, the returning-visitor
        banner, the three doors — 60ms apart. It moves them WITHOUT fading them, and that is not a
        stylistic choice: this `<h1>` is the page's Largest Contentful Paint element, and LCP does not
        count an element painted at zero opacity. A fade here would add its delay and duration to the
        one number that decides where the page ranks. See `t-hero` in transitions.css.
      */}
      <section className="t-hero mx-auto max-w-3xl px-6 pb-4 pt-10">
        <div className="chip mb-5">{t.eyebrow}</div>
        <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl">
          {t.h1a}<br />
          <span style={{ color: "var(--accent)" }}>{t.h1b}</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--muted)" }}>{t.lede}</p>

        {/* Only shown to someone who already has work in progress. */}
        <ContinueDraft lang={lang} />

        <div className="mt-8 grid gap-3">
          <Link href={`${p}/builder`} className="card card-hover p-5" style={{ borderColor: "rgba(139,92,246,0.45)", background: "rgba(139,92,246,0.06)" }}>
            <div className="text-base font-bold">{t.ctaBuild} →</div>
            <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{t.ctaBuildSub}</div>
          </Link>
          {/*
            Into the BUILDER, with the importer open — not to `/optimize`.
            
            `/optimize` is a good tool and keeps its own address and its own search traffic, but it
            is a different engine: its own state, its own preview, its own export. Sending the file
            there meant the visitor who pressed this card could not then carry on building in the
            form; they had a score and a rewrite and no way back into the product. All three doors —
            new, upload, continue a saved CV — now land in one data model, one preview, one save and
            one download.
          */}
          <Link href={`${p}/builder?entry=upload`} className="card card-hover p-5">
            <div className="text-base font-bold">{t.ctaUpload} →</div>
            <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{t.ctaUploadSub}</div>
          </Link>
          {/* And the third door: a CV already saved on this device. It was reachable only from
              inside the builder, so a returning visitor's first screen did not mention it. */}
          <Link href={`${p}/builder`} className="card card-hover p-5">
            <div className="text-base font-bold">{t.ctaResume} →</div>
            <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{t.ctaResumeSub}</div>
          </Link>
        </div>
      </section>

      {/* ── the flow ── */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight">{t.howHead}</h2>
        <ol className="mt-6 grid gap-4">
          {t.how.map(([head, body], i) => (
            <li key={head} className="flex gap-4">
              <span
                className="grid h-7 w-7 flex-none place-items-center rounded-full font-mono text-xs font-bold"
                style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.35)", color: "#c4b5fd" }}
              >
                {ar ? ["١", "٢", "٣", "٤"][i] : i + 1}
              </span>
              <div>
                <div className="font-bold">{head}</div>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── the worked example ── */}
      {pack && (
        <section className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-2xl font-bold tracking-tight">{t.egHead}</h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{t.egLede}</p>

          <div className="card mt-6 p-5">
            <div className="font-mono text-xs" style={{ color: "var(--faint)" }}>
              {ar ? "المسمى الوظيفي" : "Job title"}
            </div>
            <div className="mt-1 text-lg font-bold">{pack.title[lang]}</div>

            {pack.groups.map((g) => (
              <div key={g.label.en} className="mt-4">
                <div className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>{g.label[lang]}</div>
                <div className="flex flex-wrap gap-2">
                  {g.items.slice(0, 6).map((it) => (
                    <span
                      key={it.en}
                      className="rounded-full px-3 py-1 text-xs font-medium"
                      style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}
                    >
                      + {it[lang]}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>{t.egDuties}</div>
              <ul className="space-y-1.5 text-sm leading-relaxed" style={{ color: "rgba(244,245,243,0.85)" }}>
                {pack.duties.slice(0, 4).map((d) => <li key={d.en}>• {d[lang]}</li>)}
              </ul>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>{t.egCreds}</div>
              <div className="flex flex-wrap gap-2">
                {pack.credentials.slice(0, 4).map((c) => (
                  <span
                    key={c.title.en}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}
                  >
                    {c.title[lang]}
                  </span>
                ))}
              </div>
            </div>

            <p className="mt-5 text-xs" style={{ color: "var(--faint)" }}>{t.egNothing}</p>
          </div>
        </section>
      )}

      {/* ── the promises, stated as limits ── */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight">{t.trustHead}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {t.trust.map(([head, body]) => (
            <div key={head} className="card p-5">
              <div className="text-sm font-bold">{head}</div>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── pricing, read from lib/plans.ts ── */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight">{t.priceHead}</h2>

        <div className="card mt-6 p-5">
          <div className="text-sm font-bold">{t.priceFree}</div>
          <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--muted)" }}>
            {t.priceFreeList.map((x) => <li key={x}>✓ {x}</li>)}
          </ul>
        </div>

        <div className="mt-4 text-sm font-bold">{t.pricePaid}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["single", "complete"] as const).map((id) => (
            <div key={id} className="card p-5">
              <div className="text-lg font-extrabold">{formatPrice(id, lang)}</div>
              <div className="mt-1 text-sm font-semibold">{ar ? PLANS[id].nameAr : PLANS[id].name}</div>
              <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {ar ? PLANS[id].accessLabelAr : PLANS[id].accessLabel}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>{t.priceNoSub}</p>
        <Link href={`${p}/pricing`} className="mt-3 inline-block text-sm font-semibold text-accent">
          {t.priceMore}
        </Link>
      </section>

      {/* ── footer ── */}
      <footer className="px-6 py-12" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 text-xs font-semibold" style={{ color: "var(--muted)" }}>{t.footHead}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {t.footLinks.map(([label, href]) => (
              <Link key={href} href={href} style={{ color: "var(--muted)" }}>{label}</Link>
            ))}
          </div>
          <p className="mt-8 font-mono text-xs" style={{ color: "var(--faint)" }}>{copyright(lang)}</p>
        </div>
      </footer>
    </main>
  );
}
