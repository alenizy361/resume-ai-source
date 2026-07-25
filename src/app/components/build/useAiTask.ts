"use client";

/**
 * One hook, one lifecycle, every section.
 *
 * `runTask` owns the policy; this owns the three things a component additionally needs and
 * that the five hand-rolled versions each got differently right:
 *
 *  1. **Single-flight.** Asking again while a request is open cancels the first. Without
 *     this, a double tap produces two calls and the slower one wins — so the user sees the
 *     OLDER answer replace the newer one, which looks like the button undoing itself.
 *  2. **Abort on unmount.** A step route unmounts when the user presses Continue, and a
 *     reply that lands afterwards would set state on a dead component. Today that is a
 *     warning; with the step routes it would be one per navigation.
 *  3. **A sentence for each state, in the reader's language.** Including the two that were
 *     always missing: `empty` ("nothing to add here") and `throttled` ("you have asked a
 *     lot in the last few minutes — keep typing"). A throttle worded as a failure invites
 *     another click, which is the worst available response to a rate limit.
 *
 * `data` is deliberately `unknown`. The task registry knows each task's output shape and
 * the caller knows which task it asked for; a generic parameter here would only be a cast
 * written in a different place.
 *
 * The task name is an argument to `run`, not to the hook. That is not a stylistic choice:
 * the experience section runs FOUR tasks — draft duties, improve one, shorten one, ask for
 * a figure — and shows one status line, because the user did one thing at a time. Binding
 * the name at mount would mean four hooks and four states to merge, and merging them means
 * deciding which of four messages to show, which is the bug this file exists to remove.
 * `task` reports which one the current state belongs to, for a component with several
 * buttons that each need their own spinner.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type TaskName, type TaskResult, type TaskState, type TaskInput, runTask,
} from "@/app/lib/aiTasks";

const MSG = {
  en: {
    loading: "Writing…",
    empty: "Nothing to add here — what you have already covers it.",
    error: "The assistant is unavailable. Keep typing — every field works without it.",
    timeout: "That took too long. Keep typing — every field works without it.",
    throttled: "You have asked for a lot of suggestions in the last few minutes. Keep filling this in by hand — the form works with the AI switched off — and try again shortly.",
    /** The validators return machine reasons; these are the human ones. */
    reasons: {
      "no-target-role": "Add the job title first, so a suggestion has something to be about.",
      "no-current-text": "Write the line first — this improves what you wrote rather than replacing it.",
      "no-role": "Add the position and employer, and suggestions appear here.",
      "nothing-to-work-from": "Fill in the role first so there is something to work from.",
      "no-question": "Type your question first.",
      "not-a-url": "That does not look like a link.",
      "no-file": "Choose a file first.",
      "cv-too-short": "There is not enough of a CV here to score yet.",
      // Every internal code needs a sentence, or it reaches the screen as itself. That is
      // not hypothetical: a 500 with an empty body printed "http-500" to a jobseeker.
      timeout: "That took too long. Keep typing — every field works without it.",
      network: "The connection dropped. Keep typing — every field works without it.",
    } as Record<string, string>,
  },
  ar: {
    loading: "يكتب…",
    empty: "لا شيء يُضاف هنا — ما لديك يغطي الأمر.",
    error: "المساعد غير متاح. واصل الكتابة — كل حقل يعمل بدونه.",
    timeout: "استغرق وقتاً أطول من اللازم. واصل الكتابة — كل حقل يعمل بدونه.",
    throttled: "طلبت اقتراحات كثيرة في الدقائق الماضية. واصل التعبئة بيدك — النموذج يعمل والذكاء مطفأ — وجرّب بعد قليل.",
    reasons: {
      "no-target-role": "اكتب المسمى الوظيفي أولاً ليكون للاقتراح موضوع.",
      "no-current-text": "اكتب السطر أولاً — هذا يحسّن ما كتبته ولا يستبدله.",
      "no-role": "أضف المسمى وجهة العمل، وتظهر الاقتراحات هنا.",
      "nothing-to-work-from": "اكتب المسمى الوظيفي أولاً ليكون هناك ما نبني عليه.",
      "no-question": "اكتب سؤالك أولاً.",
      "not-a-url": "لا يبدو هذا رابطاً.",
      "no-file": "اختر ملفاً أولاً.",
      "cv-too-short": "لا توجد سيرة كافية للتقييم بعد.",
      timeout: "استغرق وقتاً أطول من اللازم. واصل الكتابة — كل حقل يعمل بدونه.",
      network: "انقطع الاتصال. واصل الكتابة — كل حقل يعمل بدونه.",
    } as Record<string, string>,
  },
};

export interface AiTask {
  state: TaskState;
  data: unknown;
  /** Which task the current state describes, or null while idle. */
  task: TaskName | null;
  /** Ready to render, in the reader's language. Empty string when there is nothing to say. */
  message: string;
  busy: boolean;
  throttled: boolean;
  run: (name: TaskName, input: TaskInput) => Promise<TaskResult<unknown>>;
  cancel: () => void;
  /** Back to idle — for closing a panel without leaving its last error behind. */
  reset: () => void;
}

export function useAiTask(lang: "ar" | "en"): AiTask {
  const [res, setRes] = useState<TaskResult<unknown>>({ state: "idle" });
  const [task, setTask] = useState<TaskName | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // The reply to a request nobody is waiting for is not worth receiving.
      inflight.current?.abort();
    };
  }, []);

  const run = useCallback(async (name: TaskName, input: TaskInput) => {
    // Single-flight: the newest request is the one the user meant.
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setTask(name);
    setRes({ state: "loading" });

    const out = await runTask(name, input, { signal: ctrl.signal });

    // Two guards, and they are different: `alive` is unmount, `ctrl` is superseded. A
    // superseded request must not overwrite the newer one's result.
    if (alive.current && inflight.current === ctrl) setRes(out);
    if (inflight.current === ctrl) inflight.current = null;
    return out;
  }, []);

  const cancel = useCallback(() => {
    inflight.current?.abort();
    inflight.current = null;
    if (alive.current) setRes({ state: "cancelled" });
  }, []);

  const reset = useCallback(() => {
    inflight.current?.abort();
    inflight.current = null;
    if (alive.current) setRes({ state: "idle" });
  }, []);

  const m = MSG[lang];
  const message =
    res.state === "loading" ? m.loading
    : res.state === "empty" ? m.empty
    : res.throttled ? (res.error || m.throttled)
    : res.state === "error"
      /*
       * Order matters, and this order is the fix for showing "http-500" to a user.
       *
       * A known code becomes a sentence about what to do. Failing that, the SERVER's own
       * words — it knew more about the failure than we do. Failing that, the generic line.
       * `res.code` is never a fallback: an unmapped code falls through to real prose rather
       * than being printed.
       */
      ? (m.reasons[res.code ?? ""] ?? res.error ?? m.error)
      : "";

  return {
    state: res.state,
    data: res.data,
    task,
    message,
    busy: res.state === "loading",
    throttled: res.throttled === true,
    run, cancel, reset,
  };
}
