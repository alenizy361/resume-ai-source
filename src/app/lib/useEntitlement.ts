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

export function useEntitlement(): { entitlement: Entitlement; loading: boolean } {
  const [state, setState] = useState<{ entitlement: Entitlement; loading: boolean }>({
    entitlement: NO_ACCESS,
    loading: true,
  });

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (live) setState({ entitlement: entitlementFrom(d), loading: false }); })
      // A failed check must not hand out paid features. `entitlementFrom` of nothing is
      // NO_ACCESS, so this is the same answer the server would give a stranger.
      .catch(() => { if (live) setState({ entitlement: NO_ACCESS, loading: false }); });
    return () => { live = false; };
  }, []);

  return state;
}
