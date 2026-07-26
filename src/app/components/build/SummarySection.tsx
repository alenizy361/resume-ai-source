"use client";

/**
 * The professional summary — written last, and for a reason.
 *
 * It is the only paragraph on a CV that makes a claim about the whole document, so
 * it cannot be written first: a summary produced before the experience section is a
 * summary of nothing, and that is exactly what the chat builder used to emit on
 * turn three. Here it is locked until there is a target title and at least one real
 * position, and the lock states why rather than just refusing.
 *
 * Three variants instead of one. Not for variety's sake — a single summary is
 * either accepted or the user is stuck arguing with a text box, whereas three
 * genuinely different registers ("concise", "professional", "achievement") turn the
 * decision into a choice they can make in five seconds. Choosing is what confirms;
 * the two not chosen are discarded rather than left in the bag, since an unchosen
 * summary is not a pending suggestion, it is a road not taken.
 *
 * The "achievement" variant may carry a figure ONLY if the user's own draft already
 * did — enforced server-side in /api/suggest, not requested here.
 */

import { useCallback, useMemo, useState } from "react";
import { useAiTask } from "./useAiTask";
import { useBuilder } from "./BuilderProvider";
import { track } from "@vercel/analytics";
import BrandOrb from "../BrandOrb";
import AskAi from "./AskAi";
import {
  type BuilderState, type Item, newItem, pending, summaryBasis,
} from "@/app/lib/builderDoc";
import { type VariantLabel } from "@/app/lib/suggestShapes";

type Lang = "ar" | "en";

const C = {
  en: {
    gate: "Add the job you are aiming for and one position, and the summary can be written from them.",
    gateWhy: "A summary written before your experience is a summary of nothing.",
    thin: "You have no responsibilities confirmed yet. The summary will be thinner than it needs to be — going back to add a few makes it much stronger.",
    write: "Write three versions",
    rewrite: "Write three new versions",
    stop: "Stop",
    labels: { concise: "Concise", professional: "Professional", achievement: "Achievement-led" } as Record<VariantLabel, string>,
    hints: {
      concise: "Two tight lines. Best when the CV is already two pages.",
      professional: "The formal three-line register most Saudi employers expect.",
      achievement: "Leads with impact — using only figures you wrote yourself.",
    } as Record<VariantLabel, string>,
    use: "Use this one", edit: "Edit", save: "Save", cancel: "Cancel",
    onCv: "On your CV",
    change: "Rewrite", clear: "Remove from CV",
    stale: "Your experience changed after this summary was written — it may no longer describe your CV.",
    staleAct: "Write three new versions",
    own: "Or write your own",
    ownPh: "Two or three lines: what you do, at what level, and what you are aiming for.",
  },
  ar: {
    gate: "أضف الوظيفة التي تستهدفها ووظيفة واحدة من خبرتك، ليُكتب الملخص منهما.",
    gateWhy: "ملخص يُكتب قبل الخبرة هو ملخص لا شيء.",
    thin: "لم تؤكّد أي مهام بعد. سيكون الملخص أضعف مما يمكن أن يكون — الرجوع لإضافة بعضها يقوّيه كثيراً.",
    write: "اكتب ثلاث نسخ",
    rewrite: "اكتب ثلاث نسخ جديدة",
    stop: "أوقف",
    labels: { concise: "مختصر", professional: "مهني", achievement: "يبدأ بالإنجاز" } as Record<VariantLabel, string>,
    hints: {
      concise: "سطران محكمان. الأفضل إن كانت سيرتك صفحتين أصلاً.",
      professional: "الصياغة الرسمية بثلاثة أسطر، وهي المتوقعة عند معظم أصحاب العمل.",
      achievement: "يبدأ بالأثر — وبالأرقام التي كتبتها أنت فقط.",
    } as Record<VariantLabel, string>,
    use: "استخدم هذه", edit: "عدّل", save: "حفظ", cancel: "إلغاء",
    onCv: "في سيرتك",
    change: "أعد الكتابة", clear: "احذفه من السيرة",
    stale: "تغيّرت خبرتك بعد كتابة هذا الملخص — قد لا يصف سيرتك الآن.",
    staleAct: "اكتب ثلاث نسخ جديدة",
    own: "أو اكتبه بنفسك",
    ownPh: "سطران أو ثلاثة: ماذا تعمل، بأي مستوى، وما تستهدفه.",
  },
};

/**
 * What the model is told about the candidate.
 *
 * Assembled from confirmed content only — this reads `state.profile`, which by the
 * schema's invariant contains nothing the user has not accepted. A summary built
 * partly from pending suggestions would describe a CV that does not exist.
 */
