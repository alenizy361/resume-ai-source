import { permanentRedirect } from "next/navigation";

/** Retired with its English twin. See app/v1/page.tsx. */
export default function ArV1Redirect(): never {
  permanentRedirect("/ar");
}
