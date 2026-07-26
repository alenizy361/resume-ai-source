"use client";

/**
 * One suggestion, with the three things a person needs to decide about it.
 *
 * ── what was missing ──
 *
 * A chip was a button: tap to add, and nothing else. That is fine while every suggestion is obviously
 * right and wrong ones are ignored — but "ignored" is not a decision the product can see. A user who
 * scrolled past ten irrelevant skills and the same user who found ten good ones look identical in the
 * data, so nothing can tell whether the suggestions are working, and "Suggest more" has no idea what
 * it already got wrong.
 *
 * Three controls, each earning its place:
 *
 *   ADD      — what the chip always did.
 *   WHY      — a suggestion that cannot say where it came from is asking to be trusted on nothing.
 *              The provenance is already carried on every `Item` (`source`, `reason`); it was simply
 *              never shown, and a `title` tooltip is not shown at all on a phone.
 *   REJECT   — an explicit no. It removes the chip AND records the decision, so "Suggest more" does
 *              not re-offer it and the acceptance rate becomes measurable rather than inferred.
 *
 * ── why it takes strings and not an `Item` ──
 *
 * Half the chip surfaces in this builder have an `Item` behind them (skills) and half have a bare
 * string (the blueprint slices, the role-pack credential offers). A component that demanded an `Item`
 * would have left the string half with the old one-button chip, which is how the product ended up
 * with two visual grammars for the same gesture. The caller passes what it has; `why` is optional and
 * `onReject` is optional, and a chip with neither renders exactly as before.
 *
 * ── why reject is not just "hide" ──
 *
 * `rejectItem` keeps the item with `status: "rejected"` rather than deleting it, and `filterFresh`
 * reads that list. A deleted suggestion comes back on the next generation, which reads to the user as
 * the tool not listening. It also makes the rejection rate — the number that says whether the
 * suggestions are any good — unrecoverable. Callers that cannot persist a rejection pass no
 * `onReject` at all rather than offering one that forgets.
 */

import { useState } from "react";
import type { ItemSource } from "@/app/lib/builderDoc";
import { WHY_LABEL, whySentence } from "@/app/lib/provenance";

export default function SuggestionChip({
  text, lang, source, reason, suffix, showWhy = true, onAdd, onReject,
}: {
  text: string;
  lang: "ar" | "en";
  source?: ItemSource;
  /** The item's own explanation, when it has one. Falls back to the source sentence. */
  reason?: string;
  /**
   * Whether this chip carries its own "why".
   *
   * Sections pass `false` when every chip in the group would say the same sentence — the section
   * then states it once, above them. See `sharedWhy` in `lib/provenance.ts`: twenty-five buttons
   * opening one identical fact is not provenance, it is noise, and it was visible on a phone.
   */
  showWhy?: boolean;
  /** Small trailing note inside the add button — a credential's kind, a language's script. */
  suffix?: React.ReactNode;
  onAdd: () => void;
  /** Omitted where a rejection could not be remembered. See the header. */
  onReject?: () => void;
}) {
  const c = WHY_LABEL[lang];
  const [openWhy, setOpenWhy] = useState(false);
  /*
   * ── where the acknowledgement went, and why it is not here ──
   *
   * This chip used to carry it: tap, set a flag, animate. It never ran once. `onAdd()` removes the
   * chip from the suggestion list in the SAME commit that adds the class, so the class landed on a
   * node that was already gone. Measured rather than reasoned about — add a class and remove the
   * element in one task and the browser fires no `animationstart`; keep the element and it does.
   *
   * The comment that used to sit here said that was "the correct outcome — the item moved, which is
   * feedback of its own". That was not analysis, it was a rationalisation of a failure, and the
   * failure is exactly what was reported: nothing happens, so people tap again.
   *
   * Delaying the removal to let it play would delay the real action and let a fast double-tap add
   * twice. So the acknowledgement is on the row that ARRIVES — a newly mounted node, which animates
   * by construction with nothing to race. See `.t-land` and `useJustArrived`.
   *
   * What stays here is the press itself: `t-tap` on the button, which fires on touch-down, before any
   * state changes, and cannot be outrun by an unmount.
   */
  const why = whySentence(lang, source, reason);

  return (
    <span className="bd-chip-group">
      {/* The controls live INSIDE the pill, the way a confirmed skill's remove already does. Two
          circles floating beside every chip read as separate objects and cost a row each on a
          390px screen — a phone screenshot is what settled it. */}
      <span className="bd-chip">
        <button
          type="button"
          className="bd-chip-add t-tap"
          onClick={onAdd}
        >
          + {text}
          {suffix}
        </button>

        {/* Small and quiet, deliberately: the primary action is adding, and a chip with three
            equally loud buttons is a decision three times over. */}
        {showWhy && (
          <button
            type="button"
            className="bd-chip-aux t-tap"
            onClick={() => setOpenWhy((v) => !v)}
            aria-expanded={openWhy}
            aria-label={`${c.why} ${text}`}
            title={c.why}
          >
            ?
          </button>
        )}
        {onReject && (
          <button
            type="button"
            className="bd-chip-aux t-tap"
            onClick={onReject}
            aria-label={`${c.reject}: ${text}`}
            title={c.reject}
          >
            ✕
          </button>
        )}
      </span>

      {/* Opened in place rather than as a tooltip: a `title` attribute does not exist on a phone,
          which is where most of this builder is used. */}
      {showWhy && openWhy && <span className="bd-chip-why" role="note">{why}</span>}
    </span>
  );
}
