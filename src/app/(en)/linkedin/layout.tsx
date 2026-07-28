import type { Metadata } from "next";
import PageBody from "@/app/components/seo/PageBody";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Free LinkedIn Profile Optimizer — Headline, About & Skills | Sira",
  description: "Paste your resume and target role — get a keyword-rich LinkedIn headline, a compelling About section, and the exact skills recruiters search for.",
  alternates: { canonical: `${BASE}/linkedin` },
};

/**
 * The tool is a client component, so this page shipped 54 words to a crawler — measured with
 * `ops/seo-audit.mjs`. The section below is server-rendered and is also what a visitor who has not
 * pasted anything yet needs in order to decide whether to.
 */
export default function LinkedinLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageBody
        heading="Why a LinkedIn profile is not a CV"
        intro={[
          "A CV answers one advert. A LinkedIn profile is searched by recruiters who have not met you, using words they choose — which is why a profile that reads like a pasted CV performs badly. The headline is indexed most heavily, the About section is read by humans, and the skills list is what most recruiter filters actually query.",
          "This tool reads the CV you already have and proposes the three separately: a headline built around the role you are targeting, an About section written in the first person, and the skills a recruiter searching for that role would type. It suggests nothing your CV does not support.",
        ]}
        stepsHeading="How to use it"
        steps={[
          { title: "Paste the CV", body: "The same text you would send to an employer. It is read in your browser and not stored on a server." },
          { title: "Name the role you want next", body: "Not the one you have. A profile is a claim about where you are going, and the vocabulary differs." },
          { title: "Take the headline first", body: "It is the single highest-value field: it appears in every search result, every message and every comment you leave." },
          { title: "Edit the About in your own voice", body: "First person, short paragraphs. A profile that reads like a job description is a profile people stop reading." },
        ]}
        faqHeading="Questions people ask"
        faq={[
          {
            q: "Should my LinkedIn be in Arabic or English?",
            a: "English for multinationals and most technical recruiting in the Gulf; Arabic if your target employers are local and recruit in Arabic. LinkedIn supports a second profile language, which is better than mixing the two in one profile.",
          },
          {
            q: "How many skills should I list?",
            a: "Enough to cover what recruiters search for and no more — a list of fifty says nothing. Prioritise the ones the adverts you are answering actually name.",
          },
          {
            q: "Does the headline really matter that much?",
            a: "It is the field with the most weight in LinkedIn's own search and the one people see everywhere your name appears. A default headline of just a job title wastes the most valuable line on the profile.",
          },
        ]}
        relatedHeading="Related"
        related={[
          { href: "/optimize", label: "Check your CV against a job" },
          { href: "/builder", label: "Build a CV" },
          { href: "/interview", label: "Prepare for the interview" },
          { href: "/resume-examples", label: "Resume examples by job" },
        ]}
        ar={{
          heading: "لماذا لا يصلح نسخ سيرتك في لينكدإن",
          intro: [
            "السيرة الذاتية تردّ على إعلان وظيفي واحد. أما ملفك في لينكدإن فيبحث فيه موظفو التوظيف بكلمات يختارونها هم، ولذلك فإن الملف الذي يقرأ كسيرة ملصوقة يؤدي أداءً ضعيفاً. العنوان هو الحقل الأثقل في نتائج البحث، وقسم «نبذة» يقرأه بشر، وقائمة المهارات هي ما تستعلم عنه فلاتر التوظيف فعلياً.",
            "هذه الأداة تقرأ سيرتك الحالية وتقترح الثلاثة كلٌّ على حدة: عنوان مبني على الوظيفة التي تستهدفها، ونبذة مكتوبة بصيغة المتكلم، والمهارات التي يكتبها الباحث عن هذا الدور. ولا تقترح شيئاً لا تدعمه سيرتك.",
          ],
          stepsHeading: "كيف تستخدمها",
          steps: [
            { title: "الصق السيرة", body: "النص نفسه الذي ترسله لصاحب العمل. يُقرأ داخل متصفحك ولا يُخزَّن على خادم." },
            { title: "سمِّ الوظيفة التي تريدها بعد", body: "لا التي تشغلها الآن. الملف ادعاء عن وجهتك، والمفردات تختلف." },
            { title: "ابدأ بالعنوان", body: "هو الحقل الأعلى قيمة: يظهر في كل نتيجة بحث، وكل رسالة، وكل تعليق تكتبه." },
            { title: "أعد صياغة النبذة بصوتك", body: "بصيغة المتكلم وفقرات قصيرة. الملف الذي يقرأ كوصف وظيفي هو ملف يتوقف الناس عن قراءته." },
          ],
          faqHeading: "أسئلة يسألها الناس فعلاً",
          faq: [
            {
              q: "هل أكتب لينكدإن بالعربية أم بالإنجليزية؟",
              a: "الإنجليزية للشركات متعددة الجنسيات ولمعظم التوظيف التقني في الخليج، والعربية إن كان أصحاب العمل المستهدفون محليين ويوظفون بالعربية. لينكدإن يدعم لغة ثانية للملف، وهذا أفضل من خلط اللغتين في ملف واحد.",
            },
            {
              q: "كم مهارة أضع؟",
              a: "ما يكفي لتغطية ما يبحث عنه الموظِّفون ولا أكثر — قائمة من خمسين مهارة لا تقول شيئاً. قدِّم ما تسمّيه الإعلانات التي تتقدم لها فعلاً.",
            },
            {
              q: "هل العنوان بهذه الأهمية حقاً؟",
              a: "هو الحقل الأثقل وزناً في بحث لينكدإن نفسه، وهو ما يراه الناس في كل موضع يظهر فيه اسمك. عنوان افتراضي لا يحمل سوى المسمى الوظيفي يهدر أثمن سطر في الملف.",
            },
          ],
          relatedHeading: "صفحات ذات صلة",
          related: [
            { href: "/ar/optimize", label: "افحص سيرتك أمام وظيفة" },
            { href: "/ar/builder", label: "ابنِ سيرتك" },
            { href: "/interview?lang=ar", label: "استعد للمقابلة" },
            { href: "/ar/pricing", label: "الأسعار" },
          ],
        }}
      />
    </>
  );
}
