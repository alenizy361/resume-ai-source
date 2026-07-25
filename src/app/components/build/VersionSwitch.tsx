"use client";

/**
 * العربية / English — switch which version the preview and the downloads show.
 *
 * Renders nothing until a second version exists, which is the common case: a user who never asks for
 * a translation never sees a control for one. A switcher with a single option is a control that
 * teaches people to ignore controls.
 *
 * ── what switching does and does not do ──
 *
 * It changes `activeVersion`, which the provider reads to pick which strings to render and which
 * direction to render them in. It cannot change a fact: `applyVersionToProfile` swaps wording keyed
 * by source item id, and the item map has nowhere to put an employer or a date.
 *
 * It makes no request, ever. Switching to a version that exists is a render; switching to one that
 * does not is impossible, because this component only shows versions that are stored. That is the
 * brief's rule — "switching versions must not trigger an unnecessary AI request" — expressed as
 * there being no code path that could.
 */

import { useBuilder } from "./BuilderProvider";

const LABEL: Record<string, string> = { ar: "العربية", en: "English" };

export default function VersionSwitch() {
  const { state, dispatch, cv, viewLang } = useBuilder();

  /*
   * The authoring language first, always. It is the document; the others are renderings of it, and
   * listing them in storage order would put a translation before the original on some CVs and not
   * others.
   */
  const available = [cv, ...Object.keys(state.versions ?? {}).filter((l) => l !== cv)];
  if (available.length < 2) return null;

  return (
    <div className="mb-3 flex gap-2" role="group" aria-label="CV version">
      {available.map((l) => {
        const on = l === viewLang;
        return (
          <button
            key={l}
            onClick={() => dispatch({ t: "viewVersion", lang: l })}
            aria-pressed={on}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={on
              ? { background: "var(--accent)", color: "#fff" }
              : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}
          >
            {LABEL[l] ?? l}
            {/* The original is named as such. Without it, a user looking at two tabs has no way to
                know which one their edits go into. */}
            {l === cv && <span className="ms-1 opacity-60">·</span>}
          </button>
        );
      })}
    </div>
  );
}
