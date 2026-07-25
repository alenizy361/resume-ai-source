/**
 * Feature flags.
 *
 * The form-first builder replaces the interface a live product currently earns
 * money through, so it ships dark and is turned on deliberately. The rule this
 * file exists to keep: **rollback must not require a deploy.** A flag that can
 * only be changed by shipping code is a comment, not a flag.
 *
 * Resolution order, first match wins:
 *   1. `?builder=form` / `?builder=chat` in the URL — how a tester switches, and
 *      how support can reproduce a user's exact experience from a link.
 *   2. `localStorage.ra_flag_builder` — sticky once chosen, so a tester is not
 *      thrown back to the old flow on the next navigation.
 *   3. `NEXT_PUBLIC_BUILDER_DEFAULT` — the rollout dial. Unset means chat.
 *
 * Everything here must work during server rendering, where there is no window and
 * no localStorage, so every branch has to tolerate their absence.
 */

export type BuilderMode = "chat" | "form";

const STORAGE_KEY = "ra_flag_builder";

function fromEnv(): BuilderMode {
  return process.env.NEXT_PUBLIC_BUILDER_DEFAULT === "form" ? "form" : "chat";
}

function isMode(v: string | null | undefined): v is BuilderMode {
  return v === "chat" || v === "form";
}

/**
 * Which builder this visitor gets.
 *
 * Returns the env default on the server so the first paint matches what the
 * client will resolve to for everyone who has not opted in — a mismatch here
 * would be a hydration error on the product's most important page.
 */
export function builderMode(search?: string): BuilderMode {
  if (typeof window === "undefined") return fromEnv();

  const qs = new URLSearchParams(search ?? window.location.search);
  const asked = qs.get("builder");
  if (isMode(asked)) {
    // An explicit choice sticks, so navigating inside the app keeps it.
    try { window.localStorage.setItem(STORAGE_KEY, asked); } catch { /* private mode */ }
    return asked;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isMode(saved)) return saved;
  } catch { /* localStorage can throw before it can be read */ }

  return fromEnv();
}

/**
 * The choice this VISITOR made, or null if they have not made one.
 *
 * Deliberately without the env fallback that `builderMode` applies. The homepage uses
 * this to honour a door someone explicitly picked while leaving everyone else exactly
 * where they were — a rollout dial and a user's own preference are different questions,
 * and answering them with one function is how a flag ends up moving people who never
 * asked to be moved.
 */
export function storedBuilderMode(search?: string): BuilderMode | null {
  if (typeof window === "undefined") return null;

  const qs = new URLSearchParams(search ?? window.location.search);
  const asked = qs.get("builder");
  if (isMode(asked)) {
    try { window.localStorage.setItem(STORAGE_KEY, asked); } catch { /* private mode */ }
    return asked;
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isMode(saved)) return saved;
  } catch { /* localStorage can throw before it can be read */ }
  return null;
}

/** Let the user switch doors from the UI, and remember it. */
export function setBuilderMode(mode: BuilderMode): void {
  try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* noop */ }
}

/** Forget the choice, falling back to whatever the rollout dial says. */
export function clearBuilderMode(): void {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
