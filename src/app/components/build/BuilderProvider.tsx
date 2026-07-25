"use client";

/**
 * The builder's state, held above the routes.
 *
 * The problem this exists to solve, stated plainly: the reducer used to live inside the
 * one component that rendered all twelve sections, so "state survives" meant "state
 * survives a re-render". Splitting the journey into a page per step turns every Continue
 * into a navigation, and a navigation unmounts the page. Done naively, the eleven-route
 * version of this builder would lose the user's work on every step — strictly worse than
 * the long page it replaces.
 *
 * Two things prevent that, and both matter:
 *
 *  1. **The provider is mounted by the layout, not the page.** A Next.js layout stays
 *     mounted while its children change, so moving from `/builder/r1/target` to
 *     `/builder/r1/personal` re-renders the page and leaves this reducer untouched. No
 *     serialisation, no round-trip through storage, no flash of an empty form.
 *
 *  2. **Every Continue flushes synchronously before it navigates.** Autosave is
 *     debounced (450 ms), which is right for typing and wrong for leaving: type a phone
 *     number, press Continue, and the navigation beats the timer. `flush()` writes on the
 *     spot, so a cold load of the next step — a shared link, a phone that dropped the
 *     tab, a refresh — restores what the previous step just collected.
 *
 * Cold loads are the real test, and they are why the storage path still exists at all:
 * the layout keeps state across *soft* navigation only. A user who bookmarks
 * `/builder/r1/summary` and comes back tomorrow gets there through `readBuilder`.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from "react";
import { track } from "@vercel/analytics";

import { assembleResume } from "@/app/lib/mergeProfile";
import { computeProgress } from "@/app/lib/interviewGuards";
import { readBuilder, writeBuilder, readDraft } from "@/app/lib/draftStore";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import {
  type BuilderState, type SectionId, EMPTY_BUILDER, cvLang,
} from "@/app/lib/builderDoc";
import { type Action, reducer } from "./builderState";

export type SaveState = "" | "saving" | "saved" | "failed";

interface BuilderContextValue {
  lang: "ar" | "en";
  /** The id in the URL, once resolved against storage. Empty until hydration finishes. */
  resumeId: string;
  state: BuilderState;
  dispatch: React.Dispatch<Action>;
  save: SaveState;
  /** Write now, synchronously. Call before any navigation away from a step. */
  flush: () => void;
  /** False until the stored draft has been read, so nothing renders over real work. */
  hydrated: boolean;
  /** The assembled CV text, debounced — the preview and the exports both read this. */
  previewText: string;
  /** The document's language, which is not the interface's. */
  cv: "ar" | "en";
  progress: number;
  template: (typeof TEMPLATE_CATALOG)[number];
  /** Today, read once per mount: an expiry check that re-reads the clock renders differently for no reason. */
  today: string;
  markDone: (step: SectionId) => void;
}

const Ctx = createContext<BuilderContextValue | null>(null);

/**
 * Read the builder's state from inside the step routes.
 *
 * Throws rather than returning a default. A section that silently got `EMPTY_BUILDER`
 * because it rendered outside the provider would look like it worked and quietly discard
 * everything the user typed into it — the exact failure mode this whole file is about.
 */
export function useBuilder(): BuilderContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBuilder must be used inside <BuilderProvider>");
  return v;
}

