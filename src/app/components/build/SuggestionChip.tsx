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
   * ── the product's core gesture, which had no feedback ──
   *
   * Tapping a suggested skill or duty to accept it is THE interaction in this builder; everything else
   * is typing. Until now the chip simply vanished from the list, and on a phone — where the finger
   * covers the chip — it was easy to be unsure the tap had landed at all.
   *
   * So the chip acknowledges itself for one frame before the parent removes it. Purely visual: `onAdd`
   * still fires immediately, so nothing is delayed and a fast double-tap cannot lose an item. If the
   * parent unmounts the chip first the animation never runs, which is the correct outcome — the item
   * moved, which is feedback of its own.
   */
  const [accepted, setAccepted] = useState(false);
  const why = whySentence(lang, source, reason);

  return (
    <span className="bd-chip-group">
      {/* The controls live INSIDE the pill, the way a confirmed skill's remove already does. Two
          circles floating beside every chip read as separate objects and cost a row each on a
          390px screen — a phone screenshot is what settled it. */}
      <span className={`bd-chip${accepted ? " t-accept" : ""}`}>
        <button
          type="button"
          className="bd-chip-add t-tap"
          onClick={() => { setAccepted(true); onAdd(); }}
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
