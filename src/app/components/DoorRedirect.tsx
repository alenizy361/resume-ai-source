"use client";

/**
 * Sends a visitor to the door they chose, and nobody else anywhere.
 *
 * `/` still renders the chat for every first-time visitor and for anyone who never
 * expressed a preference — the homepage's default is a product decision, not this
 * component's. What this does is honour an explicit choice: someone who clicked "I'd
 * rather fill a form" once should not have to click it again every time they come back.
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

export default function DoorRedirect({ lang }: { lang: "ar" | "en" }) {
  const router = useRouter();
  useEffect(() => {
    if (storedBuilderMode() !== "form") return;
    router.replace(lang === "ar" ? "/ar/build" : "/build");
  }, [lang, router]);
  return null;
}
