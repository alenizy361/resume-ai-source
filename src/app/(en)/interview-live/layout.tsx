import type { Metadata } from "next";
import PageBody from "@/app/components/seo/PageBody";
import FunnelBeacon from "@/app/components/seo/FunnelBeacon";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "AI Video Mock Interview — Practice on Camera | Sira",
  description: "Practice the interview on camera: the AI asks real questions, you answer on video, and get an instant score and coaching.",
  /*
   * No `ar` alternate, and the removal is the fix.
   *
   * It used to declare `?lang=ar` as the Arabic version — but the canonical here strips the query,
   * so that alternate resolved to this same URL. An hreflang pair whose two members are the same
   * page is not a language signal; it is a contradiction, and Google resolves contradictions by
   * ignoring the whole cluster. This page is one bilingual client component with one address: it
   * switches language in the browser and has no second URL to point at, so it declares none.
   */
  alternates: {
    canonical: `${BASE}/interview-live`,
    languages: { "x-default": `${BASE}/interview-live` },
  },
};

/**
 * The last thin page, and why it was the hardest to fix.
 *
 * The crawl measured 66 words in this page's server response — the lowest on the site — because the
 * page genuinely IS the application: a camera, a microphone, a live transcriber and an avatar, none
 * of which exists before JavaScript runs. Unlike `/optimize` there was no argument that the tool
 * should be server-rendered.
 *
 * But a page that ranks for "mock interview practice" and arrives empty ranks for nothing, and the
 * fix is the same one the other tools got: keep the client tool exactly as it is, and give the page
 * a server-rendered half that says what the thing does, what it costs, and — the part that matters
 * most on a page asking for camera access — where the video goes. That last section is not written
 * for a crawler. It is the question every first-time visitor has and the page never answered above
 * the fold.
 *
 * English only, deliberately: this route has a single address and switches language in the browser,
 * so there is no Arabic URL for an Arabic body to live at. The Arabic interface still arrives with
 * the app, and `/ar/interview` is the Arabic-addressed page that carries Arabic prose.
 */
export default function InterviewLiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageBody
        heading="How the AI video mock interview works"
        intro={[
          "You give it the role you are aiming for and a short account of your experience. It asks the questions that role actually gets asked, out loud and in writing, one at a time. You answer on camera the way you would in the room — no typing, no second attempt before you have finished — and it scores each answer and tells you what to change.",
          "The point is not the score. It is that answering out loud is a different skill from knowing the answer, and it is the one nobody practises. Most people rehearse in their head, where there are no pauses, no filler words and no moment of realising halfway through a sentence that they have not said the number yet.",
          "It works in Arabic and English, and the language follows your interface: the questions, the coaching and the transcript all arrive in the language you are reading this in.",
        ]}
        stepsHeading="What happens, step by step"
        steps={[
          { title: "You describe the role", body: "The job title and a short summary of your experience. The questions are generated from both, so a radiology technologist is not asked a software engineer's questions." },
          { title: "It asks, you answer on camera", body: "The question is spoken and shown. You record your answer while the browser transcribes it live, so you can see what you actually said rather than what you meant to say." },
          { title: "It scores the answer", body: "A score out of ten with one thing you did well and one specific change — not \"be more confident\", but the sentence that was missing a number or the answer that never reached the result." },
          { title: "You do it again", body: "The same question until the answer holds together, or the next one. Repetition on camera is the whole exercise." },
        ]}
        faqHeading="Questions people ask before they turn the camera on"
        faq={[
          {
            q: "Where does my video go?",
            a: "Nowhere. The recording stays in your browser on your own device and is never uploaded. Only the text transcript of your answer is sent, because that is what the coaching is written from. Closing the tab discards the video.",
          },
          {
            q: "Do I need a camera to use it?",
            a: "A camera and a microphone, yes — answering on camera is the part that makes this different from reading a list of questions. If live transcription is not supported in your browser you can type the answer instead and still get the same coaching.",
          },
          {
            q: "Is it free?",
            a: "The interview is part of the paid pack; the resume scanner and the CV builder are free to use. There is no subscription — access is bought once, for a fixed period.",
          },
          {
            q: "Will it write my answers for me?",
            a: "No, and that is deliberate. It tells you what is missing from the answer you gave; it does not hand you a script. An answer you did not write is one you cannot defend when the follow-up question comes.",
          },
          {
            q: "How many questions should I practice?",
            a: "Five answered properly beats twenty rushed. The questions that repeat across interviews for one role are a short list, and getting through that list out loud once is worth more than reading fifty of them.",
          },
        ]}
        relatedHeading="Related"
        related={[
          { href: "/interview", label: "Interview questions by role" },
          { href: "/optimize", label: "Check your resume against a job post" },
          { href: "/builder", label: "Build an ATS-ready CV" },
          { href: "/pricing", label: "Pricing" },
          { href: "/ar/interview", label: "تحضير المقابلة بالعربية" },
        ]}
      />
      <FunnelBeacon step="toolOpened" />
    </>
  );
}
