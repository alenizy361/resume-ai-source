import OptimizeTool from "@/app/components/tools/OptimizeTool";

// Real page, not a redirect — unlike /ar/interview and /ar/linkedin. This route's layout.tsx
// wraps the tool in substantial, uniquely-Arabic SEO content that a redirect would orphan.
// See OptimizeTool.tsx's own header for the full reasoning.
export default function ArOptimizePage() {
  return <OptimizeTool defaultAr />;
}
