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
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";

import { assembleResume } from "@/app/lib/mergeProfile";
import { applyVersionToProfile, buildTranslationSource, translationFresh } from "@/app/lib/translate";
import { computeProgress } from "@/app/lib/interviewGuards";
import { readDraft } from "@/app/lib/draftStore";
import {
  endAnonymousVisit, keepVisitAlive, listResumes, markMirrored, mayRestore, migrateLegacy, newResumeId, readResume, titleOf, writeResume,
} from "@/app/lib/resumeStore";
import { useOwner } from "../useOwner";
import { useServerSync } from "./useServerSync";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import {
  type BuilderState, type SectionId, EMPTY_BUILDER, migrateBuilder, cvLang,
} from "@/app/lib/builderDoc";
import { EMPTY_LEDGER } from "@/app/lib/aiBudget";
import { findRolePack } from "@/app/lib/rolePacks";
import { type Action, reducer, careerContext } from "./builderState";
import { type UseGenerate, useGenerate } from "./useGenerate";
import { stepFromSlug } from "./steps";
import { useOnline } from "./useOnline";
import { type Lifecycle, mayWrite } from "@/app/lib/lifecycle";

/**
 * The old four-value save indicator, kept as a NARROWING of the lifecycle.
 *
 * Two shells and their tests read it. Deriving it from the one lifecycle value rather than
 * computing it separately is the whole point — two independently computed labels for the same
 * situation is how "Saved" ends up printed beside an unwritten draft.
 */
export type SaveState = "" | "saving" | "saved" | "failed";

