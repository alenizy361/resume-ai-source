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
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        <BrandOrb variant="button" size={16} />
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

      {items.length > 0 && (
        <>
          <div className="bd-chips mt-3">
            {items.map((text) => (
              <button key={text} className="bd-chip" onClick={() => onPick(text)}>+ {text}</button>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{note || c.unchecked}</p>
        </>
      )}
    </div>
  );
}
