"use client";

/**
 * The one path from a section to a paid generation.
 *
 * `useAiTask` is the per-field version and stays: it owns a single request's lifecycle — timeout,
 * retry, cancel, and a sentence for each state. This is the layer above it, and it exists because
 * every rule that saves money is a rule about whether to call AT ALL, which `useAiTask` never
 * asks. It fires whatever it is told to fire, every time.
 *
 * Five gates, in the order that fails cheapest:
 *
 *   1. THE RESUME'S OWN CACHE. A revisited stage renders what it already has. This is the gate
 *      that matters most in practice, because navigation is the most common thing a user does and
 *      it used to offer a fresh paid call every time.
 *   2. THE BUDGET. An automatic generation stops earlier than an explicit tap, because only the
 *      automatic kind can loop.
 *   3. DE-DUPLICATION. Two components asking the same question at the same moment cost one
 *      request — and only the one that caused it records it.
 *   4. THE STAMP. A reply is written only if the resume has not moved underneath it.
 *   5. THE SERVER. Which has its own shared pack cache above the model.
 *
 * ── why the ledger and the store live in the reducer ──
 *
 * Both could have been refs in this hook, and both would then be per-mount: a refresh would
 * forget what was generated and what was spent, and two tabs on one draft would each think they
 * were the only one. They are resume state, so they are in `BuilderState` and they persist with
 * everything else.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  type CareerContext, type GenerationStore,
  contextHash, hashOf, readCache, writeCache, acceptReply, dedupe, newRequestId,
  PROMPT_VERSION,
} from "@/app/lib/aiCache";
import {
  type ResumeLedger, EMPTY_LEDGER, mayCall, record, recordHit,
} from "@/app/lib/aiBudget";
import { type AiTaskType, TASK_TIMEOUT_MS } from "@/app/lib/aiModels";

/** Tasks this hook can ask for. The per-field refinements stay on `useAiTask`. */
export type GenTask = "role_blueprint" | "experience_package" | "final_content" | "jd_delta";

export type GenState = "idle" | "loading" | "ready" | "empty" | "error" | "refused" | "cancelled";

export interface GenOutcome {
  state: GenState;
  data?: Record<string, unknown>;
  /** Where the answer came from — the number the whole optimisation is judged on. */
  source?: "resume-cache" | "shared-inflight" | "generated";
  /** The server's own words, when it gave any. Never an internal code. */
  message?: string;
  /** Set when a budget ceiling refused the call rather than the provider failing it. */
  refusal?: "disabled" | "auto-stop" | "hard-stop";
}

const MSG = {
  en: {
    unavailable: "Suggestions are temporarily unavailable. You can continue manually or try again.",
    /* A ceiling is not a fault and must not be worded like one — the honest sentence says the
       form works and does not invite another tap that will also be refused. */
    "auto-stop": "That is enough automatic suggesting for this resume. Use the buttons when you want more.",
    "hard-stop": "This resume has used its suggestion allowance. Keep filling it in by hand — every field works without the AI.",
    disabled: "AI suggestions are switched off right now. The form works without them.",
  },
  ar: {
    unavailable: "الاقتراحات غير متاحة الآن. أكمل يدوياً أو جرّب مرة أخرى.",
    "auto-stop": "هذا كافٍ من الاقتراح التلقائي لهذه السيرة. استخدم الأزرار إن أردت المزيد.",
    "hard-stop": "استُنفد رصيد الاقتراحات لهذه السيرة. واصل التعبئة بيدك — كل حقل يعمل بدون الذكاء.",
    disabled: "الاقتراحات مطفأة حالياً. النموذج يعمل بدونها.",
  },
};

export interface GenRequest {
  task: GenTask;
  /**
   * WHICH one, for a task that has more than one per resume — an experience id, an advert hash.
   * Empty for the blueprint and the final pass, which have exactly one each.
   */
  instance?: string;
  /** The task's own inputs. Hashed to decide whether a cached answer is still current. */
  input: Record<string, unknown>;
  /** The request body's task-specific fields. */
  payload: Record<string, unknown>;
  /** `auto` is the one blueprint fired on confirming a target. Everything else is a tap. */
  trigger?: "auto" | "explicit";
}

