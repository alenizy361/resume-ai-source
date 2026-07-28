import Link from "next/link";
import { type Lang, copyFor, sectorForCategory } from "@/app/lib/sectors.ts";

/**
 * The link from a profession page UP to its sector — the half of internal linking that the site
 * was missing.
 *
 * Every templated page already links sideways (siblings in the same category) and down (nothing is
 * below it). Nothing linked up, so the sector pages would have been reachable from the two hubs
 * only, and a crawler arriving on a profession page from a search result had no route into the
 * layer above it. Six pages need this and the conditional is the whole reason it is a component:
 * `sectorForCategory` returns undefined for a category too thin to publish, and each of those six
 * call sites would otherwise have to remember that.
 */
export default function SectorLink({
  category, lang, className, style,
}: {
  category: string;
  lang: Lang;
  className?: string;
  style?: React.CSSProperties;
}) {
  const sector = sectorForCategory(category, lang);
  if (!sector) return null;
  const copy = copyFor(sector, lang)!;
  const href = lang === "ar"
    ? `/ar/resume-examples/category/${sector.slug}`
    : `/resume-examples/category/${sector.slug}`;
  const label = lang === "ar"
    ? `كل مهن قطاع ${copy.name}`
    : `All ${copy.name} professions`;
  /* A "forward" arrow points toward the reading direction, so it flips in RTL — this one was
     hard-coded and pointed BACK on every Arabic sector link. `StepActions` and `OptimizeTool`
     already branch; this file, `SectorPage` and `linkedin` did not. */
  return (
    <Link href={href} className={className} style={style}>{label} {lang === "ar" ? "←" : "→"}</Link>
  );
}
