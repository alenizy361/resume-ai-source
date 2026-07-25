import { permanentRedirect } from "next/navigation";

/**
 * The chat door is retired. This is what is left of it.
 *
 * ── why a redirect and not a deletion ──
 *
 * The route was live — `noindex`, but linked from the homepage and from the builder's own header, and
 * people bookmark what they were using. Deleting the file turns every one of those into a 404: someone
 * who was mid-CV in the conversation returns to nothing and has no way to know the product still
 * exists. A redirect costs one file and turns the same visit into the builder.
 *
 * `permanentRedirect` (308) rather than a temporary one, because the decision is not provisional. The
 * conversation is not coming back to this address, and a 308 tells the search engines that had picked
 * up inbound links — `noindex` stops indexing, not linking — to follow it rather than keep asking.
 *
 * ── what the visitor loses, and what they do not ──
 *
 * Not their work. `draftStore.ts` keeps one draft per language under `ra_journey_<lang>`, shared
 * between both doors, and `BuilderProvider` reads it on arrival: a chat draft's confirmed `profile`
 * crosses into the builder as the resume it already was. Only unconfirmed conversational state is
 * gone, which is the correct semantic — it was never a fact.
 *
 * ── what is gone now ──
 *
 * `Journey.tsx`, `journey.css` and `/api/interview` — thirteen hundred lines of component, its
 * stylesheet, and the route that fed it. They were kept for one commit while the redirect was
 * verified, then deleted together. The two CI harnesses that drove that route were rewritten
 * against `/api/generate`, which is what the builder actually spends money on, rather than left
 * pointing at a 404 where they would have gone on "passing" while measuring nothing.
 *
 * The guard the route carried came with it: `scrubDeep` now runs at the top of `/api/generate` and
 * `/api/suggest`, so a national ID typed into a form field is removed before anything is sent —
 * which is more than the old arrangement managed, since the builder never had that guard at all.
 */
export default function JourneyPage(): never {
  permanentRedirect("/builder");
}
