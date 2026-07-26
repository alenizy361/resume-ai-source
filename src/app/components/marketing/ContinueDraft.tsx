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
import { indexKey, listResumes, mayRestore, readResume } from "@/app/lib/resumeStore";
import { useOwner } from "@/app/components/useOwner";
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
  /*
   * Owner-scoped, like every other read of a resume.
   *
   * This used to watch `ra_journey_{lang}` — the single shared slot — and call `readBuilder(lang)`,
   * so on a shared browser it advertised "you have a CV in progress" pointing at whichever account
   * had used the laptop last, and the link carried that CV's id. Watching the OWNER'S INDEX instead
   * means the banner can only ever offer a resume belonging to whoever is signed in now.
   */
  const owner = useOwner();
  const raw = useSyncExternalStore(
    subscribe,
    () => { try { return owner ? localStorage.getItem(indexKey(owner)) : null; } catch { return null; } },
    () => null,
  );

  const draft = useMemo(() => {
    if (!raw || !owner) return null;
    /*
     * The visit rule applies HERE too, and its absence was half the reported bug.
     *
     * `BuilderProvider` refuses to restore a lapsed anonymous draft, but this banner read the index
     * directly — so the landing page went on announcing "you have a CV in progress" and offering a
     * link to a record the builder would decline to load. Two components answering the same question
     * differently, with the louder one wrong.
     *
     * One question, one answer: `mayRestore`.
     */
    if (!mayRestore(owner)) return null;
    /* The most recent resume is the right offer HERE, because this banner is the one place with no
       requested id to contradict — see the same reasoning in `BuilderProvider`. */
    const id = listResumes(owner)[0]?.resumeId;
    const state = id ? readResume(owner, id).record?.state ?? null : null;
    if (!id || !state) return null;
    // A draft with nothing in it is not progress worth advertising. Someone who opened the
    // builder and left should see the normal landing page, not a "continue" banner
    // pointing at an empty form.
    const label = state.target?.title?.trim() || state.personal?.fullName?.trim();
    if (!label) return null;
    const next = STEPS.find((s) => !state.sectionsDone.includes(s)) ?? STEPS[STEPS.length - 1];
    return { href: stepHref(lang, id, next), label, at: SECTION_COPY[lang].nav[next] };
  }, [raw, lang, owner]);

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
