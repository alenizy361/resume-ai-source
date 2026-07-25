import { permanentRedirect } from "next/navigation";

/**
 * The Arabic chat door, retired. See `app/journey/page.tsx` for why this is a redirect rather than a
 * deletion.
 *
 * It redirects to `/ar/builder` and not to `/builder`: sending an Arabic visitor to the English
 * builder would be a second, unasked-for change on top of losing the door they were using.
 */
export default function ArabicJourneyPage(): never {
  permanentRedirect("/ar/builder");
}
