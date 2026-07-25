"use client";

/**
 * The client's one read of what this visitor may do.
 *
 * Five components were each fetching `/api/auth/me` and drawing their own conclusion —
 * five requests on a page that needs one answer, and five chances to disagree about it.
 * This does the fetch once per mount and hands back an `Entitlement`, which the pure
 * predicates in `entitlement.ts` then interpret.
 *
 * `loading` matters and is exposed rather than hidden: a component that renders a
 * "download without watermark" button before the answer arrives has promised something
 * it may have to take back. While loading, the entitlement is NO_ACCESS — fail closed —
 * so a slow network shows a watermark that then disappears, never the reverse.
 */

import { useEffect, useState } from "react";
import { type Entitlement, NO_ACCESS, entitlementFrom } from "./entitlement";
import { hashOf } from "./aiCache";

/**
 * A stable, device-local id for the signed-in person — never their address.
 *
 * A resume is stored in this browser and the privacy pledge keeps it there, so the only question
 * an id has to answer is "is this saved CV mine, or the last person's on this shared laptop?".
 * A hash answers that; the address itself would put a real identifier in `localStorage` beside the
 * CV for no additional benefit.
 */
export function userIdFrom(email?: string): string {
  const e = String(email ?? "").trim().toLowerCase();
  return e ? `u${hashOf(e)}` : "";
}

export function useEntitlement(): { entitlement: Entitlement; loading: boolean; userId: string } {
  const [state, setState] = useState<{ entitlement: Entitlement; loading: boolean; userId: string }>({
    entitlement: NO_ACCESS,
    loading: true,
    userId: "",
  });

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (live) setState({ entitlement: entitlementFrom(d), loading: false, userId: userIdFrom(d?.email) });
      })
      // A failed check must not hand out paid features. `entitlementFrom` of nothing is
      // NO_ACCESS, so this is the same answer the server would give a stranger.
      .catch(() => { if (live) setState({ entitlement: NO_ACCESS, loading: false, userId: "" }); });
    return () => { live = false; };
  }, []);

  return state;
}
