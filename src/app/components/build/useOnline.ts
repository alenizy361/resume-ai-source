"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser currently has a connection.
 *
 * ── why the builder cares at all ──
 *
 * The draft does not need a connection: every write is `localStorage`, so a user on a train keeps
 * typing and keeps their work. A SUGGESTION does. The two are different promises, and the product
 * was making only one of them — a failed request said "the assistant is unavailable", which blames
 * the product for the user's signal and invites another tap that will also fail.
 *
 * ── the two rules this follows ──
 *
 * It reads `navigator.onLine` once on mount and then only reacts to the browser's own events.
 * Reading it during render would make an offline render depend on when React happened to run, and
 * polling it would spend a timer on a value the platform already pushes.
 *
 * It starts `true`. The first paint of a page is not the moment to tell someone they are
 * disconnected, and on the server there is no `navigator` at all — an initial `false` would make
 * the server and the client disagree on the first render, which is a hydration mismatch on every
 * single load.
 *
 * Nothing BLOCKS on this. `navigator.onLine` is famously optimistic — a captive portal reports
 * online, a VPN handover reports offline for a second — so it may only change what the user is
 * TOLD, never what they are allowed to do.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
