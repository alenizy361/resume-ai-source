"use client";

/**
 * "Suggest with AI" — one control, one set of states, wherever a section offers a list.
 *
 * The audit's #9/#10: three sections had a loading state and an error state of their own
 * design, and two sections — credentials and languages — had no AI at all, so they could
 * not show a state because they never had one. Both halves of that are the same problem,
 * which is that there was no shared way to offer a suggestion.
 *
 * This is it. It renders the button, the lifecycle line, and the results as chips nothing
 * has accepted yet. What it deliberately does NOT do is write: `onPick` hands the text back
 * to the section, which decides what a "credential" or a "language" made of that text is.
 * A component that could write into the document would be a second path into `profile`,
 * and the whole no-fabrication guarantee rests on there being exactly one.
 *
 * The empty state is not decoration. A model that returns nothing usable for an unusual job
 * title is the normal case, not a failure, and saying "nothing to add here" is what stops a
 * user waiting for a second attempt that will also return nothing.
 *
 * ── the waiting state, which was one line of grey text ──
 *
 * Reported as the worst thing in the product: "there is no sense that the AI is working". The
 * request takes three to eight seconds and the only sign was the word "Writing…". So the button
 * looked broken and got pressed again — and `useAiTask` is single-flight, so the second press
 * CANCELS the first and the wait starts over. The absent feedback was not merely cosmetic; it was
 * making the thing it failed to describe take longer.
 *
 * Three signals now, and each says something the others cannot:
 *
 *   the orb pulses faster   — the control you pressed is the thing that is busy
 *   a ring leaves the button — it is still busy NOW, this second, not merely once
 *   ghost chips hold the space — an answer is expected HERE, and roughly this much of it
 *
 * The ghosts are the one that stops the layout jumping: the real chips land in the space the
 * ghosts were already occupying, so the page does not grow under the reader's thumb when the
 * reply arrives.
 */

import { type TaskName, type TaskInput } from "@/app/lib/aiTasks";
import { useAiTask } from "./useAiTask";
import BrandOrb from "../BrandOrb";

const C = {
  en: { ask: "Suggest with AI", again: "Suggest more", stop: "Stop", unchecked: "Nothing is added until you tap it." },
  ar: { ask: "اقترح بالذكاء", again: "اقترح المزيد", stop: "أوقف", unchecked: "لا يُضاف شيء قبل أن تنقره." },
};

export default function AiStrip({
  lang, task, input, onPick, note,
}: {
  lang: "ar" | "en";
  task: TaskName;
  /** Rebuilt by the caller on each render; the hook only reads it when asked to run. */
  input: TaskInput;
  onPick: (text: string) => void;
  /** Extra sentence under the chips, when the section has something specific to say. */
  note?: string;
}) {
  const c = C[lang];
  const ai = useAiTask(lang);
  const items: string[] = ai.state === "success" && Array.isArray(ai.data)
    ? (ai.data as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  return (
    <div className="mt-3">
      <button
        onClick={ai.busy ? ai.cancel : () => void ai.run(task, input)}
        className={`t-tap flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold${ai.busy ? " t-busy" : ""}`}
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        {/* The orb was already built to say this — `is-busy` speeds its pulse and lifts its glow —
            and the one call site that most needed it was not passing the prop. */}
        <BrandOrb variant="button" size={16} busy={ai.busy} />
        {ai.busy ? c.stop : items.length ? c.again : c.ask}
      </button>

      {/* One line for every non-success state, worded by the hook. Amber for a throttle
          because a rate limit is not a failure; faint for empty because nothing is wrong. */}
      {ai.message && (
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: ai.state === "loading" ? "var(--muted)" : ai.throttled ? "#fcd34d" : ai.state === "empty" ? "var(--faint)" : "#fca5a5" }}
        >
          {ai.message}
        </p>
      )}

      {/*
        The shape of the answer, before the answer. Five, because five is about what these tasks
        return and the point is to reserve roughly the right amount of room, not to promise an
        exact count. `aria-hidden` — the status line above already says "Writing…", and a screen
        reader announcing five empty boxes is noise, not information.
      */}
      {ai.busy && (
        <div className="bd-chips mt-3" aria-hidden>
          {[92, 128, 74, 150, 106].map((w, i) => (
            <span key={i} className="t-ghost" style={{ width: w, height: 36 }} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* `t-stagger` is on the container, so the chips arrive in reading order about 60ms
              apart — the difference between the screen changing and the system answering. */}
          <div className="bd-chips t-stagger t-materialize mt-3">
            {items.map((text) => (
              <button key={text} className="bd-chip t-tap" onClick={() => onPick(text)}>+ {text}</button>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{note || c.unchecked}</p>
        </>
      )}
    </div>
  );
}
