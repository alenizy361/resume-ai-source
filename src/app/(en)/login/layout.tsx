import type { Metadata } from "next";

/**
 * The sign-in page is not a landing page.
 *
 * It was indexable and had no metadata of its own, so it inherited the root title and description
 * — which meant `/login`, `/account` and `/pay/callback` all told Google they were the same page.
 * Three private screens competing with each other, and with the marketing pages, for nothing: a
 * search result that lands on a login form is a bounce.
 *
 * `follow: true` so the links out of it still pass signal; `index: false` so it stops asking to be
 * found. The page is a client component and cannot export metadata itself — hence this layout.
 */
export const metadata: Metadata = {
  title: "Sign in — Sira",
  description: "Sign in with a magic link to reach your saved CVs and scans.",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