function confirmedDigest(state: BuilderState): string {
  const p = state.profile;
  const roles = (p.roles || [])
    .filter((r) => r.title.trim())
    .map((r) => {
      const head = [r.title, r.company, r.location].filter(Boolean).join(" — ");
      const when = [r.start, r.end].filter(Boolean).join(" – ");
      return [`${head}${when ? ` | ${when}` : ""}`, ...r.bullets.map((b) => `  - ${b}`)].join("\n");
    })
    .join("\n");
  return [
    p.role && `TARGET TITLE: ${p.role}`,
    state.target.level && `LEVEL: ${state.target.level}`,
    state.target.industry && `INDUSTRY: ${state.target.industry}`,
    roles && `CONFIRMED EXPERIENCE:\n${roles}`,
    p.skills && `CONFIRMED SKILLS: ${p.skills}`,
    p.certifications && `CREDENTIALS:\n${p.certifications}`,
    p.education && `EDUCATION: ${p.education}`,
    p.languages && `LANGUAGES: ${p.languages}`,
  ].filter(Boolean).join("\n");
}

export default function SummarySection({
  lang, state, dispatch,
}: {
  lang: Lang;
  state: BuilderState;
  dispatch: React.Dispatch<{ t: string; [k: string]: unknown }>;
}) {
  const c = C[lang];
  const [picked, setPicked] = useState<string>("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [editingOwn, setEditingOwn] = useState(false);
  const [own, setOwn] = useState("");

  const roles = state.profile.roles || [];
  const hasRole = roles.some((r) => r.title.trim() && r.company.trim());
  const ready = state.target.title.trim().length > 1 && hasRole;
  const thin = roles.every((r) => r.bullets.length === 0);

  const offered = pending(state, "summary");
  const confirmed = state.profile.summary || "";
  const basis = useMemo(() => summaryBasis(state.profile), [state.profile]);
  // Stale only matters once something is actually on the CV. An empty summary
  // cannot be out of date.
  const stale = Boolean(confirmed) && Boolean(state.summaryBasis) && state.summaryBasis !== basis;

  /*
   * Three summaries of the same career, through the shared layer.
   *
   * What this used to own itself: a busy flag, an error string, an abort ref, the 429
   * branch, the AbortError branch, and the "no variants came back" branch. All six are
   * `useAiTask` now, and the last one is the interesting one — zero variants was being
   * reported with the generic failure sentence, when it is the `empty` state and deserves
   * "nothing to add here" rather than "the assistant is busy".
   */
  const ai = useAiTask(lang);

  /*
   * The final pass, which is a summary AND four other things.
   *
   * `summary_variants` asked for three summaries and nothing else, then the review stage asked
   * separately about duplicate lines, over-long bullets and section order — questions about the
   * same confirmed document, sent one at a time. `final_content` answers all of them in one
   * response, and the summaries are simply the part this section renders.
   *
   * The others are not wasted: they are stored on the resume, so the review stage reads them
   * instead of asking. That is why this is worth combining rather than merely batching.
   */
  const { gen } = useBuilder();
  const digest = useMemo(() => confirmedDigest(state), [state]);
  const finalInput = useMemo(() => ({ digest, target: state.target.title }), [digest, state.target.title]);

  const write = useCallback(async () => {
    const out = await gen.run({
      task: "final_content",
      input: finalInput,
      payload: {
        facts: digest,
        jobAd: state.target.jobAdText,
        sections: ["summary", "experience", "education", "skills", "credentials", "languages"],
      },
    });
    const raw = Array.isArray(out.data?.summaries)
      ? out.data.summaries as Array<{ label: string; text: string }>
      : null;
    if (!raw) return;
    /* The route caps this at three and labels them by ANGLE, not by the fixed
       concise/professional/achievement triple the old variants endpoint returned. The label is
       display text either way, so it is passed through rather than coerced into that union. */
    const variants = raw as { label: VariantLabel; text: string }[];
    const items: Item[] = variants.map((v) => newItem({
      section: "summary", type: "summary", text: v.text,
      source: "ai", group: v.label,
      reason: lang === "ar" ? "مبني على ما أكّدته أعلاه" : "written from what you confirmed above",
    }));
    dispatch({ t: "offerSummary", items });
    setPicked(items[0].id);
    track("builder_summary_variants", { n: items.length });
  }, [gen, finalInput, digest, state.target.jobAdText, lang, dispatch]);

  if (!ready) {
    return (
      <div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>{c.gate}</p>
        <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>{c.gateWhy}</p>
      </div>
    );
  }

  const active = offered.find((i) => i.id === picked) ?? offered[0];

  return (
    <div>
      {/* ── what is on the CV now ── */}
      {confirmed && (
        <div className="mb-4">
          <div className="bd-label">{c.onCv}</div>
          <div className="bd-confirmed">
            {editingOwn ? (
              <div className="flex-1">
                <textarea
                  className="bd-textarea" value={own}
                  onChange={(e) => setOwn(e.target.value)}
                />
                <div className="mt-1.5 flex gap-2">
                  <Pill label={c.save} primary onClick={() => {
                    dispatch({ t: "summaryText", text: own });
                    setEditingOwn(false);
                  }} />
                  <Pill label={c.cancel} onClick={() => setEditingOwn(false)} />
                </div>
              </div>
            ) : (
              <>
                <p className="flex-1 whitespace-pre-wrap text-xs leading-relaxed">{confirmed}</p>
                <span className="flex flex-col gap-1">
                  <Pill label={c.edit} onClick={() => { setOwn(confirmed); setEditingOwn(true); }} />
                  <Pill label={c.clear} onClick={() => dispatch({ t: "summaryText", text: "", basis: "" })} />
                </span>
              </>
            )}
          </div>
          {stale && (
            <div
              className="mt-2 rounded-xl p-3"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)" }}
            >
              <p className="text-xs" style={{ color: "#fcd34d" }}>{c.stale}</p>
              <button
                onClick={ai.busy ? ai.cancel : write}
                className="mt-2 rounded-full px-3 text-xs font-bold"
                style={{ border: "1px solid rgba(251,191,36,0.45)", color: "#fcd34d" }}
              >
                {ai.busy ? c.stop : c.staleAct}
              </button>
            </div>
          )}
        </div>
      )}

      {thin && <p className="mb-3 text-xs" style={{ color: "#fcd34d" }}>{c.thin}</p>}

      {/* ── the three variants ── */}
      {offered.length > 0 && (
        <div className="mb-4">
          <div className="bd-chips mb-2">
            {offered.map((it) => (
              <button
                key={it.id}
                className={`bd-chip${active?.id === it.id ? " on" : ""}`}
                onClick={() => { setPicked(it.id); setEditing(null); }}
              >
                {c.labels[(it.group || "professional") as VariantLabel] ?? it.group}
              </button>
            ))}
          </div>
          {active && (
            <div className="bd-sug">
              <span className="bd-sug-badge">{badgeFor(active, lang)}</span>
              <div className="flex-1">
                {editing?.id === active.id ? (
                  <>
                    <textarea
                      className="bd-textarea" value={editing.text}
                      onChange={(e) => setEditing({ id: active.id, text: e.target.value })}
                    />
                    <div className="mt-1.5 flex gap-2">
                      <Pill label={c.save} onClick={() => {
                        dispatch({ t: "editItem", id: active.id, text: editing.text });
                        setEditing(null);
                      }} />
                      <Pill label={c.cancel} onClick={() => setEditing(null)} />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed">{active.text}</p>
                    <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>
                      {c.hints[(active.group || "professional") as VariantLabel]}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill label={c.use} primary onClick={() => {
                        // Confirming discards the siblings: the summary is one field,
                        // so an unchosen variant is not pending, it is declined.
                        dispatch({ t: "pickSummary", id: active.id });
                        track("builder_suggestion_accepted", { section: "summary", source: active.source });
                      }} />
                      <Pill label={c.edit} onClick={() => setEditing({ id: active.id, text: active.text })} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={ai.busy ? ai.cancel : write}
        className="flex items-center gap-2 rounded-full px-3 text-xs font-bold"
        style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.35)", color: "#93c5fd" }}
      >
        <BrandOrb variant="button" size={20} busy={ai.busy} />
        {ai.busy ? c.stop : offered.length || confirmed ? c.rewrite : c.write}
      </button>
      {/* Every non-success state, worded once by the hook — so a rate limit here reads the
          same as a rate limit three sections away, and `empty` finally has its own line. */}
      {ai.message && (
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: ai.state === "loading" ? "var(--muted)" : ai.throttled ? "#fcd34d" : ai.state === "empty" ? "var(--faint)" : "#fca5a5" }}
        >
          {ai.message}
        </p>
      )}

      {/* The form must work with the AI switched off. This is that promise, kept in
          the one section where a user is most likely to already know what to say. */}
      {!confirmed && (
        <div className="mt-4">
          <div className="bd-label">{c.own}</div>
          <textarea
            className="bd-textarea" value={own} placeholder={c.ownPh}
            onChange={(e) => setOwn(e.target.value)}
            onBlur={() => own.trim() && dispatch({ t: "summaryText", text: own })}
          />
        </div>
      )}

      <AskAi lang={lang} section="summary" targetRole={state.target.title} current={confirmed} />
    </div>
  );
}

/** "AI suggested", or "AI · edited" once the user has touched it. */
function badgeFor(it: Item, lang: Lang): string {
  if (lang === "ar") return it.editedByUser ? "ذكاء · معدّل" : "اقتراح ذكاء";
  return it.editedByUser ? "AI · edited" : "AI suggested";
}

function Pill({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 text-[11px] font-semibold"
      style={{ minHeight: 32, ...(primary
        ? { background: "var(--accent)", color: "#fff" }
        : { border: "1px solid var(--line)", color: "var(--muted)" }) }}
    >
      {label}
    </button>
  );
}
