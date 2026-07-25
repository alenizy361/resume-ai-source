"use client";

/**
 * Sends a visitor to the door they chose, and nobody else anywhere.
 *
 * `/` now renders the form builder for every first-time visitor and for anyone who never
 * expressed a preference — the homepage's default is a product decision, not this
 * component's. What this does is honour an explicit choice in EITHER direction: someone
 * who clicked "talk to the AI instead" once should not be dropped back into the form
 * every time they return, and vice versa.
 *
 * It reads `storedBuilderMode`, which has no environment fallback, so the rollout dial
 * cannot leak in here and start moving people who never asked to be moved.
 *
 * The cost is a brief flash of the chat before the navigation for those users. That is
 * the honest price of keeping `/` server-rendered with its own metadata: resolving the
 * door during render would need localStorage on the server, and guessing it would be a
 * hydration mismatch on the product's most important page.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { storedBuilderMode } from "@/app/lib/flags";

export default function DoorRedirect({
  lang, rendered,
}: {
  lang: "ar" | "en";
  /** Which door this page is showing. A match means stay put. */
  rendered: "chat" | "form";
}) {
  const router = useRouter();
  useEffect(() => {
    const chose = storedBuilderMode();
    if (!chose || chose === rendered) return;
    const to = chose === "form"
      ? (lang === "ar" ? "/ar/build" : "/build")
      : (lang === "ar" ? "/ar/journey" : "/journey");
    router.replace(to);
  }, [lang, rendered, router]);
  return null;
}
