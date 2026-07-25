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
 * ── what is deliberately still here ──
 *
 * `Journey.tsx` itself. Thirteen hundred lines with its own stylesheet, its own tests and its own API
 * route; removing a route is reversible in one line and removing all of that is not. The component is
 * now unreachable, which is what was asked for. Deleting it is a separate change with its own
 * verification — the last time a large file was deleted here it broke a test that referenced it, and
 * that was caught only because the suite was run afterwards.
 */
export default function JourneyPage(): never {
  permanentRedirect("/builder");
}
