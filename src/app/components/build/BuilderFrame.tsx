"use client";

/**
 * Provider + chrome, in one client boundary the layout can render.
 *
 * `app/builder/layout.tsx` is a server component — it owns the route's metadata — so it
 * cannot itself hold the reducer. This is the single "use client" wrapper it mounts, and
 * mounting it from the LAYOUT rather than from each page is the whole mechanism: Next
 * keeps a layout mounted while its children change, so the builder's state outlives every
 * step navigation without being serialised through storage.
 */

import BuilderProvider from "./BuilderProvider";
import BuilderShell from "./BuilderShell";
import "../../build.css";

export default function BuilderFrame({
  lang, children,
}: {
  lang: "ar" | "en";
  children: React.ReactNode;
}) {
  return (
    <BuilderProvider lang={lang}>
      <BuilderShell lang={lang}>{children}</BuilderShell>
    </BuilderProvider>
  );
}
