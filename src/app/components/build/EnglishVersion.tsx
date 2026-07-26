"use client";

/**
 * "Create English version" — optional, explicit, and never destructive.
 *
 * ── the three rules the UI has to make visible ──
 *
 * OPTIONAL. Nothing here fires on a refresh, a template change, a preview or an export. One button,
 * pressed on purpose. An Arabic CV that is never translated makes zero translation requests, which is
 * asserted in `ops/translate.test.mjs` and is the normal case.
 *
 * NON-DESTRUCTIVE. The Arabic version is the document. The English one is a set of translated strings
 * keyed to the same confirmed facts, stored beside it. There is no path here that writes into
 * `profile`, which is the same guarantee the suggestion chips have and for the same reason.
 *
 * REVIEWED. The result is shown next to its source before it is anything. A translation the user has
 * not read is a document making claims on their behalf in a language they may not check — and the
 * validator's warnings are surfaced rather than swallowed, because "we changed a number" is exactly
 * the thing they need to see.
 *
 * ── and one rule about cost ──
 *
 * A version that is still fresh is not re-bought. Pressing the button again on an unchanged CV shows
 * the stored translation; only sections whose Arabic actually moved are re-requested.
 */

import { useCallback, useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import BrandOrb from "../BrandOrb";
import {
  buildTranslationSource, sectionHashes, sourceContentHash, staleSections, translationFresh,
  TRANSLATION_PROMPT_VERSION, type TranslatedVersion,
} from "@/app/lib/translate";
import { GLOSSARY_VERSION } from "@/app/lib/glossary";
import { resolveOccupation } from "@/app/lib/occupations";
import { useBuilder } from "./BuilderProvider";

const C = {
  en: {
    title: "English version",
    lead: "We will write an English version from the facts you confirmed. Your Arabic CV stays exactly as it is.",
    make: "Create English version",
    remake: "Update the English version",
    working: "Writing the English version…",
    fresh: "The English version is up to date.",
    stale: "Your Arabic CV changed. These sections need updating:",
    failed: "We could not produce the English version. Your Arabic CV is unchanged — you can try again.",
    review: "Check these before you use it",
    confirm: "Terms to confirm",
    source: "Arabic",
    target: "English",
    changed: "A number or a name changed here — check it.",
    costs: "Uses one AI request",
    free: "Already written — no request",
  },
  ar: {
    title: "النسخة الإنجليزية",
    lead: "سننشئ نسخة إنجليزية من المعلومات التي أكّدتها، مع الاحتفاظ بالنسخة العربية كما هي.",
    make: "إنشاء نسخة إنجليزية",
    remake: "تحديث النسخة الإنجليزية",
    working: "نكتب النسخة الإنجليزية…",
    fresh: "النسخة الإنجليزية محدّثة.",
    stale: "تغيّرت سيرتك العربية. هذه الأقسام تحتاج تحديثاً:",
    failed: "لم نتمكن من إنشاء النسخة الإنجليزية. سيرتك العربية كما هي، ويمكنك المحاولة مرة أخرى.",
    review: "راجع هذه قبل استخدامها",
    confirm: "مصطلحات تحتاج تأكيدك",
    source: "العربية",
    target: "الإنجليزية",
    changed: "تغيّر رقم أو اسم هنا — تحقّق منه.",
    costs: "يستخدم طلباً واحداً",
    free: "مكتوبة مسبقاً — بلا طلب",
  },
};

type Phase = "idle" | "working" | "done" | "error";

export default function EnglishVersion() {
  const { lang, state, dispatch, cv } = useBuilder();
  const c = C[lang];
  const [phase, setPhase] = useState<Phase>("idle");
  const [problems, setProblems] = useState<string[]>([]);

  /* Only offered on an Arabic CV. On an English one there is nothing to translate FROM. */
  const applicable = cv === "ar";

  const families = useMemo(() => {
    const f = resolveOccupation(state.target.title, { cvLang: cv }).family;
    return f === "unknown" ? [] : [f];
  }, [state.target.title, cv]);

  const src = useMemo(
    () => buildTranslationSource(state, "en", families),
    [state, families],
  );

  const stored = state.versions?.en ?? null;
  const fresh = translationFresh(stored, src);
  /* Memoised: a fresh `[]` on every render changes the identity of `run`, which is a re-render loop
     wearing a helpful disguise — the same trap the experience section hit. */
  const stale = useMemo(() => (stored ? staleSections(stored, src) : []), [stored, src]);

  const run = useCallback(async () => {
    setPhase("working");
    setProblems([]);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: src,
          /* Only what moved. This is what makes editing one bullet cheap rather than a full rewrite. */
          sections: stored ? stale : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.items) { setPhase("error"); return; }

      /*
       * A partial update MERGES. Replacing the item map wholesale would delete the translations of
       * every section that did not change — which is the opposite of the saving the partial request
       * was made for.
       */
      const version: TranslatedVersion = {
        sourceLanguage: "ar",
        targetLanguage: "en",
        contentHash: sourceContentHash(src),
        sectionHashes: sectionHashes(src),
        promptVersion: TRANSLATION_PROMPT_VERSION,
        glossaryVersion: GLOSSARY_VERSION,
        model: String(json._meta?.model ?? ""),
        items: { ...(stored?.items ?? {}), ...json.items },
        needsConfirmation: Array.isArray(json.needsConfirmation) ? json.needsConfirmation : [],
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
        createdAt: Date.now(),
      };

      dispatch({ t: "version", lang: "en", version });
      /* The validator's findings are shown, not swallowed. "A number changed" is precisely what the
         user needs to see, and hiding it to keep the screen tidy would defeat the check. */
      setProblems(Array.isArray(json.problems) ? json.problems.map((p: { code: string; itemId?: string }) => p.itemId ?? p.code) : []);
      setPhase("done");
      track("builder_english_version", { partial: stored ? 1 : 0 });
    } catch {
      setPhase("error");
    }
  }, [src, stored, stale, dispatch]);

  if (!applicable) return null;

  return (
    <div className="bd-card mt-6 p-5" style={{ border: "1px solid var(--line)", borderRadius: 16 }}>
      <h3 className="text-base font-bold">{c.title}</h3>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{c.lead}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void run()}
          disabled={phase === "working" || fresh}
          className="btn-accent rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-45"
        >
          <span className="inline-flex items-center gap-2">
            <BrandOrb variant="button" size={16} />
            {phase === "working" ? c.working : stored ? c.remake : c.make}
          </span>
        </button>
        {/* Said before the tap. A cost learned about afterwards is a surprise. */}
        <span className="text-xs" style={{ color: "var(--faint)" }}>{fresh ? c.free : c.costs}</span>
      </div>

      {fresh && <p className="mt-3 text-xs" style={{ color: "#6ee7b7" }}>{c.fresh}</p>}

      {!fresh && stale.length > 0 && (
        <p className="mt-3 text-xs" style={{ color: "#fcd34d" }}>
          {c.stale} {stale.join("، ")}
        </p>
      )}

      {phase === "error" && <p className="mt-3 text-xs" style={{ color: "#fca5a5" }}>{c.failed}</p>}

      {stored?.needsConfirmation?.length ? (
        <div className="mt-4">
          <div className="bd-label">{c.confirm}</div>
          <ul className="mt-1 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
            {stored.needsConfirmation.map((t) => <li key={t}>· {t}</li>)}
          </ul>
        </div>
      ) : null}

      {/*
        Side by side, source and translation, because that is the only way a user can check a
        translation they did not write. Flagged items are marked rather than hidden.
      */}
      {stored && (
        <div className="mt-4 space-y-3">
          {src.items.map((item) => {
            const out = stored.items[item.id];
            if (!out) return null;
            const flagged = problems.includes(item.id);
            return (
              <div
                key={item.id}
                className="rounded-xl p-3"
                style={{
                  background: "var(--surface)",
                  border: flagged ? "1px solid rgba(252,211,77,.45)" : "1px solid var(--line)",
                }}
              >
                <p className="text-xs" dir="rtl" style={{ color: "var(--faint)" }}>{item.text}</p>
                <p className="mt-1.5 text-sm" dir="ltr" style={{ color: "var(--fg)" }}>{out}</p>
                {flagged && <p className="mt-1 text-xs" style={{ color: "#fcd34d" }}>{c.changed}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
