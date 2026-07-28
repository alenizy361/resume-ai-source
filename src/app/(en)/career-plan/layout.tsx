import type { Metadata } from "next";
import PageBody from "@/app/components/seo/PageBody";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/*
 * This page had NO metadata export at all — confirmed live: it served whatever generic default the
 * root layout falls back to, on a route that IS in `sitemap.ts`. The title/description below are
 * the page's own real H1 and lede, not invented copy.
 *
 * No `ar` alternate, matching `interview-live/layout.tsx`'s own documented reasoning: this is one
 * bilingual client component behind one URL, switching language via `?lang=ar` on the browser side.
 * The canonical strips that query, so declaring it as a separate language edition would point an
 * hreflang pair at the same page — a contradiction, not a language signal.
 */
export const metadata: Metadata = {
  title: "Career Transition Plan — Current Role to Target Role | Sira",
  description: "Compare your current role to where you want to go and get a realistic plan: transferable skills, real gaps, and concrete next steps.",
  alternates: {
    canonical: `${BASE}/career-plan`,
    languages: { "x-default": `${BASE}/career-plan` },
  },
};

/**
 * The tool is a client component behind a form, so a crawler — and a visitor who has not typed
 * anything yet — saw a heading, a lede and four empty fields. `/interview` and `/linkedin` both got
 * a server-rendered body for exactly this reason; this route is in `sitemap.ts` and did not.
 *
 * Both languages render and CSS hides the one that does not match `html[lang]`, the same
 * single-URL pattern those two pages use: a server component cannot know a choice the client makes
 * with `?lang=ar`, so it ships both rather than guessing.
 */
export default function CareerPlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageBody
        heading="Why most career changes stall"
        intro={[
          "The gap between the job you have and the job you want is rarely the one people assume. It is usually not a qualification — it is that nothing on the current CV is written in the vocabulary of the target role, so a recruiter reading it cannot see the connection even when the experience genuinely supports it.",
          "This page compares the two roles and separates three things that get muddled together: what already transfers and only needs rewording, what is a real gap you will have to close, and what is a gap you can start closing this month. It works from the CV you already have, and it does not invent experience you have not had.",
        ]}
        stepsHeading="How to use it"
        steps={[
          { title: "Name both roles plainly", body: "The title you hold and the title you are aiming at, as an employer would write them in an advert — not an aspirational version of either." },
          { title: "Add the country", body: "A move that needs a licence in Saudi Arabia may need none elsewhere, and the plan is wrong if it does not know where you are applying." },
          { title: "Be honest about the timeline", body: "Three months and two years produce genuinely different plans. A plan built for a timeline you do not have is worse than no plan." },
          { title: "Start with the rewording, not the courses", body: "The transferable half costs nothing and lands first. A certificate takes months and is often not what was stopping you." },
        ]}
        faqHeading="Questions people ask"
        faq={[
          {
            q: "Do I need a new qualification to change roles?",
            a: "Usually less often than people expect. Where a role is licensed — healthcare, engineering, teaching, accounting in some jurisdictions — the licence is not optional and the plan will say so. Everywhere else, the first thing to fix is how the experience you already have is described.",
          },
          {
            q: "Is a sideways move a step backwards?",
            a: "Not if it buys the experience the target role screens for. A year in an adjacent function often opens more doors than a year of waiting for a promotion that has no path attached to it.",
          },
          {
            q: "Should I say I am changing careers on my CV?",
            a: "Say it in the summary, briefly, and then spend the rest of the CV proving the overlap. A career change that is explained once and then demonstrated reads as deliberate; one that is never mentioned reads as an unexplained gap.",
          },
        ]}
        relatedHeading="Related"
        related={[
          { href: "/optimize", label: "Check my resume" },
          { href: "/builder", label: "Build my resume" },
          { href: "/interview", label: "Prepare for the interview" },
          { href: "/resume-examples", label: "Resume examples by job" },
        ]}
        ar={{
          heading: "لماذا تتعطّل معظم التحوّلات المهنية",
          intro: [
            "الفجوة بين وظيفتك الحالية والوظيفة التي تريدها ليست غالباً ما يفترضه الناس. هي في الأغلب ليست شهادة ناقصة — بل أن لا شيء في السيرة الحالية مكتوب بمفردات الدور المستهدف، فلا يرى الموظِّف الصلة أصلاً حتى لو كانت الخبرة تدعمها فعلاً.",
            "هذه الصفحة تقارن الدورين وتفصل ثلاثة أمور يخلط بينها الجميع: ما ينتقل معك ويحتاج إعادة صياغة فقط، وما هو فجوة حقيقية عليك إغلاقها، وما يمكنك البدء بإغلاقه هذا الشهر. تعمل من سيرتك الحالية، ولا تخترع خبرة لم تعشها.",
          ],
          stepsHeading: "كيف تستخدمها",
          steps: [
            { title: "سمِّ الدورين بوضوح", body: "المسمّى الذي تشغله والمسمّى الذي تستهدفه، كما يكتبهما صاحب العمل في إعلان — لا نسخة مثالية من أيٍّ منهما." },
            { title: "أضف الدولة", body: "انتقال يتطلّب رخصة في السعودية قد لا يتطلّبها في غيرها، والخطة تكون خاطئة إن لم تعرف أين تتقدّم." },
            { title: "كن صادقاً في المدة", body: "ثلاثة أشهر وسنتان يُنتجان خطتين مختلفتين فعلاً. خطة مبنية على مدة لا تملكها أسوأ من لا خطة." },
            { title: "ابدأ بإعادة الصياغة، لا بالدورات", body: "الجزء القابل للنقل لا يكلّف شيئاً ويظهر أثره أولاً. الشهادة تأخذ أشهراً وغالباً لم تكن هي ما يعيقك." },
          ],
          faqHeading: "أسئلة يسألها الناس فعلاً",
          faq: [
            {
              q: "هل أحتاج مؤهلاً جديداً لتغيير مساري؟",
              a: "أقل مما يتوقّع الناس عادةً. في المهن المرخّصة — الصحة والهندسة والتعليم والمحاسبة في بعض الدول — الرخصة ليست اختيارية وستقولها الخطة صريحةً. وفيما عدا ذلك، أول ما يجب إصلاحه هو كيف تُوصَف خبرتك الحالية.",
            },
            {
              q: "هل الانتقال الأفقي خطوة للخلف؟",
              a: "ليس إن كان يشتري لك الخبرة التي يفحصها الدور المستهدف. سنة في وظيفة مجاورة تفتح أبواباً أكثر من سنة انتظار ترقية لا مسار لها.",
            },
            {
              q: "هل أذكر في سيرتي أنني أغيّر مساري؟",
              a: "اذكره في الملخّص باختصار، ثم اصرف بقية السيرة في إثبات التقاطع. تحوّلٌ يُشرح مرة ثم يُبرهن يقرأ كقرار مدروس، وتحوّلٌ لا يُذكر أبداً يقرأ كفراغ غير مفسَّر.",
            },
          ],
          relatedHeading: "صفحات ذات صلة",
          related: [
            { href: "/ar/optimize", label: "افحص سيرتي" },
            { href: "/ar/builder", label: "ابنِ سيرتك" },
            { href: "/interview?lang=ar", label: "استعد للمقابلة" },
            { href: "/ar/pricing", label: "الأسعار" },
          ],
        }}
      />
    </>
  );
}
