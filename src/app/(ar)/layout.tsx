/**
 * The Arabic root layout — `lang="ar"`, `dir="rtl"`, and nothing else of its own.
 *
 * The `ar` URL segment stays inside this group (`app/(ar)/ar/...`), because a route group's name is
 * not part of the URL: every Arabic address is unchanged, which for 382 indexed pages is the only
 * acceptable outcome.
 *
 * Serving `/ar` with `lang="en"` was a real a11y and SEO fault and was fixed once by reading the
 * request path in the root layout. That fix cost the whole site its static generation. This keeps the
 * fix and gives the static generation back, because the group already knows the answer the header was
 * being consulted for.
 */

import RootShell from "@/app/components/RootShell";
import { SITE_METADATA } from "@/app/lib/siteMetadata";

export const metadata = SITE_METADATA;

export default function ArabicRootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="ar">{children}</RootShell>;
}
