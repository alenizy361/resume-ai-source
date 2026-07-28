"use client";

/**
 * Push the builder's document to the account, and adopt the account's copy when it is ahead.
 *
 * ── what this changes about the product ──
 *
 * Until now the CV a person spends twenty minutes on existed in one place: the localStorage of the
 * browser they built it in. `resumeStore.ts` says so in its own header — browser storage is a
 * RECOVERY DRAFT, and server persistence "is a separate, larger piece of work". Clearing site data,
 * switching phones, or an iOS eviction under storage pressure took the document permanently.
 *
 * This is the client half of closing that. `/api/resume` is the server half.
 *
 * ── the ordering rule, which is the only subtle thing here ──
 *
 * Local stays FIRST. Every keystroke still lands in localStorage on the existing 450 ms debounce,
 * unchanged, and the server is written afterwards on a slower beat. That order is deliberate and it
 * is not a performance choice:
 *
 *   · a network write can fail, and a builder whose autosave depends on a network is a builder that
 *     stops saving on a train;
 *   · most visitors are anonymous and have no account to write to, so the local path has to be the
 *     complete one rather than the fallback;
 *   · and the failure the user actually reported historically was losing work, so the copy that
 *     cannot fail is the one that must be authoritative while they type.
 *
 * The server is therefore a DURABLE MIRROR, not the write path. It is what survives the browser.
 *
 * ── when the server may win, stated precisely ──
 *
 * The header used to SAY "if the account's copy has a higher revision than the local record" and
 * the code compared nothing: any server copy was offered, and an untouched session adopted it —
 * including a copy OLDER than local edits whose final mirror had failed. The comparison is now
 * real, and it needs its own clock: the local `revision` is a per-write counter unrelated to the
 * server's, so the record carries `serverRevision` — the account revision this browser last agreed
 * with, written by `markMirrored` on every confirmed mirror and every adoption.
 *
 *   server == serverRevision   → nothing new. Base future mirrors here; local edits push cleanly.
 *   server >  serverRevision, local clean → the phone-then-laptop case. Offered for adoption.
 *   server >  serverRevision, local dirty → BOTH moved. Conflict, surfaced, nothing adopted.
 *
 * And the offered revision is adopted ONLY when the state is adopted. Adopting it on the offer —
 * which is what `setRevision` on the pull used to do — armed the next mirror with the server's own
 * revision, so a DECLINED offer was followed by the stale local document overwriting the newer
 * server copy with a passing conflict check. A declined offer now leaves `revision` at 0, the next
 * mirror 409s, and the disagreement is surfaced instead of resolved silently.
 *
 * ── conflicts are surfaced, never resolved silently ──
 *
 * A PUT states the revision it is based on. A 409 means another device saved in between. This hook
 * does NOT merge — merging two CVs without asking produces a document neither device wrote, and the
 * duplicate lines would look like the AI inventing things. It stops mirroring, reports `conflict`,
 * and the local draft continues to hold the user's work intact.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderState } from "@/app/lib/builderDoc";
import { markMirrored } from "@/app/lib/resumeStore";

/**
 * Where the document currently lives, as a fact rather than a promise.
 *
 * `device` is not an error and must never be rendered as one: it is the correct and expected state
 * for every anonymous visitor, and for everybody if the store is not configured.
 */
export type SyncState =
  /** Not mirroring — anonymous, or no server store configured. Local only, which is fine. */
  | "device"
  /** Mirrored to the account, up to date. */
  | "account"
  /** A write is in flight. */
  | "syncing"
  /** Another device saved in between. The local draft is intact; nothing has been overwritten. */
  | "conflict"
  /** The last mirror attempt failed. Local is intact; it will be retried on the next change. */
  | "error";

