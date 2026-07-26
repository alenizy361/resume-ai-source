"use client";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Is the visitor reading Arabic?
 *
 * ── why this is a store subscription and not an effect ──
 *
 * It used to be `useState(false)` plus an effect calling `setAr` after reading the URL and
 * `localStorage`. That is the shape React's `set-state-in-effect` rule flags, and the reason is not
 * style: the language choice is EXTERNAL state, and copying it into React state means every
 * consumer renders once with the wrong answer and again with the right one. On a page whose whole
 * direction depends on this, that first render is a visible flip.
 *
 * `useSyncExternalStore` is the mechanism for exactly this: one read, no intermediate render, and a
 * server snapshot that is honest — on the server there is no URL and no storage, so it answers
 * `false`, which is what the server rendered, so hydration matches.
 *
 * ── the write stays an effect, and that is correct ──
 *
 * `?lang=ar` does not only report a choice, it MAKES one, and it has to survive the next
 * navigation. Writing to storage is updating an external system, which is what an effect is for.
 * It sets no state, so nothing re-renders because of it.
 */

function readLang(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "ar") return true;
    if (q === "en") return false;
    return (localStorage.getItem("ra_lang") || localStorage.getItem("ra_lang_choice") || "en") === "ar";
  } catch {
    /* Storage blocked, or no window. English is the safe answer — it is what the server sent. */
    return false;
  }
}

/**
 * The choice can change in another tab, and `storage` is how the browser says so. Nothing else
 * changes it mid-page: the landing toggle navigates rather than mutating in place.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function useLang(): boolean {
  const ar = useSyncExternalStore(subscribe, readLang, () => false);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (q === "ar" || q === "en") localStorage.setItem("ra_lang", q);
    } catch { /* a blocked storage must not break the page */ }
  }, []);

  return ar;
}
