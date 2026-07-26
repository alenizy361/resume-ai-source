import { permanentRedirect } from "next/navigation";

/**
 * The long single-page builder is retired. This is what is left of it.
 *
 * ── why it went ──
 *
 * Two builders were reachable at once, and the menu pointed at this one. They were not the same
 * product: the step routes have the prerequisite banner, the progress rail, the lifecycle label,
 * the offline sentence and the damaged-draft hold; this page had its own reducer, its own autosave
 * and none of that. Every fix landed twice or — more often — once, and the user who tapped
 * "CV Builder" in the menu got whichever half had been forgotten.
 *
 * The rollback argument that kept it alive ("some people prefer one scroll") stopped paying for
 * itself the moment the two behaved differently. It was also carrying a live bug nobody had hit:
 * `DesignSection` read the builder context, which this page never provided, so finishing a CV here
 * would have thrown — invisible because no test ever reached the last section on this route.
 *
 * ── what a visitor loses ──
 *
 * Nothing. The draft is one record in `localStorage`, shared by both surfaces, so a CV started here
 * opens in the step routes exactly as it was left.
 *
 * `permanentRedirect` (308) because the decision is not provisional, and because this address was
 * linked from the mobile menu and from every resume-example page — those links now point at
 * `/builder`, but the ones already in someone's history do not.
 */
export default function BuildPage(): never {
  permanentRedirect("/builder");
}
