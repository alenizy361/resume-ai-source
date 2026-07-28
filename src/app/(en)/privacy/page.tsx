import type { Metadata } from "next";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";
import { BRAND } from "@/app/lib/brand";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Privacy Policy | Sira",
  description: "How we handle your resume and your data: what stays on your device, what's saved to your account when you sign in, and how to delete any of it.",
  alternates: {
    canonical: `${BASE}/privacy`,
    languages: { en: `${BASE}/privacy`, ar: `${BASE}/ar/privacy`, "x-default": `${BASE}/privacy` },
  },
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="t-enter mb-8">
    <h2 className="mb-3 text-xl font-bold">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{children}</div>
  </section>
);

/*
 * A genuine parallel document, not a summary — see the note in terms/page.tsx for why this
 * changed. Same policy substance as `/ar/privacy`, same section order, written in full English.
 */
export default function PrivacyPage() {
  return (
    <PageShell lang="en" langToggle="/ar/privacy">
      <div className="mx-auto max-w-3xl">
        <div className="chip mb-4">Privacy Policy</div>
        <h1 className="mb-2 text-3xl font-extrabold">Your privacy and your resume</h1>
        <p className="mb-10 text-sm" style={{ color: "var(--muted)" }}>
          Last updated: July 2026 · Applies to cv.rabit.sa — a resume service operated under the Rabit.sa domain.
        </p>

        <Section title="1. Is your resume stored with us?">
          <p>
            <strong>If you're not signed in</strong>, no. The draft you type is saved only on your own device
            (your browser's localStorage) so your writing survives a page refresh — you can clear it with the
            "Start over" button, or by clearing your browser data. When you run a scan, your text is sent for
            processing and returned to you immediately; nothing is kept on our side.
          </p>
          <p>
            <strong>If you sign in</strong>, your resume document (the structured CV you build — your
            employers, dates, licenses, and every line you've confirmed) is saved to your account on our
            servers, so it's available if you come back on another device. It is stored under your email,
            never shared with anyone else, and you can delete any saved resume permanently from your account
            page at any time — deletion is immediate, not a request we process later.
          </p>
          <p>
            One more exception either way: if you choose "Publish a public link", the text you chose to
            publish is saved at that public link, and an "Unpublish" button next to it deletes it permanently
            at any time.
          </p>
        </Section>

        <Section title="2. Where does processing happen?">
          <p>
            Processing runs through a cloud AI provider (servers outside Saudi Arabia — the United States).
            Your resume text is sent only to generate the result. <strong>We never use your data to train any
            model</strong>, and we never sell or share it with any marketing party.
          </p>
        </Section>

        <Section title="3. What do we actually keep?">
          <p>Only the minimum needed to run your account:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Your email (for sign-in and linking your access) — kept until you ask us to delete it.</li>
            <li>Your access status and its expiry date.</li>
            <li>Any resume you choose to save while signed in — kept until you delete it from your account, which you can do at any time.</li>
            <li>Payment details are handled entirely by the licensed gateway Paylink — we never see or store your card number.</li>
          </ul>
        </Section>

        <Section title="4. The no-fabrication pledge">
          <p>
            Our system is technically constrained from adding any number, experience, or credential you did
            not state in your resume. When a figure is missing, the system writes "[add your real number]"
            in its place instead of inventing one. Your resume stays yours — clearer and stronger, but honest.
          </p>
        </Section>

        <Section title="5. Your rights and how to delete">
          <ul className="ml-5 list-disc space-y-1">
            <li>Delete your drafts: the "Start over" button, or clear your site data from your browser (instant, in your own hands).</li>
            <li>Delete a published link: the "Unpublish" button next to it.</li>
            <li>Delete your account and email permanently: email us and we act within 7 days.</li>
            <li>Under Saudi Arabia's Personal Data Protection Law (PDPL) you have the right to access, correct, and delete your data — contact us for any of these.</li>
          </ul>
        </Section>

        <Section title="6. Who we are and how to reach us">
          <p>
            Sira is a resume service running on <span dir="ltr">cv.rabit.sa</span>, operated by Rabit.
            For any question about your data, payment, or deletion:
          </p>
          <p>📧 <a href={`mailto:${BRAND.supportEmail}`} className="text-accent underline">{BRAND.supportEmail}</a></p>
          <p>We typically reply within 24–48 hours.</p>
        </Section>

        <div className="mt-10 flex gap-4">
          <Link href="/terms" className="btn-ghost px-6 py-2.5 text-sm font-semibold" style={{ color: "var(--fg)" }}>Terms &amp; Conditions →</Link>
          <Link href="/" className="btn-accent px-6 py-2.5 text-sm">Home</Link>
        </div>
      </div>
    </PageShell>
  );
}