interface BuilderContextValue {
  lang: "ar" | "en";
  /** The id in the URL, once resolved against storage. Empty until hydration finishes. */
  resumeId: string;
  /**
   * Whose browser this is, as `resumeStore.ownerKey` computes it. Empty until `/api/auth/me` answers.
   *
   * On the context because sections write personal data of their own — `DesignSection` saves the
   * finished CV text, `ImportPanel` lists previously saved ones — and every one of those keys needs an
   * owner in it. Reaching for `useOwner()` inside each section would mean a second fetch per section
   * and, worse, a moment where two components disagree about who is signed in.
   */
  owner: string;
  state: BuilderState;
  dispatch: React.Dispatch<Action>;
  save: SaveState;
  /** What the builder is actually doing — the full set, of which `save` is a summary. */
  lifecycle: Lifecycle;
  /**
   * Whether the browser currently has a connection.
   *
   * The draft itself does not need one — every write is local — but a suggestion does, and
   * "the assistant is unavailable" is the wrong sentence for a train going through a tunnel. It
   * blames the product for the user's signal and invites another tap that will also fail.
   */
  online: boolean;
  /** Write now, synchronously. Call before any navigation away from a step. */
  flush: () => void;
  /** False until the stored draft has been read, so nothing renders over real work. */
  hydrated: boolean;
  /** The assembled CV text, debounced — the preview and the exports both read this. */
  previewText: string;
  /** The document's DECLARED authoring language — `target.language`, which is not the interface's. */
  cv: "ar" | "en";
  /**
   * The document's ACTUAL script, detected from the confirmed content itself.
   *
   * Usually equals `cv` — but not always: a user can author in Arabic and only afterwards switch
   * `target.language` to English, and nothing here auto-translates on that switch (see
   * `EnglishVersion.tsx`). `docLang` is what tells `shown` below "this text is still Arabic", so a
   * created translation is recognised as the alternate even when it happens to share `cv`'s language
   * code — see `translate.ts`'s `buildTranslationSource` for the detector itself.
   */
  docLang: "ar" | "en";
  /** The language currently being previewed and exported. Equals `cv` unless a version is selected. */
  viewLang: "ar" | "en";
  /** The profile as the active version renders it. Wording swapped, facts identical. */
  shown: BuilderState["profile"];
  progress: number;
  template: (typeof TEMPLATE_CATALOG)[number];
  /** Today, read once per mount: an expiry check that re-reads the clock renders differently for no reason. */
  today: string;
  markDone: (step: SectionId) => void;
  /**
   * The one path to a paid generation, shared by every section.
   *
   * In the context rather than called per section, and that is the point: two sections each
   * calling `useGenerate` would each hold their own idea of the ledger, so the second one to
   * commit would overwrite the first one's count. The blueprint feeds skills, credentials,
   * languages and the review — four readers, one result, one meter.
   */
  gen: UseGenerate;
  /** The five facts that decide what a suggestion says. Nothing personal is in it. */
  career: ReturnType<typeof careerContext>;
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
  lang, children,
}: {
  lang: "ar" | "en";
  children: React.ReactNode;
}) {
  /* Every storage key starts with this. Empty until /api/auth/me answers — see `useOwner`. */
  const owner = useOwner();
  const [state, dispatch] = useReducer(reducer, EMPTY_BUILDER);

  /*
   * Has the USER changed this document since it was hydrated?
   *
   * This used to be answered by object identity against a snapshot of the hydrated state — and
   * identity was the wrong instrument twice over. The snapshot was captured once per MOUNT
   * (`=== null` guard) while the provider deliberately survives resume switches, so every resume
   * after the first could never read "untouched". And SYSTEM dispatches broke it even on the
   * first: the role-pack seed fires on hydration of any pack-titled draft, and the blueprint's
   * auto-generation commits `{t:"ai"}` moments after mount — neither is the user's work, and both
   * made a newer server copy be silently declined for someone who typed nothing (after which the
   * stale local copy could overwrite it — see `useServerSync`'s header).
   *
   * So the question is now answered directly: a flag set by USER-originated dispatches only, reset
   * whenever a (owner, id) pair hydrates. `hydrate`, `seed` and `ai` are the system's actions —
   * hydration itself, the pack seeding the bag, and a generation being cached with its cost.
   */
  const touched = useRef(false);
  /* Set by the two hydrations that bring content storage does not already hold — see the autosave
     gate for why an untouched document is otherwise never written. */
  const mustPersist = useRef(false);
  const dispatchUser = useCallback((a: Action) => {
    if (a.t !== "hydrate" && a.t !== "seed" && a.t !== "ai") touched.current = true;
    dispatch(a);
  }, []);
  /**
   * Everything the one read of storage established, written once.
   *
   * `damaged` is a stored draft that would not parse — it blocks every write, because the autosave
   * would otherwise overwrite the only copy. `migrated` is an older schema brought forward.
   */
  const [boot, setBoot] = useState<{
    id: string; hydrated: boolean; damaged: boolean; migrated: boolean;
    /** The stored record's sync facts, read in the same pass — what the server pull compares against. */
    serverRev: number; dirty: boolean;
  }>({ id: "", hydrated: false, damaged: false, migrated: false, serverRev: 0, dirty: false });
  const resumeId = boot.id;
  const hydrated = boot.hydrated;
  const damagedDraft = boot.damaged;
  const migrated = boot.migrated;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /*
   * The id from the URL, when there is one — read directly here rather than accepted as a prop.
   *
   * It used to BE a prop (`resumeId: urlId`), and nothing ever passed one: `BuilderFrame.tsx` — the
   * only place this component is ever rendered — mounts `<BuilderProvider lang={lang}>` with no
   * `resumeId`, so `urlId` was `undefined` on every single render, forever. The hydration effect
   * below has always correctly re-run "when `urlId` changes" — it just never actually changed,
   * because it was never connected to anything that could change. `BuilderShell.tsx` derives the
   * same value from `usePathname()` for its own "wrong id in the address bar" repair — that
   * mechanism worked precisely because it reads the real URL and this one, silently, did not. Mirrors
   * `BuilderShell`'s own parsing exactly, so the two agree by construction rather than by convention.
   */
  const pathname = usePathname() || "";
  const urlId = useMemo(() => {
    const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const step = parts.length >= 2 ? stepFromSlug(parts[parts.length - 1]) : null;
    return step ? decodeURIComponent(parts[parts.length - 2]) : undefined;
  }, [pathname]);

  /*
   * Hydrate for THIS (owner, resumeId), and re-hydrate when either changes.
   *
   * ── what this used to do, and why it was the bug ──
   *
   * It ran once, keyed on `lang`, and its comment said "Not on `urlId`". So the state came from one
   * shared per-language slot while the id came from the URL: open /builder/rA/target after editing
   * Resume B and you got B's content under A's id, then the autosave wrote B back as A.
   *
   * The old reasoning for ignoring `urlId` was that re-running would "let a mistyped id wipe a live
   * reducer back to the stored copy". That risk is real and it is answered by resetting to an EMPTY
   * form for an id with no record — not by loading a different resume. An unknown id showing a blank
   * builder is correct; an unknown id showing somebody else's CV is not.
   *
   * `urlId` being permanently `undefined` (see above) meant this whole guarantee was dormant: every
   * navigation to a different resume — "Build a new CV" with an existing draft open, "Duplicate →
   * tailor for a job" — wrote the new record correctly, pushed the new URL correctly, and then this
   * effect's guard (`pair` unchanged, since `urlId` never moved) skipped re-running, leaving the OLD
   * resume loaded in memory. `BuilderShell`'s own address-bar repair then rewrote the new URL back to
   * the old id, since the old id was, in fact, what was actually loaded — a correct response to a
   * question this effect should never have left open.
   */
  const started = useRef<string>("");
  useEffect(() => {
    /* One hydration per (owner, id) pair. The guard is a key rather than a boolean because switching
       resumes MUST re-run this, and a boolean is what stopped it. */
    const pair = `${owner}::${urlId || ""}`;
    if (started.current === pair) return;
    started.current = pair;
    if (!owner) return;                 // owner unknown yet — wait rather than read `anon` and swap later
    /* A fresh hydration is a fresh document: nothing has been touched IN it yet, whatever was
       true of the resume loaded before it. */
    touched.current = false;
    mustPersist.current = false;

    /*
     * ══════════════════════════════════════════════════════════════════════════════
     * Anonymous work lasts the visit. Signing in is what saves it.
     * ══════════════════════════════════════════════════════════════════════════════
     *
     * Decided here, before anything is read, because this is the only place a stored draft can
     * become what a visitor sees. `mayRestore` is false for `anon` once the visit has lapsed —
     * and then the old records are removed rather than merely ignored, so nothing can surface
     * later through a path this one does not control.
     *
     * A signed-in account is never affected. That difference IS the offer: your CVs come back
     * because we know whose they are.
     */
    const restorable = mayRestore(owner);
    if (!restorable) endAnonymousVisit();

    /* The shared slot, moved into a real record the first time an owner is seen. Skipped for a
       lapsed anonymous visit — adopting a legacy draft would reinstate exactly what was just
       dropped, by another route. */
    const moved = restorable ? migrateLegacy(owner, lang) : { migrated: false, resumeId: null };

    /*
     * No id in the URL — /builder itself. Resolve to the owner's most recent resume if there is one,
     * otherwise mint a fresh id. This is the ONLY place "most recent" is allowed to mean anything,
     * because there is no requested resume to contradict.
     */
    const wanted = restorable
      ? (urlId || moved.resumeId || listResumes(owner)[0]?.resumeId || newResumeId())
      /* A lapsed visit keeps the id in the URL if there is one — the address is the user's, and
         changing it under them would break Back — but it will find no record behind it. */
      : (urlId || newResumeId());
    const { record, damaged } = restorable
      ? readResume(owner, wanted)
      : { record: null, damaged: false };
    const saved = record?.state ?? null;
    const id = wanted;
    /* Carrying a chat draft forward is only sensible into a resume that does not exist yet. */
    /* The chat draft is anonymous work too, and falls under the same rule. */
    const fromChat = restorable && !saved
      && Boolean(readDraft(lang).profile?.role || readDraft(lang).profile?.name);

    /*
     * A FRESH draft's CV language follows the interface language.
     *
     * `EMPTY_TARGET.language` is "en", and that default was the root of a reported bug: a user on
     * the Arabic interface who never opened the language dropdown got an English CV and English AI
     * suggestions throughout — skills, duties, credentials, summary. Nobody chose that. It was
     * chosen for them by a constant, and the only signal that they wanted Arabic (they were reading
     * Arabic) was being ignored.
     *
     * The interface language is not a perfect proxy — an Arabic speaker may well want an English CV,
     * and plenty do — which is why the dropdown stays and is one tap. But a default has to be
     * SOMETHING, and "the language this person is reading" is a far better guess than "English,
     * always". Applied only to a genuinely new draft, so it can never overwrite a choice already
     * made and stored.
     */
    const fresh: BuilderState = {
      ...EMPTY_BUILDER,
      target: { ...EMPTY_BUILDER.target, language: lang },
    };
    let upgraded = false;

    if (damaged) {
      /*
       * Something is stored and cannot be read. The draft has been copied aside by `readDraft`;
       * what must not happen now is the autosave writing over it 450ms later, which is what used
       * to happen — silently, to the only copy of someone's CV. `mayWrite` holds every write while
       * this state is set, and the header says so instead of claiming "Saved".
       */
      dispatch({ t: "hydrate", state: fresh });
    } else if (saved) {
      /* One migration function, so a schema change is applied in one place rather than at each
         call site that happens to spread a stored object. The state records that it happened — a
         jump from "loading" to "saved" past an upgrade claims none took place. */
      const brought = migrateBuilder(saved);
      upgraded = brought.migrated;
      /* An upgraded record must reach disk in its new shape without waiting for a keystroke —
         otherwise every load re-runs the same migration over the same stale bytes. */
      if (upgraded) mustPersist.current = true;
      dispatch({ t: "hydrate", state: brought.state });
    } else if (fromChat) {
      // A draft started in the chat: carry the confirmed resume across, which is the
      // entire point of the two doors sharing a key. Only `profile` crosses, because
      // only `profile` is confirmed content — the chat has no suggestion bag.
      mustPersist.current = true;   // real content, and nothing in storage holds it yet
      dispatch({ t: "hydrate", state: { ...fresh, profile: readDraft(lang).profile } });
    } else {
      dispatch({ t: "hydrate", state: fresh });
    }
    /* One write, at the end, carrying every fact this read established.
       Three separate `setState` calls for one event is three renders and three chances for the
       screen to show a half-read draft. */
    /*
     * One `setBoot` carrying every fact this read established — three separate calls for one event
     * is three renders and three chances to show a half-read draft.
     *
     * `set-state-in-effect` is disabled here with a reason rather than worked around. The rule is
     * aimed at state derived from other state; this is a LOAD from an external store (localStorage)
     * triggered by a key change, which is the case the rule's own documentation carves out. The
     * codebase's other pattern for reading storage, `useSyncExternalStore`, does not fit: that is for
     * SUBSCRIBING to a value that changes underneath you, and a resume is fetched once per id, not
     * watched.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoot({
      id, hydrated: true, damaged, migrated: upgraded,
      serverRev: record?.serverRevision ?? 0, dirty: record?.dirty ?? false,
    });
    track("builder_started", { lang, surface: "steps" });
  }, [lang, owner, urlId]);

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

  /*
   * The lifecycle, derived — never assigned alongside the thing it describes.
   *
   * Order is the meaning here. `invalidResume` outranks everything because a draft that could not
   * be read is the only state in which writing is FORBIDDEN, and a label saying "Saving…" over a
   * held write would be a lie about the user's data. `saveError` outranks the rest for the same
   * reason: it is the one remaining state where the work is not where the user thinks it is.
   */
  const lifecycle: Lifecycle =
    damagedDraft ? "invalidResume"
    : !hydrated ? (migrated ? "migrating" : "loading")
    : failed ? "saveError"
    : written === null ? "hydrated"
    : written === state ? "saved"
    : "saving";

  /*
   * `flush` is defined before the sync hook and has to reach it, so the push goes through a ref.
   * Reordering instead would mean the sync hook reading `lifecycle`, which is derived from state
   * this block sets — a cycle. One indirection is the smaller cost, and it keeps `flush`'s identity
   * stable, which matters because the `pagehide` listener below depends on it.
   */
  const syncPush = useRef<() => void>(() => {});

  /* Held while `invalidResume`, which is the whole point of having that state: the autosave used
     to overwrite an unparseable draft 450ms after arrival, and that draft was the only copy. */
  /*
   * Failure is read from the RETURN VALUE, not a catch. `writeResume` swallows its own storage
   * errors and answers 0 — it never throws — so the try/catch that used to wrap these calls was
   * dead code: on a full or blocked localStorage the catch never fired, `setWritten` ran anyway,
   * and the header printed "Saved" over a draft that was never written. That made the entire
   * `saveError` lifecycle state — built precisely for this situation — unreachable.
   */
  const flush = useCallback(() => {
    if (!resumeId || !mayWrite(lifecycle)) return;
    /* The same gate the debounced autosave uses. `flush` runs on navigation and `pagehide`, so
       without it merely opening /builder and clicking away still wrote the phantom empty record
       the autosave now refuses. */
    if (!touched.current && !mustPersist.current) return;
    if (writeResume(owner, resumeId, lang, live.current)) {
      setWritten(live.current);
      setFailed(false);
    } else setFailed(true);
    /* After the local write, never instead of it, and deliberately not awaited — `flush` runs
       synchronously before a navigation and on `pagehide`, where a round trip would either block
       the navigation or be cancelled by it. */
    syncPush.current();
  }, [resumeId, lang, lifecycle, owner]);

  /*
   * Hold the anonymous visit open while a builder tab is on screen, so a SECOND tab is not
   * mistaken for a new visit — which used to delete every stored CV. See the lease block in
   * `resumeStore`. Mounted here rather than in the page because this provider is the one thing
   * every builder route shares, and the lease must outlive any single step.
   */
  useEffect(() => keepVisitAlive(), []);

  useEffect(() => {
    if (!hydrated || !resumeId || damagedDraft) return;
    /*
     * Nothing is written until the user has actually touched the document.
     *
     * The autosave was unconditional, so merely LOADING /builder minted an id and saved an empty
     * record 450ms later — and then `BuilderStart` listed it. A visitor who had created nothing
     * was shown "Untitled · 0 of 11 steps done" under "Your CVs here", twice over if they pressed
     * "Build a new CV" and came back. Phantom rows in the one list that is supposed to mean
     * "these are yours".
     *
     * `touched` is false for `hydrate`/`seed`/`ai` (see its declaration), which is exactly right
     * here: an AI seeding suggestions into a draft nobody has typed in is not a document either.
     *
     * `mustPersist` is the carve-out for the two hydrations that DO bring content storage does not
     * already hold — a resume carried across from the chat door, and a stored record upgraded to a
     * newer schema. Those must reach disk without waiting for a keystroke. A plain read of an
     * existing record sets neither flag, so re-opening a CV no longer bumps its revision and
     * reshuffles "most recent" just for having been looked at.
     */
    if (!touched.current && !mustPersist.current) return;
    const id = setTimeout(() => {
      if (writeResume(owner, resumeId, lang, state)) { setWritten(state); setFailed(false); }
      else setFailed(true);
    }, 450);
    return () => clearTimeout(id);
  }, [state, lang, resumeId, hydrated, damagedDraft, owner]);

  /*
   * ── the durable copy ──
   *
   * Local stays the write path; this mirrors it to the account on a slower beat. See
   * `useServerSync` for why that order is not a performance choice — a builder whose autosave
   * depends on a network is a builder that stops saving on a train, and most visitors are
   * anonymous and have no account to mirror to.
   */
  const sync = useServerSync({
    resumeId, lang, state, title: titleOf(state), hydrated,
    /* For `markMirrored`, and the record's own sync facts the pull compares against. */
    owner, localServerRevision: boot.serverRev, localDirty: boot.dirty,
    /* The same gate the local autosave uses: never write over a draft that would not parse. */
    writable: mayWrite(lifecycle),
  });
  useEffect(() => { syncPush.current = sync.push; }, [sync.push]);

  /*
   * Adopt the account's copy — but ONLY if the USER has not changed this document since it
   * hydrated.
   *
   * This is the "I built it on my phone and opened my laptop" case, and it is the one moment the
   * server is allowed to overrule local. `touched` (see its declaration above for why it replaced
   * an object-identity snapshot) answers exactly that question, per hydrated resume, immune to the
   * system's own dispatches. On adoption the revision is adopted WITH the state — `sync.adopt` —
   * and recorded on the local record, so the next session's pull knows this browser has seen it.
   * On decline neither happens: the next mirror then 409s and the disagreement is surfaced,
   * instead of the stale local copy overwriting the newer server one with a passing check.
   */
  useEffect(() => {
    if (!sync.incoming) return;
    if (!touched.current && sync.incoming.state) {
      dispatch({ t: "hydrate", state: sync.incoming.state });
      sync.adopt(sync.incoming.revision);
      markMirrored(owner, resumeId, sync.incoming.revision);
    }
    sync.clearIncoming();
  }, [sync, owner, resumeId]);

  const online = useOnline();

  /* The old four-value indicator, as a narrowing of the one above. */
  const save: SaveState =
    lifecycle === "saveError" || lifecycle === "invalidResume" ? "failed"
    : lifecycle === "saved" ? "saved"
    : lifecycle === "saving" ? "saving"
    : "";

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

  /*
   * And the third way a session leaves: a SOFT navigation out of the builder entirely — the
   * header's brand link, or the "Sign in to keep this CV" link the shell shows every anonymous
   * user. Neither fires `pagehide` (client-side routing never does), and the autosave effect's
   * cleanup only CLEARS its pending timer, so a keystroke followed within 450ms by one of those
   * links was silently dropped — from the exact link that promises to keep the work. An unmount
   * cleanup flushes it. Through a ref, so this effect can register once: `flush`'s identity moves
   * with the lifecycle, and re-registering an unmount hook on every change would make it fire on
   * every re-render's cleanup instead of the real unmount.
   */
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);
  useEffect(() => () => { flushRef.current(); }, []);

  /*
   * Seed the suggestion bag from the cached role pack, as a consequence of the TITLE
   * changing — not as a side effect of rendering one particular step.
   *
   * This is a bug the step routes introduced and the end-to-end run caught. Seeding used to
   * live in `BlueprintBody`'s effect, which was fine while every section was mounted on one
   * long page: whatever order the user worked in, the blueprint had rendered. Split into
   * routes, `BlueprintBody` only mounts at `/builder/<id>/blueprint` — so anyone who went
   * straight from the target job to skills, or jumped there from the navigation, found the
   * skills step empty and the product looking like it knew nothing about their profession.
   *
   * It belongs here because it is a state transition, not a view: the pack is a function of
   * the title, and the title is state. The ref keys on the slug AND the CV language, because
   * switching the document to Arabic has to re-seed — the item TEXT is CV content.
   */
  const seeded = useRef("");
  useEffect(() => {
    if (!hydrated) return;
    const pack = findRolePack(state.target.title);
    /* A title with no pack RESETS the marker rather than leaving it: the reducer's target case
       retires the previous pack's chips on a title change, so returning to the earlier title
       later must be allowed to seed again — a stale marker here would block that forever. */
    if (!pack) { seeded.current = ""; return; }
    const key = `${pack.slug}:${cvLang(state.target)}`;
    if (seeded.current === key) return;
    seeded.current = key;
    dispatch({ t: "seed", pack, ui: lang, cv: cvLang(state.target) });
  }, [hydrated, state.target, lang]);

  /* The preview is expensive: ResumeTemplate re-parses and re-measures on every text
     change, so binding it to raw keystrokes re-lays out an A4 page per letter. */
  const [previewText, setPreviewText] = useState("");
  const cv = cvLang(state.target);
  /* See the `docLang` doc comment on `BuilderContextValue` — the CONTENT's real script, not the
     dropdown's. Depends on the whole `state` (same as `career` below) rather than hand-picking the
     few fields `buildTranslationSource` actually reads — this is a small linear scan, the same order
     of cost `careerContext(state)` already pays on every state change in this file. */
  const docLang: "ar" | "en" = useMemo(
    () => buildTranslationSource(state, "en").sourceLanguage,
    [state],
  );

  /*
   * Which version the preview and the exports render.
   *
   * `activeVersion` is a VIEW setting: it swaps wording and cannot touch a fact, because
   * `applyVersionToProfile` reads a map of strings keyed by source item id and there is nowhere in
   * that map for an employer or a date to hide. When it names the authoring language — or names
   * nothing, or names a version that does not exist — the document renders as itself.
   *
   * The direction follows the VERSION, not the CV's authoring language. An English version of an
   * Arabic CV is left-to-right, and getting that wrong produces a document that is correct and
   * unreadable.
   */
  /*
   * Which language was ASKED for. Compared against `docLang`, not `cv`: `cv` is the declared
   * target, and an Arabic-authored document with `target.language` flipped to English shares a
   * language code with its own translation — `docLang` is what the content actually is.
   */
  const requested: "ar" | "en" = state.activeVersion === "en" ? "en"
    : state.activeVersion === "ar" ? "ar"
    : cv;
  /*
   * A stored version renders ONLY while it is FRESH.
   *
   * Translation item ids are positional (`${roleId}.b${index}`) on both sides — built by index,
   * applied by index. Delete bullet 0 and the stored map's `b0` lands on the SURVIVOR: the
   * preview and both exports were showing the translation of a bullet the user had deleted,
   * every later bullet one translation off, and the last one's translation orphaned. The
   * freshness machinery (`translationFresh`/`staleSections`, hash-per-section) existed for
   * exactly this and was consulted only by the notice in `EnglishVersion` — never by the render
   * path. Gated here, a stale version falls back to the source document (with the existing
   * stale notice explaining, and one tap re-translating only the sections that moved), which is
   * honest — where showing deleted content on an exported CV is not.
   */
  const version = requested === docLang ? null : (state.versions?.[requested] ?? null);
  const versionFresh = useMemo(
    () => Boolean(version && translationFresh(version, buildTranslationSource(state, requested))),
    [version, state, requested],
  );
  /* What is ACTUALLY rendered — the direction and the export format follow this, so a stale
     fallback to the Arabic source is also rendered (and exported) AS Arabic. */
  const viewLang: "ar" | "en" = version && versionFresh ? requested : docLang;
  const shown = useMemo(
    () => (version && versionFresh ? applyVersionToProfile(state.profile, version) : state.profile),
    [state.profile, version, versionFresh],
  );
  const resumeRtl = viewLang === "ar";
  useEffect(() => {
    const id = setTimeout(() => setPreviewText(assembleResume(shown, resumeRtl)), 250);
    return () => clearTimeout(id);
  }, [shown, resumeRtl]);

  const template = useMemo(
    () => TEMPLATE_CATALOG.find((x) => x.slug === state.template) ?? TEMPLATE_CATALOG[0],
    [state.template],
  );
  const progress = useMemo(() => computeProgress(state.profile), [state.profile]);

  const career = useMemo(() => careerContext(state), [state]);
  const commitAi = useCallback(
    (next: { store: Parameters<typeof reducer>[0]["generations"]; ledger: BuilderState["ledger"] }) => {
      dispatch({ t: "ai", store: next.store ?? {}, ledger: next.ledger ?? { ...EMPTY_LEDGER } });
    },
    [],
  );
  const gen = useGenerate({
    lang,
    context: career,
    store: state.generations,
    ledger: state.ledger,
    revision: state.revision ?? 0,
    /* The identity a reply is checked against, and what an in-flight request is abandoned on. This
       provider is not remounted when the resume changes, so the hook has no other way to know. */
    resumeId,
    owner,
    onCommit: commitAi,
  });

  const markDone = useCallback((step: SectionId) => {
    dispatchUser({ t: "done", section: step });
    track("builder_section_completed", { section: step });
  }, [dispatchUser]);

  /* The sections receive the WRAPPED dispatch, so every action they fire counts as the user's —
     which is what keeps the `touched` flag honest without any section knowing it exists. */
  const value = useMemo<BuilderContextValue>(() => ({
    lang, resumeId, owner, state, dispatch: dispatchUser, save, lifecycle, online, flush, hydrated,
    previewText, cv, docLang, viewLang, shown, progress, template, today, markDone, gen, career,
  }), [lang, resumeId, owner, state, dispatchUser, save, lifecycle, online, flush, hydrated, previewText, cv, docLang, viewLang, shown, progress, template, today, markDone, gen, career]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
