import { permanentRedirect } from "next/navigation";

/**
 * Retired: the v1 scrollytelling landing.
 *
 * It was kept "for A-B comparison against the v2 Advisor" — a comparison that stopped
 * happening, leaving a third landing page in the tree. Nothing linked to it, it was absent
 * from the sitemap and marked `noindex`, so it was reachable only by typing the URL.
 *
 * A 308 rather than a delete because the address may sit in someone's history, and handing
 * it to the page that replaced it costs one file. The component it rendered
 * (`components/LandingScroll.tsx`, 725 lines) is deleted in the same commit — it had no other
 * caller, and git keeps it if the comparison is ever wanted again.
 */
export default function V1Redirect(): never {
  permanentRedirect("/");
}
