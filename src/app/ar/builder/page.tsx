import { permanentRedirect } from "next/navigation";

/**
 * Retired: the Arabic-only scripted chat builder.
 *
 * It was a third builder beside the interview and the form, with its own two
 * endpoints (`/api/build-cv`, `/api/refine`) that nothing else called, and it linked
 * to `/ar/build` under the label "الوضع الكلاسيكي" — a link that now leads to the
 * newest interface in the product, which is the clearest possible sign the page had
 * stopped describing reality.
 *
 * It keeps its address as a permanent redirect rather than 404ing: the URL is in the
 * sitemap Google has already crawled, and a 308 hands that history to the page that
 * replaced it.
 */
export default function ArBuilderRedirect(): never {
  permanentRedirect("/ar/build");
}
