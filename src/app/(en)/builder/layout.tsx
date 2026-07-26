import BuilderFrame from "@/app/components/build/BuilderFrame";

/**
 * The builder's layout — and the reason the step routes can exist at all.
 *
 * `BuilderFrame` holds the reducer. Because it is mounted here rather than inside each
 * page, navigating from `/builder/r1/target` to `/builder/r1/personal` swaps the child
 * and leaves the state alone. Move this one line into a page and the builder loses the
 * user's work on every Continue.
 */
export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return <BuilderFrame lang="en">{children}</BuilderFrame>;
}
