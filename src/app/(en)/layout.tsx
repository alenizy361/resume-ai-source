/**
 * The English root layout.
 *
 * Everything this file used to do — `<html>`, `<body>`, the fonts, the backdrop, the JSON-LD — is in
 * `components/RootShell.tsx` now, and the only thing that differs between the two languages is the
 * one prop below. See that file for why the split exists: the old single layout read `headers()` to
 * find out whether the path was Arabic, and a dynamic API in a root layout makes every route in the
 * app dynamic. 5 static routes became 46, plus 9 prerendered by `generateStaticParams`.
 */

import RootShell from "@/app/components/RootShell";
import { SITE_METADATA } from "@/app/lib/siteMetadata";

export const metadata = SITE_METADATA;

export default function EnglishRootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="en">{children}</RootShell>;
}