export default function BuilderProvider({
  lang, resumeId: urlId, children,
}: {
  lang: "ar" | "en";
  /**
   * The id from the URL, when there is one. `/builder` itself has none — it is the
   * landing, and the id is resolved from storage there.
   */
  resumeId?: string;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, EMPTY_BUILDER);
  const [resumeId, setResumeId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /*
   * Hydrate once, from whichever of the three states the browser is actually in.
   *
   * Keyed on `lang` only. Not on `urlId`: re-running this when the URL's id changes
   * would let a mistyped id wipe a live reducer back to the stored copy, and the
   * mismatch case is handled by redirecting the URL to the real id rather than by
   * reloading state to match the URL.
   */
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { id, state: saved, fromChat } = readBuilder(lang);
    if (saved) {
      dispatch({ t: "hydrate", state: { ...EMPTY_BUILDER, ...saved } });
    } else if (fromChat) {
      // A draft started in the chat: carry the confirmed resume across, which is the
      // entire point of the two doors sharing a key. Only `profile` crosses, because
      // only `profile` is confirmed content — the chat has no suggestion bag.
      dispatch({ t: "hydrate", state: { ...EMPTY_BUILDER, profile: readDraft(lang).profile } });
    }
    setResumeId(urlId || id);
    setHydrated(true);
    track("builder_started", { lang, surface: "steps" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  /*
   * The current state, readable from a callback without making the callback change.
   *
   * Written in an effect rather than during render. `flush` is only ever called from an
   * event handler or an unload listener, both of which run after the commit, so the ref
   * is current by the time anyone reads it.
   */
  const live = useRef(state);
  useEffect(() => { live.current = state; }, [state]);

  /*
   * Autosave: debounced, local-first, never blocking.
   *
   * The indicator is DERIVED from what was actually written, not set alongside the
   * write. Storing "saved" separately let the two disagree — the label is the one part
   * of this the user can see, and it claiming "Saved" while the write threw is the worst
   * available outcome. `written === state` is an identity check, which is exactly right
   * for a reducer: any change produces a new object.
   */
  const [written, setWritten] = useState<BuilderState | null>(null);
  const [failed, setFailed] = useState(false);

  const flush = useCallback(() => {
    if (!hydrated || !resumeId) return;
    try {
      writeBuilder(lang, resumeId, live.current);
      setWritten(live.current);
      setFailed(false);
    } catch { setFailed(true); }
  }, [hydrated, resumeId, lang]);

  useEffect(() => {
    if (!hydrated || !resumeId) return;
    const id = setTimeout(() => {
      try { writeBuilder(lang, resumeId, state); setWritten(state); setFailed(false); }
      catch { setFailed(true); }
    }, 450);
    return () => clearTimeout(id);
  }, [state, lang, resumeId, hydrated]);

  const save: SaveState = failed ? "failed"
    : written === null ? ""
    : written === state ? "saved"
    : "saving";

  /*
   * The two ways a mobile session ends without a Continue.
   *
   * `pagehide` covers a closed tab and a followed link; `visibilitychange` covers the
   * app being backgrounded, which on iOS is the common one — Safari can discard a
   * backgrounded tab without ever firing an unload. Both flush the debounce.
   */
  useEffect(() => {
    const onHide = () => flush();
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flush]);

  /* The preview is expensive: ResumeTemplate re-parses and re-measures on every text
     change, so binding it to raw keystrokes re-lays out an A4 page per letter. */
  const [previewText, setPreviewText] = useState("");
  const cv = cvLang(state.target);
  const resumeRtl = cv === "ar";
  useEffect(() => {
    const id = setTimeout(() => setPreviewText(assembleResume(state.profile, resumeRtl)), 250);
    return () => clearTimeout(id);
  }, [state.profile, resumeRtl]);

  const template = useMemo(
    () => TEMPLATE_CATALOG.find((x) => x.slug === state.template) ?? TEMPLATE_CATALOG[0],
    [state.template],
  );
  const progress = useMemo(() => computeProgress(state.profile), [state.profile]);

  const markDone = useCallback((step: SectionId) => {
    dispatch({ t: "done", section: step });
    track("builder_section_completed", { section: step });
  }, []);

  const value = useMemo<BuilderContextValue>(() => ({
    lang, resumeId, state, dispatch, save, flush, hydrated,
    previewText, cv, progress, template, today, markDone,
  }), [lang, resumeId, state, save, flush, hydrated, previewText, cv, progress, template, today, markDone]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
