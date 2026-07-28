"use client";

/**
 * "Use the CV you already made here" — one strip, five pages.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACES
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Interview prep, the live mock interview, the LinkedIn optimiser and both resume
 * optimisers each opened on an empty textarea labelled "paste your resume". A user who
 * had just finished a CV in this product was asked to produce it again from somewhere
 * else. `lib/myCvs.ts` explains why that mattered; this is the surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * IT OFFERS, IT NEVER FILLS BY ITSELF
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Nothing here writes into a field until the user taps a CV. That is deliberate and it is
 * the lesson from the complaint that produced the visit rule — "the cache still shows my
 * previous entries" — where storage silently repopulating a form read as the product
 * remembering something it had not been asked to remember. An offer the user accepts is
 * the same convenience without the ambiguity, and on a shared device it is the difference
 * between a suggestion and a disclosure.
 *
 * For the same reason the strip names what it filled afterwards, and how to undo it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY IT RENDERS NOTHING WHEN THERE IS NOTHING
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * A first-time visitor is the majority of traffic on these pages — they arrive from search,
 * not from the builder. An empty "your saved CVs" box would be dead furniture above the one
 * field they actually need, so the component returns `null` and those pages look exactly as
 * they did. It also means the strip's presence is itself information: it appears only for
 * someone who genuinely has a CV here.
 */

import { useEffect, useState } from "react";
import { useOwner } from "@/app/components/useOwner";
import { type MyCv, listMyCvs } from "@/app/lib/myCvs";

const C = {
  en: {
    title: "Use a CV you already made here",
    sub: "No need to paste it again — pick one and we will fill the form.",
    filled: (t: string) => `Filled from “${t}”. Edit anything below before you continue.`,
    another: "Use a different CV",
    today: "today",
    days: (n: number) => `${n} day${n === 1 ? "" : "s"} ago`,
  },
  ar: {
    title: "استخدم سيرة أنشأتها هنا",
    sub: "لا حاجة لِلصقها مرة أخرى — اختر واحدة وسنملأ النموذج.",
    filled: (t: string) => `تم التعبئة من «${t}». عدّل ما تريد بالأسفل قبل المتابعة.`,
    another: "استخدم سيرة أخرى",
    today: "اليوم",
    days: (n: number) => `قبل ${n} ${n === 1 ? "يوم" : "أيام"}`,
  },
};

/** How long ago, in the two words that are actually useful. Exact dates are noise here. */
function when(ts: number, c: typeof C.en, now: number): string {
  if (!ts) return "";
  const days = Math.floor((now - ts) / 86_400_000);
  if (days <= 0) return c.today;
  if (days <= 30) return c.days(days);
  return new Date(ts).toISOString().slice(0, 10);
}

export default function MyCvPicker({
  ar, onPick,
}: {
  /** The INTERFACE language. Each CV carries its own, and the two are not the same thing. */
  ar: boolean;
  /**
   * Hands the whole entry over. The page decides which of its fields to fill, because only
   * the page knows whether its job-advert box is already occupied by something the user typed.
   */
  onPick: (cv: MyCv) => void;
}) {
  const c = ar ? C.ar : C.en;
  const owner = useOwner();
  const [cvs, setCvs] = useState<MyCv[]>([]);
  const [picked, setPicked] = useState<MyCv | null>(null);
  /*
   * Pinned at mount rather than read per row. `Date.now()` during render is a value that differs
   * between the server pass and the client's, and "today" flipping to "1 day ago" mid-session is
   * not worth a re-render — but a hydration mismatch on a date string is a real one.
   */
  const [now, setNow] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    /*
     * `""` means the session is still unresolved, and `listMyCvs` answers `[]` for it. Waiting is
     * the correct behaviour and not merely the safe one: offering a list before anyone has said
     * whose browser this is, is how one account's CV appears on another's screen.
     */
    if (!owner) return;
    setNow(Date.now());
    try { setCvs(listMyCvs(owner)); } catch { setCvs([]); }
  }, [owner]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!cvs.length) return null;

  if (picked) {
    return (
      <div className="mb-4 rounded-xl px-4 py-3 text-xs"
        style={{ background: "rgba(110,231,183,0.08)", border: "1px solid rgba(110,231,183,0.28)", color: "#6ee7b7" }}>
        <div>{c.filled(picked.title)}</div>
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="mt-2 rounded-full px-3 py-1 text-[11px] font-semibold t-tap"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
        >
          {c.another}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
      <div className="text-sm font-bold">{c.title}</div>
      <p className="mb-3 mt-1 text-xs" style={{ color: "var(--muted)" }}>{c.sub}</p>
      <div className="flex flex-col gap-2">
        {cvs.map((cv) => (
          <button
            key={cv.key}
            type="button"
            onClick={() => { setPicked(cv); onPick(cv); }}
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start t-tap"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
          >
            <span className="min-w-0 flex-1">
              {/* `dir="auto"` because the title comes from the CV, which may be in either script
                  whatever the interface is set to. */}
              <span className="block truncate text-xs font-semibold" dir="auto">{cv.title}</span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--faint)" }}>
                {cv.lang === "ar" ? "AR" : "EN"}
                {when(cv.updatedAt, c, now) && ` · ${when(cv.updatedAt, c, now)}`}
              </span>
            </span>
            <span aria-hidden style={{ color: "var(--accent-deep)" }}>{ar ? "←" : "→"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
