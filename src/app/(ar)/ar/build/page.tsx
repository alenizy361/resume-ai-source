import { permanentRedirect } from "next/navigation";

/**
 * The Arabic long-page builder, retired. See `app/build/page.tsx` for why.
 *
 * It redirects to `/ar/builder` and not to `/builder`: sending an Arabic visitor to the English
 * builder would be a second, unasked-for change on top of losing the page they were using.
 */
export default function ArabicBuildPage(): never {
  permanentRedirect("/ar/builder");
}
