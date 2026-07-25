"use client";

/**
 * "You have a CV in progress" — the only thing on the landing page that needs a browser.
 *
 * Worth its own client component rather than making the whole page client-side. Whether
 * this visitor has a draft is a fact about localStorage, and localStorage does not exist
 * during the server render; guessing would be a hydration mismatch on the product's most
 * important page, and making the page client-only would cost it the static HTML a crawler
 * reads.
 *
 * `useSyncExternalStore` rather than read-in-an-effect. localStorage IS an external store,
 * which is exactly what this hook is for, and the effect version has two real costs: it
 * renders once with the wrong answer and then again with the right one, and it is the
 * pattern behind most of the remaining lint errors in this codebase. The `getServerSnapshot`
 * argument — `() => null` — is the part that makes it safe: the server and the first client
 * render agree that there is no draft, and the real value arrives without a mismatch.
 *
 * The raw string is the subscribed value because a string is stable by value; returning a
 * freshly parsed object from `getSnapshot` would make React re-render forever. Parsing
 * happens in a memo keyed on it.
 */

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { draftKey, readBuilder } from "@/app/lib/draftStore";
import { STEPS, stepHref, SECTION_COPY } from "../build/steps";

const T = {
  en: { head: "You have a CV in progress", go: "Continue →" },
  ar: { head: "لديك سيرة قيد الإنشاء", go: "واصل ←" },
};

/** Another tab editing the same draft. Same-tab writes re-render on their own. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function ContinueDraft({ lang }: { lang: "ar" | "en" }) {
  const raw = useSyncExternalStore(
    subscribe,
    () => { try { return localStorage.getItem(draftKey(lang)); } catch { return null; } },
    () => null,
  );

  const draft = useMemo(() => {
    if (!raw) return null;
    const { id, state } = readBuilder(lang);
    if (!state) return null;
    // A draft with nothing in it is not progress worth advertising. Someone who opened the
    // builder and left should see the normal landing page, not a "continue" banner
    // pointing at an empty form.
    const label = state.target?.title?.trim() || state.personal?.fullName?.trim();
    if (!label) return null;
    const next = STEPS.find((s) => !state.sectionsDone.includes(s)) ?? STEPS[STEPS.length - 1];
    return { href: stepHref(lang, id, next), label, at: SECTION_COPY[lang].nav[next] };
  }, [raw, lang]);

  if (!draft) return null;

  return (
    <Link
      href={draft.href}
      className="card card-hover mt-6 flex items-center justify-between gap-4 p-4"
      style={{ borderColor: "rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.05)" }}
    >
      <span>
        <span className="block text-xs font-semibold" style={{ color: "#6ee7b7" }}>{T[lang].head}</span>
        <span className="mt-0.5 block text-sm font-bold">{draft.label}</span>
        <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>{draft.at}</span>
      </span>
      <span className="flex-none text-sm font-bold" style={{ color: "#6ee7b7" }}>{T[lang].go}</span>
    </Link>
  );
}
