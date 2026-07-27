import PdfReadabilityChecker from "@/app/components/tools/PdfReadabilityChecker";

// Real page, not a redirect — matches /ar/optimize, not /ar/interview. This route's layout.tsx
// wraps the tool in its own, uniquely-Arabic SEO content, so a redirect stub would orphan it.
export default function ArPdfReadabilityCheckerPage() {
  return <PdfReadabilityChecker defaultAr />;
}
