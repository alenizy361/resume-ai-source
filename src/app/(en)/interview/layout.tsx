import type { Metadata } from "next";
import PageBody from "@/app/components/seo/PageBody";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "AI Interview Prep — Likely Questions & Strong Answers | Sira",
  description: "Paste your resume and the job description — get the 8 most likely interview questions with strong personalized answers, plus the red flags to prepare for.",
  alternates: { canonical: `${BASE}/interview` },
};

/**
 * 53 words in the server response before this — the tool is a client component. The section below
 * is server-rendered, and it also carries the only internal link to `/interview-live`, which the
 * crawl found orphaned: a page nothing links to is a page a crawler reaches last and a person
 * never reaches at all.
 */
export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageBody
        heading="What to prepare, and in what order"
        intro={[
          "Most interview preparation fails in the same way: hours spent on questions nobody asks, and no answer ready for the one the CV obviously invites. An interviewer reads the same document a recruiter did, and the questions come from what is in it — a gap between two jobs, a title that changed, a skill claimed once and never explained.",
          "This tool reads your CV against the advert and produces the questions that document actually provokes, with an answer built from your own experience rather than a template. It also names the weak points a careful interviewer will find, which is the part most preparation skips.",
        ]}
        stepsHeading="How to use it"
        steps={[
          { title: "Paste the CV and the advert", body: "Both. The questions change completely depending on what the employer emphasised." },
          { title: "Answer the uncomfortable ones first", body: "The gap, the short tenure, the missing certification. Those are the questions that decide the interview." },
          { title: "Say your answers out loud", body: "A prepared answer that has never been spoken comes out at twice the length it should. The live practice page is for exactly this." },
          { title: "Prepare two questions of your own", body: "Ending with none reads as indifference, and the questions you ask are read as closely as the ones you answer." },
        ]}
        faqHeading="Questions people ask"
        faq={[
          {
            q: "How do I explain a gap in my employment?",
            a: "Briefly, factually, and without apology — then move to what you did with the time. An interviewer is checking whether you can discuss it calmly, not auditing the months.",
          },
          {
            q: "What should I say about salary?",
            a: "Ask what range the role is budgeted at before naming a number. In the Saudi market total package matters more than base — housing and transport allowances are usually stated separately.",
          },
          {
            q: "Do I need to bring a printed CV?",
            a: "Bring two. Panels frequently have one copy between three people, and the person who arrives with spares is remembered for the right reason.",
          },
        ]}
        relatedHeading="Related"
        related={[
          { href: "/interview-live", label: "Practice answering out loud" },
          { href: "/optimize", label: "Check your CV against the advert" },
          { href: "/builder", label: "Build a CV" },
          { href: "/cover-letter-examples", label: "Cover letter examples" },
        ]}
        /* This page has no /ar twin — `/ar/interview` redirects here with `?lang=ar` — so the
           Arabic edition of this section travels with it. See PageBody's own header. */
        ar={{
          heading: "ما الذي تحضّره، وبأي ترتيب",
          intro: [
            "أغلب التحضير للمقابلات يفشل بالطريقة نفسها: ساعات على أسئلة لا يسألها أحد، ولا إجابة جاهزة للسؤال الذي تدعو إليه السيرة نفسها. من يقابلك يقرأ المستند الذي قرأه المسؤول عن التوظيف، والأسئلة تأتي مما فيه — فجوة بين وظيفتين، مسمى تغيّر، مهارة ذُكرت مرة ولم تُشرح.",
            "هذه الأداة تقرأ سيرتك مقابل الإعلان وتخرج بالأسئلة التي يثيرها مستندك فعلاً، مع إجابة مبنية على خبرتك أنت لا على قالب جاهز. وتسمّي كذلك نقاط الضعف التي سيجدها من يدقّق — وهي الجزء الذي يتخطاه معظم التحضير.",
          ],
          stepsHeading: "كيف تستخدمها",
          steps: [
            { title: "الصق السيرة والإعلان معاً", body: "كلاهما. الأسئلة تتغيّر تماماً بحسب ما ركّز عليه صاحب العمل." },
            { title: "ابدأ بالأسئلة المحرجة", body: "الفجوة، المدة القصيرة، الشهادة الناقصة. هذه هي الأسئلة التي تحسم المقابلة." },
            { title: "قل إجاباتك بصوت مرتفع", body: "الإجابة المحضّرة التي لم تُنطق تخرج بضعف طولها المناسب. صفحة التدريب المباشر لهذا الغرض بالضبط." },
            { title: "جهّز سؤالين من عندك", body: "أن تنهي بلا أسئلة يُقرأ لامبالاة، والأسئلة التي تطرحها تُقرأ بنفس دقة إجاباتك." },
          ],
          faqHeading: "أسئلة يسألها الناس فعلاً",
          faq: [
            { q: "كيف أشرح انقطاعاً في عملي؟", a: "باختصار، وبالحقائق، وبلا اعتذار — ثم انتقل إلى ما فعلته في تلك المدة. من يقابلك يتحقق من قدرتك على مناقشتها بهدوء، لا من عدد الأشهر." },
            { q: "ماذا أقول عن الراتب؟", a: "اسأل عن النطاق المرصود للوظيفة قبل أن تذكر رقماً. في السوق السعودي الحزمة الكاملة أهم من الأساسي — بدلا السكن والنقل يُذكران عادة بشكل منفصل." },
            { q: "هل أحتاج نسخة مطبوعة من سيرتي؟", a: "خذ نسختين. كثيراً ما تكون لدى لجنة المقابلة نسخة واحدة بين ثلاثة أشخاص، ومن يأتي بنسخ إضافية يُذكر للسبب الصحيح." },
          ],
          relatedHeading: "صفحات ذات صلة",
          related: [
            { href: "/interview-live?lang=ar", label: "تدرّب على الإجابة بصوتك" },
            { href: "/ar/optimize", label: "افحص سيرتك مقابل الإعلان" },
            { href: "/ar/builder", label: "ابنِ سيرتك" },
            { href: "/ar/cover-letter-examples", label: "نماذج خطابات تعريف" },
          ],
        }}
      />
    </>
  );
}
