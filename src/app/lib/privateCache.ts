/**
 * Cache headers for responses that belong to one person.
 *
 * ── the gap this closes ──
 *
 * An audit of every route turned up two problems and one absence:
 *
 *   `/api/resumes`   the user's saved CV list — NO Cache-Control at all
 *   `/api/tts`       `public, max-age=86400` on synthesised speech of interview questions
 *   everything else  no header, so the default applies
 *
 * "No header" is not the same as "not cached". A response without `Cache-Control` is subject to
 * heuristic caching by intermediaries, and `public` is an instruction to a SHARED cache to keep the
 * bytes and serve them to whoever asks next. On a CV list that is one account's employment history
 * handed to a stranger.
 *
 * ── why two policies and not one ──
 *
 * `private, no-cache, must-revalidate` still lets the BROWSER hold a copy and revalidate it, which is
 * what makes a back-button press instant. That is right for a resume the same person is editing.
 *
 * `private, no-store` forbids writing it down anywhere at all. That is right where the bytes should
 * not survive the response — a session probe, an entitlement answer, synthesised audio of someone's
 * interview. It costs a round trip and buys not leaving a copy on disk.
 *
 * Neither is applied globally: static assets and the 382 public SEO pages must stay cacheable, and
 * disabling caching everywhere to fix a leak in two routes is how a site gets slow for a reason
 * nobody remembers.
 */

/** A resume the owner is editing. The browser may hold it; no shared cache may. */
export const PRIVATE_REVALIDATE = "private, no-cache, must-revalidate";

/** Nothing writes this down. For credentials, entitlements, and generated audio of personal text. */
export const PRIVATE_NO_STORE = "private, no-store";

/**
 * Headers for a private JSON response.
 *
 * `Vary: Cookie` is the half that is easy to forget and the half that matters most: without it a
 * cache that ignores `private` — a corporate proxy, an over-eager service worker — can key one
 * account's response by URL alone and serve it to the next session on the same connection.
 */
export function privateJsonHeaders(policy: string = PRIVATE_REVALIDATE): Record<string, string> {
  return {
    "Cache-Control": policy,
    Vary: "Cookie",
  };
}