export interface ServerSync {
  status: SyncState;
  /** The revision the server last confirmed, or 0. Sent as `baseRevision` on the next write. */
  revision: number;
  /**
   * A document the server had that was AHEAD of this browser's, offered once on mount.
   *
   * Returned rather than applied, because only the provider knows whether hydration has finished
   * and applying a state into a reducer is its job, not this hook's.
   */
  incoming: { state: BuilderState; revision: number } | null;
  /** Acknowledge `incoming` — called by the provider once it has adopted or declined it. */
  clearIncoming: () => void;
  /**
   * The provider ADOPTED `incoming`: base future mirrors on its revision. Never called on decline —
   * a declined offer must 409 rather than overwrite, which is why the pull does not do this itself.
   */
  adopt: (revision: number) => void;
  /** Mirror now, outside the debounce. Used by `flush` before navigation. */
  push: () => void;
}

/** Slower than the local 450 ms: this is a durable mirror, not the write path. */
const MIRROR_MS = 2500;

export function useServerSync(args: {
  resumeId: string;
  lang: "ar" | "en";
  state: BuilderState;
  title: string;
  /** For `markMirrored` — acknowledging a confirmed mirror on the local record. */
  owner: string;
  /**
   * The local record's own sync facts, read at hydration: the account revision it last agreed
   * with, and whether it holds edits the server has not confirmed. What the pull compares against.
   */
  localServerRevision: number;
  localDirty: boolean;
  /** Nothing is read or written before the local draft has been read. */
  hydrated: boolean;
  /** Held for the same reason the local autosave is: never write over a draft that would not parse. */
  writable: boolean;
}): ServerSync {
  const { resumeId, lang, state, title, owner, localServerRevision, localDirty, hydrated, writable } = args;

  const [status, setStatus] = useState<SyncState>("device");
  const [revision, setRevision] = useState(0);
  const [incoming, setIncoming] = useState<ServerSync["incoming"]>(null);

  /* The live document, so the mirror and `push` always send the newest one rather than whichever
     one was current when their closure was made. Same device the local autosave uses. */
  const live = useRef(state);
  useEffect(() => { live.current = state; }, [state]);

  const rev = useRef(0);
  useEffect(() => { rev.current = revision; }, [revision]);

  /* What was last successfully mirrored. Identity, not deep equality — the reducer produces a new
     object for any change, so this is exact and free. */
  const mirrored = useRef<BuilderState | null>(null);

  /* Whether the account is reachable at all. `null` until asked. */
  const [enabled, setEnabled] = useState<boolean | null>(null);

  /* ── 1. ask once who we are and what the account holds ────────────────────────────── */
  const pulled = useRef("");
  useEffect(() => {
    if (!hydrated || !resumeId || pulled.current === resumeId) return;
    pulled.current = resumeId;
    /* A fresh resume starts its sync life from zero — the previous resume's revision, mirror
       marker and conflict state must not leak into this one's. */
    setRevision(0);
    rev.current = 0;
    mirrored.current = null;
    setIncoming(null);
    let alive = true;

    fetch(`/api/resume?id=${encodeURIComponent(resumeId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; configured?: boolean; signedIn?: boolean; resume?: { state: BuilderState; revision: number } | null }) => {
        if (!alive) return;
        const on = Boolean(d?.configured && d?.signedIn);
        setEnabled(on);
        if (!on) { setStatus("device"); return; }
        const serverRev = Number(d?.resume?.revision) || 0;
        if (serverRev > 0 && d?.resume) {
          if (serverRev > localServerRevision) {
            if (localDirty && localServerRevision > 0) {
              /*
               * Both sides moved: the server is past what this browser last agreed with, AND the
               * local record holds edits no mirror confirmed. Adopting either way silently loses
               * the other, so nothing is adopted and nothing is mirrored — the same terminal
               * conflict a 409 produces, reached one request earlier. (`localServerRevision > 0`
               * because a record that never met the server is not "both moved" — it is the
               * ordinary first-adoption case, decided by the untouched guard.)
               */
              setStatus("conflict");
              return;
            }
            /*
             * Offered, not applied — and the revision is NOT adopted here. It travels with the
             * offer and lands via `adopt()` only if the provider applies the state. Offered only
             * on the FIRST resolution for this resumeId (the ref above), because adopting a server
             * copy after the user has begun typing would delete what they just wrote.
             */
            setIncoming({ state: d.resume.state, revision: serverRev });
          } else {
            /* Nothing new on the server. Base future mirrors on its revision so local edits —
               including ones from a session whose final mirror failed — push cleanly on top. */
            setRevision(serverRev);
          }
        }
        setStatus("account");
      })
      .catch(() => {
        if (!alive) return;
        /*
         * A failed probe is `device`, not `error`. Nothing has been lost and nothing was attempted;
         * the local draft holds the document exactly as it always has. Showing an error here would
         * put a warning in front of every user whose first request happened to drop.
         */
        setEnabled(false);
        setStatus("device");
      });

    return () => { alive = false; };
  }, [hydrated, resumeId, localServerRevision, localDirty]);

  /* ── 2. mirror ────────────────────────────────────────────────────────────────────── */
  const send = useCallback(async (doc: BuilderState, keepalive = false) => {
    if (!enabled || !resumeId || !writable) return;
    setStatus("syncing");
    try {
      const r = await fetch("/api/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, lang, state: doc, baseRevision: rev.current, title }),
        /*
         * Set only for the flush-before-navigation push: a plain fetch is aborted when the page
         * unloads, which made "type, close the tab" routinely leave the server one session behind
         * — the exact staleness the pull then had to arbitrate. `keepalive` lets the final PUT
         * outlive the page. Not set for ordinary mirrors, which have a page under them and should
         * not spend the browser's small keepalive quota.
         */
        keepalive,
      });
      const d = await r.json().catch(() => null);
      if (r.status === 409) {
        /* Deliberately terminal for this session. The alternative — adopt and retry — would
           overwrite whichever device saved second, which is the outcome the revision exists to
           prevent. The local draft is untouched, so nothing is lost by stopping. */
        setStatus("conflict");
        return;
      }
      if (!r.ok || !d?.ok) { setStatus("error"); return; }
      mirrored.current = doc;
      const confirmed = Number(d.revision) || rev.current + 1;
      setRevision(confirmed);
      /* The local record now agrees with the account as of `confirmed` — which is what the next
         session's pull compares against. `clean` only if nothing was typed while the PUT flew. */
      markMirrored(owner, resumeId, confirmed, { clean: live.current === doc });
      setStatus("account");
    } catch {
      /* Offline, most likely. Local already holds it; the next change retries. */
      setStatus("error");
    }
  }, [enabled, resumeId, lang, title, writable, owner]);

  useEffect(() => {
    if (!enabled || !hydrated || !writable) return;
    if (mirrored.current === state) return;
    if (status === "conflict") return;
    const id = setTimeout(() => { void send(live.current); }, MIRROR_MS);
    return () => clearTimeout(id);
  }, [state, enabled, hydrated, writable, send, status]);

  /*
   * `push` is deliberately fire-and-forget.
   *
   * Its caller is `flush`, which runs synchronously before a navigation and on `pagehide`. Awaiting
   * a network round trip there would either block the navigation or be cancelled by it. The local
   * write in the same `flush` is the one that must not be lost, and it is synchronous — the PUT
   * itself rides `keepalive` so an unload cannot abort it.
   */
  const push = useCallback(() => {
    if (!enabled || !writable || status === "conflict") return;
    if (mirrored.current === live.current) return;
    void send(live.current, true);
  }, [enabled, writable, status, send]);

  const clearIncoming = useCallback(() => setIncoming(null), []);
  const adopt = useCallback((r: number) => { setRevision(r); rev.current = r; }, []);

  return { status, revision, incoming, clearIncoming, adopt, push };
}