export interface UseGenerate {
  state: GenState;
  busy: boolean;
  /** Which task the current state belongs to, for a section with more than one button. */
  task: GenTask | null;
  message: string;
  run: (req: GenRequest) => Promise<GenOutcome>;
  /** Read without calling. What a section renders on mount — never a request. */
  peek: (task: GenTask, input: Record<string, unknown>, instance?: string) => Record<string, unknown> | null;
  cancel: () => void;
  /** The resume's spend so far, for the "this may use a request" affordance. */
  ledger: ResumeLedger;
  /** True once the resume is near its ceiling, so a button can say so before it is tapped. */
  warn: boolean;
}

export function useGenerate(opts: {
  lang: "ar" | "en";
  context: Partial<CareerContext>;
  store: GenerationStore | undefined;
  ledger: ResumeLedger | undefined;
  revision: number;
  /** Persist both, in one dispatch — they change together and must not diverge. */
  onCommit: (next: { store: GenerationStore; ledger: ResumeLedger }) => void;
}): UseGenerate {
  const { lang, context, store, ledger: rawLedger, revision, onCommit } = opts;
  const ledger = rawLedger ?? EMPTY_LEDGER;
  const [res, setRes] = useState<GenOutcome>({ state: "idle" });
  const [task, setTask] = useState<GenTask | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const cHash = useMemo(() => contextHash(context), [context]);

  const peek = useCallback((t: GenTask, input: Record<string, unknown>, instance?: string) => {
    const hit = readCache<Record<string, unknown>>(store, t, cHash, hashOf(input), instance);
    return hit ? hit.result : null;
  }, [store, cHash]);

  const cancel = useCallback(() => {
    inflight.current?.abort();
    inflight.current = null;
    setRes({ state: "cancelled" });
  }, []);

  const run = useCallback(async (req: GenRequest): Promise<GenOutcome> => {
    const { task: t, instance = "", input, payload, trigger = "explicit" } = req;
    const inputHash = hashOf(input);
    setTask(t);

    /* ── 1. the resume's own cache ── */
    const cached = readCache<Record<string, unknown>>(store, t, cHash, inputHash, instance);
    if (cached) {
      const out: GenOutcome = { state: "ready", data: cached.result, source: "resume-cache" };
      setRes(out);
      onCommit({ store: store ?? {}, ledger: recordHit(ledger) });
      return out;
    }

    /* ── 2. the budget ── */
    const verdict = mayCall(ledger, trigger);
    if (!verdict.allow) {
      const out: GenOutcome = { state: "refused", refusal: verdict.reason, message: MSG[lang][verdict.reason] };
      setRes(out);
      return out;
    }

    setRes({ state: "loading" });
    /* Single-flight within this component, on top of cross-component de-duplication. */
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;

    const stamp = { requestId: newRequestId(), task: t, contextHash: cHash, inputHash, revision };

    /* ── 3. de-duplication across components ── */
    let leader = false;
    let body: Record<string, unknown> | null = null;
    let httpError: { status: number; message: string } | null = null;

    try {
      const shared = await dedupe(t, inputHash, async () => {
        const r = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({ task: t, context, ...payload }),
        });
        const json = await r.json().catch(() => ({}));
        return { ok: r.ok, status: r.status, json } as {
          ok: boolean; status: number; json: Record<string, unknown>;
        };
      });
      leader = shared.leader;
      if (shared.result.ok) body = shared.result.json;
      else httpError = {
        status: shared.result.status,
        message: typeof shared.result.json.error === "string" ? shared.result.json.error : MSG[lang].unavailable,
      };
    } catch {
      /*
       * An abort here is the user's decision and produces no error message — there is nothing for
       * them to read about a thing they stopped. Anything else is a network fault.
       */
      if (ctrl.signal.aborted) { const out: GenOutcome = { state: "cancelled" }; setRes(out); return out; }
      httpError = { status: 0, message: MSG[lang].unavailable };
    } finally {
      if (inflight.current === ctrl) inflight.current = null;
    }

    if (httpError) {
      /*
       * A failure must not erase what is already on screen. The store is committed unchanged, so
       * a section that had suggestions from an earlier generation still has them — Part 20's rule,
       * and the reason `invalidate` marks rather than deletes.
       */
      const out: GenOutcome = { state: "error", message: httpError.message };
      setRes(out);
      if (leader) onCommit({ store: store ?? {}, ledger: record(ledger, { paid: true, outcome: "error" }) });
      return out;
    }

    /* ── 4. the stamp ── */
    if (!acceptReply(stamp, { contextHash: cHash, inputHash, revision })) {
      /*
       * The reply is for a resume that no longer exists in this shape. Dropped silently: the user
       * has already moved on and telling them a request they never saw was discarded is noise.
       * The COST is still recorded, because the provider was still paid.
       */
      if (leader) onCommit({ store: store ?? {}, ledger: record(ledger, { paid: true, outcome: "success", usd: usdOf(body) }) });
      const out: GenOutcome = { state: "idle" };
      setRes(out);
      return out;
    }

    const data = body ?? {};
    const usable = Object.keys(data).some((k) => !k.startsWith("_"));
    if (!usable) {
      const out: GenOutcome = { state: "empty" };
      setRes(out);
      if (leader) onCommit({ store: store ?? {}, ledger: record(ledger, { paid: true, outcome: "empty", usd: usdOf(body) }) });
      return out;
    }

    const source: GenOutcome["source"] = leader ? "generated" : "shared-inflight";
    const out: GenOutcome = { state: "ready", data, source };
    setRes(out);

    /* ── 5. commit: only the leader writes, exactly once ── */
    if (leader) {
      const meta = (data._meta ?? {}) as Record<string, unknown>;
      const wasCacheHit = Boolean((data._cache as { hit?: boolean } | undefined)?.hit);
      onCommit({
        store: writeCache(store, {
          task: t, contextHash: cHash, instance, inputHash,
          promptVersion: PROMPT_VERSION,
          model: typeof meta.model === "string" ? meta.model : "",
          result: data, userConfirmed: [], userRejected: [], createdAt: Date.now(),
        }),
        ledger: wasCacheHit
          /* The server served it from the shared pack: a call that did not happen. */
          ? recordHit(ledger)
          : record(ledger, {
            paid: true, outcome: "success", usd: usdOf(body),
            escalation: typeof meta.reason === "string" ? meta.reason : null,
          }),
      });
    }
    return out;
  }, [store, ledger, cHash, revision, context, lang, onCommit]);

  return {
    state: res.state,
    busy: res.state === "loading",
    task,
    message: res.message ?? "",
    run, peek, cancel,
    ledger,
    warn: mayCall(ledger, "explicit").allow === true && (mayCall(ledger, "explicit") as { warn: boolean }).warn,
  };
}

/** The server's own estimate, not one recomputed here — it saw the real usage block. */
function usdOf(body: Record<string, unknown> | null): number {
  const meta = (body?._meta ?? {}) as Record<string, unknown>;
  const v = Number(meta.estimatedUsd);
  return Number.isFinite(v) ? v : 0;
}

/** Every generate task's wall-clock ceiling, re-exported so a section can show a hint. */
export const GEN_TIMEOUT_MS: Record<GenTask, number> = {
  role_blueprint: TASK_TIMEOUT_MS.role_blueprint,
  experience_package: TASK_TIMEOUT_MS.experience_package,
  final_content: TASK_TIMEOUT_MS.final_content,
  jd_delta: TASK_TIMEOUT_MS.jd_delta,
} as Record<GenTask, number> satisfies Record<GenTask, number>;

export type { AiTaskType };
