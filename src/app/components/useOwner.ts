"use client";

import { useEffect, useRef, useState } from "react";
import { forgetOwner, ownerKey } from "@/app/lib/resumeStore";
import { forgetPersonal, migrateUnowned } from "@/app/lib/personalStore";

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
 * Returns `""` until that answer arrives, and `BuilderProvider` waits on it. That pause is
 * deliberate: the alternative is reading `anon`, rendering it, then swapping to the account's data a
 * moment later — a visible flash of the wrong CV, and a race where the autosave writes the anonymous
 * draft into the account's key.
 *
 * ── sign-out ──
 *
 * When the owner changes from a signed-in account to `anon`, that account's records are removed from
 * this browser. They are a recovery draft, not the only copy — `/api/resumes` holds the saved CV —
 * and leaving them behind is how the next person to use the laptop reads them.
 */
export function useOwner(): string {
  const [owner, setOwner] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { signedIn?: boolean; email?: string }) => {
        if (!alive) return;
        setOwner(ownerKey(d?.signedIn ? d?.email : null));
      })
      .catch(() => {
        /*
         * The request failed — offline, or the endpoint is down. `anon` is the safe answer: it can
         * never expose one account's draft to another, and the worst case is that a signed-in user
         * on a flaky connection writes into the anonymous keyspace and sees their draft again when
         * the connection returns and the owner resolves. Guessing the account instead would risk the
         * opposite, and the opposite is a data leak.
         */
        if (alive) setOwner("anon");
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
    if (!owner || migrated.current === owner) return;
    migrated.current = owner;
    migrateUnowned(owner);
  }, [owner]);

  return owner;
}
