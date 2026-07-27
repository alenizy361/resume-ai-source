"use client";

/**
 * A click-driven expand/collapse — a real interaction, not a scroll decoration, so a
 * `max-height` transition here is not the class of animation `transitions.css` bans (that ban is
 * about JS tied to SCROLL: an `IntersectionObserver` or a scroll-timeline running on every frame
 * of every scroll gesture, main-thread work inside the window INP measures. A tap that opens one
 * row is a normal, bounded event handler — exactly what React is for.
 */

import { useState } from "react";

export interface FaqEntry { q: string; a: string }

export default function FaqAccordion({ items }: { items: FaqEntry[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="faq">
      {items.map((it, i) => (
        <div key={it.q} className={`faq-item${open === i ? " open" : ""}`}>
          <button
            type="button"
            className="faq-q"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? -1 : i)}
          >
            <span>{it.q}</span>
            <span className="plus" aria-hidden>+</span>
          </button>
          <div className="faq-a"><p>{it.a}</p></div>
        </div>
      ))}
    </div>
  );
}
