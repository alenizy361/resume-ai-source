import BuilderFrame from "@/app/components/build/BuilderFrame";

/**
 * The Arabic builder's layout.
 *
 * Identical in purpose to the English one: it mounts the reducer, so state survives every
 * step navigation. Two files rather than one because the language is a route fact here,
 * not a runtime one — `/ar/builder` has to render Arabic on the first byte, and reading a
 * cookie or a header to decide would make the first paint a guess.
 */
export default function ArabicBuilderLayout({ children }: { children: React.ReactNode }) {
  return <BuilderFrame lang="ar">{children}</BuilderFrame>;
}
