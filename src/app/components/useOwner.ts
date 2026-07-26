"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { adoptAnonymousResumes, forgetOwner, hasOwnedRecords, ownerKey } from "@/app/lib/resumeStore";
import { adoptAnonymous, forgetPersonal, migrateUnowned } from "@/app/lib/personalStore";

/**
 * Who owns the drafts in this browser right now.
 *
 * ── why this is a hook and not a constant ──
 *
 * Every storage key in `resumeStore` starts with an owner, and getting the owner wrong is the same
 * class of bug as getting the resumeId wrong: the second account on a shared laptop would open the
 * first account's CV. So the owner has to be KNOWN before anything is read, and it is only knowable
 * by asking the server who the session belongs to.
 *
 * ── and why it does not always wait for the server ──
 *
 * This used to return `""` until the round-trip completed, always. `BuilderProvider` will not hydrate
 * without an owner and `BuilderStep` renders a skeleton until it has, so that fetch sat in front of
 * the first form field: every visitor, every load, three grey bars until the network answered. It is
 * visible in the deployment's own HTML — the body of a step page is the skeleton and nothing else.
 *
 * The wait only buys something when there is something to get wrong. What it guards against is
 * showing one account's CV to another, and that requires a signed-in account's record to already be
 * in this browser. When none is, `anon` is not a guess — it is the only possible answer, and local
 * storage can say so with no network at all.
 *
 * So the answer is read from storage first and confirmed by the server after. Where a record does
 * exist, the old behaviour stands: wait, because correctness outranks speed.
 *
 * ── sign-out ──
 *
 * When the owner changes from a signed-in account to `anon`, that account's records are removed from
 * this browser. They are a recovery draft, not the only copy — `/api/resumes` holds the saved CV —
 * and leaving them behind is how the next person to use the laptop reads them.
 */
/* `useSyncExternalStore` requires stable function identities, so these live outside the hook. */
const NO_SUBSCRIBE = () => () => {};
const clientGuess = (): string => (hasOwnedRecords() ? "" : "anon");
const serverGuess = (): string => "";

export function useOwner(): string {
  /**
   * What local storage alone can prove, read through `useSyncExternalStore`.
   *
   * This is precisely the API's purpose: an external, non-React source with a different answer on the
   * server than on the client. It gives `""` during the prerender and the real answer on the client's
   * FIRST render — no extra render, no `setState` inside an effect, and no hydration mismatch, all of
   * which the obvious alternatives cost.
   *
   * `subscribe` is a no-op because this value cannot change without a page load: a record belonging to
   * a signed-in account can only appear after that account has been resolved, which is the very thing
   * being waited for.
   */
  const local = useSyncExternalStore(NO_SUBSCRIBE, clientGuess, serverGuess);

  /** The server's answer. `""` until it arrives — and it is allowed to disagree with the guess. */
  const [confirmed, setConfirmed] = useState("");
  /**
   * Whether the server has answered, as STATE rather than a ref — and the difference is a bug that
   * nearly shipped here. When the guess already said `anon` and the server then confirms `anon`,
   * `setConfirmed` receives an identical value, React bails out, and nothing re-renders. Held in a
   * ref, the adoption effect below would never run again, so the pre-scoping data of every anonymous
   * visitor — which is most visitors — would never be adopted at all.
   */
  const [settled, setSettled] = useState(false);

  const owner = confirmed || local;

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { signedIn?: boolean; email?: string }) => {
        if (!alive) return;
        setSettled(true);
        /* Often the same value the guess already produced, in which case React bails out and nothing
           re-renders. When it differs the owner key changes and `BuilderProvider` re-hydrates under
           the real account — the correct outcome, and the reason its guard is keyed on `(owner, id)`
           rather than on a boolean. */
        setConfirmed(ownerKey(d?.signedIn ? d?.email : null));
      })
      .catch(() => {
        /*
         * The request failed — offline, or the endpoint is down. `anon` is the safe answer: it can
         * never expose one account's draft to another, and the worst case is that a signed-in user
         * on a flaky connection writes into the anonymous keyspace and sees their draft again when
         * the connection returns and the owner resolves. Guessing the account instead would risk the
         * opposite, and the opposite is a data leak.
         */
        if (alive) { setSettled(true); setConfirmed("anon"); }
      });
    return () => { alive = false; };
  }, []);

  /*
   * Clear a departed account's drafts.
   *
   * Keyed on the TRANSITION rather than run on mount: `forgetOwner("anon")` on every load would
   * delete the anonymous draft of every visitor who is not signed in, which is most of them.
   *
   * The previous owner is a ref, not state. It is a fact about the last run of this effect and
   * nothing renders from it, so putting it in state would only buy a second render per sign-in —
   * which is what `react-hooks/set-state-in-effect` was pointing at, correctly.
   */
  const previous = useRef("");
  useEffect(() => {
    if (!owner) return;
    const before = previous.current;
    /*
     * ── signing IN: the anonymous work becomes this account's ──
     *
     * The transition `anon` → a real account is the payment flow's normal path, not an edge case:
     * checkout does not require an account, and `/api/pay/verify` signs the buyer in afterwards so
     * their access follows them to another device. Before this, that switch orphaned everything
     * they had done — the CV in the builder, the optimiser draft, the saved texts, the scan history,
     * the job list — because every key is `${base}:${owner}` and nothing moved `:anon` across.
     *
     * The buyer saw "payment received" on a screen whose data had just become unreachable.
     *
     * Neither adoption overwrites: where the account already holds a value, the account's own wins.
     * A returning customer's saved CVs are theirs, and anonymous work done in this browser
     * beforehand is a contribution, not a replacement.
     */
    if (before === "anon" && owner !== "anon") {
      adoptAnonymousResumes(owner);
      adoptAnonymous(owner);
    }
    if (before && before !== owner && before !== "anon") {
      forgetOwner(before);
      /*
       * The other seven stores, which sign-out used to leave behind entirely: the saved CVs' full
       * text, the scan history, the job tracker, the optimiser draft, and — worst of the set — the
       * publish tokens, which are capabilities and would have let the next person take the departed
       * account's public CV offline.
       */
      forgetPersonal(before);
    }
    previous.current = owner;
  }, [owner]);

  /*
   * Adopt the pre-scoping values into this owner's keyspace, once.
   *
   * Runs for `anon` too, and deliberately: most visitors are anonymous, and the whole existing store
   * of a person who never signed in belongs under `anon` rather than being stranded. `migrateUnowned`
   * never overwrites and retires rather than deletes, so a second run is a no-op and nothing is lost
   * if this attribution turns out to be the wrong one.
   */
  const migrated = useRef("");
  useEffect(() => {
    /*
     * Gated on `settled`, not merely on `owner`. Adoption attributes the pre-scoping data to whoever
     * is signed in, and the fast path can supply an owner before anyone has said who that is — so
     * running here on the optimistic value would file a returning account's saved CVs under `anon`.
     * Rendering may proceed on a guess; ownership may not.
     */
    if (!owner || !settled || migrated.current === owner) return;
    migrated.current = owner;
    migrateUnowned(owner);
  }, [owner, settled]);

  return owner;
}
