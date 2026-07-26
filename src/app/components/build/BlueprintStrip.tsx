"use client";

/**
 * One blueprint, four readers, one paid call.
 *
 * `AiStrip` is the per-section version: it renders a Suggest button and, on every tap, buys its
 * own request. That was already an improvement on two sections having no AI at all, and it is
 * also the shape that made a one-experience CV cost four paid calls — credentials asked for
 * credentials, languages asked for languages, and skills would have asked for skills, each one
 * re-deriving the same occupation from scratch.
 *
 * This renders from a slice of a SHARED role blueprint. The first section to need it generates it;
 * every section after that reads. Revisiting a section reads. Refreshing reads. Going back and
 * forward reads. The button only ever buys a call when there is genuinely nothing to read.
 *
 * ── what it deliberately keeps from AiStrip ──
 *
 * Everything about how a suggestion behaves once it exists: chips are unticked, nothing reaches
 * the document until tapped, `onPick` hands the text back and the SECTION decides what a
 * credential or a language made of that text is. A component that could write into `profile`
 * would be a second path into the confirmed document, and the whole no-fabrication guarantee
 * rests on there being exactly one.
 *
 * ── and the one thing it adds ──
 *
 * The button says whether tapping it will spend a request. "Suggest with AI" and "Show
 * suggestions" are different promises, and a user who has been told which is which does not feel
 * misled when a tap is instant — or when it is not.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import BrandOrb from "../BrandOrb";
import { credentialsFor } from "@/app/lib/countryRules";
import { filterFresh, newItem, rejected, type SectionId } from "@/app/lib/builderDoc";
import { useBuilder } from "./BuilderProvider";
import SuggestionChip from "./SuggestionChip";
import { whySentence } from "@/app/lib/provenance";

const C = {
  en: {
    ask: "Suggest with AI",
    read: "Show suggestions",
    more: "Suggest more",
    stop: "Stop",
    unchecked: "Nothing is added until you tap it.",
    /* Said before the tap, not after. A cost the user learns about afterwards is a surprise. */
    willCall: "Uses one AI request",
    fromCache: "Already generated — no request",
    thinking: "Working out what this profession involves…",
    needTitle: "Add the job title first, so a suggestion has something to be about.",
    /* Said on the chip itself: a licence you cannot practise without is not a suggestion. */
    required: "required to practise",
    /* The same fact, stated at the strength the evidence supports. */
    usuallyRequired: "usually required — check with the authority",
  },
  ar: {
    ask: "اقترح بالذكاء",
    read: "اعرض الاقتراحات",
    more: "اقترح المزيد",
    stop: "أوقف",
    unchecked: "لا يُضاف شيء قبل أن تنقره.",
    willCall: "يستخدم طلباً واحداً",
    fromCache: "مُولَّد مسبقاً — بلا طلب",
    thinking: "أستخلص ما تتضمنه هذه المهنة…",
    needTitle: "اكتب المسمى الوظيفي أولاً ليكون للاقتراح موضوع.",
    required: "مطلوب نظاماً لمزاولة المهنة",
    usuallyRequired: "غالباً مطلوب — تحقّق من الجهة المختصة",
  },
};

/** Which slice of the blueprint a section wants. */
export type BlueprintField =
  | "skillGroups" | "commonTools" | "commonSystems"
  | "credentialSuggestions" | "achievementQuestions" | "importantKeywords"
  | "alternativeTitles" | "responsibilityThemes";

export default function BlueprintStrip({
  field, section, onPick, note, auto = false,
}: {
  field: BlueprintField;
  /**
   * Which step these chips belong to.
   *
   * Only used to remember a rejection. A "not for me" has to be stored somewhere the next
   * generation will read, and the suggestion bag is keyed by section — without this the strip could
   * only hide a chip until the next reload, which is the "the tool isn't listening" behaviour that
   * `rejectItem` exists to avoid.
   */
  section: SectionId;
  onPick: (text: string) => void;
  note?: string;
  /**
   * Generate on mount if nothing is stored yet.
   *
   * Only ONE section in the whole builder should pass this — the blueprint step, which is the
   * stage whose entire purpose is "here is what we know about your profession". Everywhere else
   * an automatic generation on mount is exactly the per-stage call this refactor removes, and the
   * budget's `auto` ceiling is the backstop if someone adds a second one anyway.
   */
  auto?: boolean;
}) {
  const { lang, state, dispatch, gen, career } = useBuilder();
  const c = C[lang];

  /*
   * The input hash's ingredients, and why `confirmedSkills` is in it.
   *
   * A blueprint generated before the user ticked six skills is stale in a way that matters: the
   * prompt asks the model not to re-offer what is already confirmed, so the answer genuinely
   * differs. Including it means "Suggest more" after confirming some skills is a real second
   * question rather than a re-run — and excluding it would have made that button a no-op that
   * silently served the old answer.
   */
  const confirmed = useMemo(
    () => state.suggestions.filter((i) => i.status === "confirmed" && i.type === "skill").map((i) => i.text),
    [state.suggestions],
  );
  const input = useMemo(() => ({ confirmedSkills: confirmed.slice(0, 30) }), [confirmed]);

  /*
   * The chips are DERIVED, not copied into state.
   *
   * The first version mirrored the stored blueprint into a `useState` from an effect, which the
   * React lint rule rejects — correctly. Copying server data into local state gives you two
   * sources of truth for the same thing and a render where they disagree; here that render would
   * show the previous occupation's skills for one frame after a target change.
   *
   * `fresh` is not a copy of the store. It is the one case the store cannot cover: a FOLLOWER of a
   * de-duplicated request gets the answer without writing it (only the leader writes), so without
   * this it would render nothing while the leader's copy renders fine.
   */
  const stored = gen.peek("role_blueprint", input);
  const [fresh, setFresh] = useState<Record<string, unknown> | null>(null);
  const blueprint = stored ?? fresh;
  const items = useMemo(() => {
    if (!blueprint) return [];
    const raw = slice(blueprint, field);
    if (field !== "credentialSuggestions") return raw.map((text) => ({ text, note: "" }));
    /*
     * The blueprint returns credential IDS and the chip has to show a title.
     *
     * Resolved from `countryRules.ts` rather than from a title the model wrote, and that is not
     * pedantry: a model asked for the Saudi health registration has written "SCAFACH" before now.
     * An id either matches a verified rule or it is dropped, so the only credential names that can
     * reach a chip are ones a person wrote down.
     */
    const byId = new Map(credentialsFor(career.occupation, career.country).map((r) => [r.id, r]));
    /*
     * The title, and whether the thing is legally REQUIRED.
     *
     * "SCFHS registration" and "SCFHS registration — required to practise" are different offers,
     * and the difference is not decoration: one is a suggestion the user may reasonably skip, the
     * other is the reason their application would be rejected. The word comes from the encoded
     * rule, never from the model — `mandatory` is a claim about a jurisdiction's law.
     */
    return raw
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      /*
       * The note is kept BESIDE the title, never folded into it.
       *
       * `onPick` hands this text to the section, which makes a credential out of it — so a title
       * carrying "— required to practise" would print that phrase on the CV as part of the
       * credential's name. The chip shows both; only one of them is the document.
       *
       * And the wording follows the rule's own PROVENANCE. `countryRules.ts` states the doctrine
       * plainly: an `encoded` rule is usable as a suggestion the user confirms and NOT usable as a
       * claim the product makes. "Required to practise" is a claim about the law of a jurisdiction;
       * until an administrator has opened the source and confirmed it, the honest note is the
       * weaker one. Verifying a rule is what upgrades the sentence — see `ops/verify-rules.mjs`.
       */
      .map((rule) => ({
        text: rule.title[career.cvLang],
        note: !rule.mandatory ? "" : rule.status === "verified" ? c.required : c.usuallyRequired,
      }));
  }, [blueprint, field, career.occupation, career.country, career.cvLang, c.required, c.usuallyRequired]);

  /*
   * The chips minus what the user has already said no to.
   *
   * The blueprint is CACHED — the same answer is read on every visit — so without this a dismissed
   * chip reappears the moment the step is reopened, which reads as the product not listening.
   *
   * `filterFresh` and not a plain set lookup, because the same skill does not come back spelled the
   * same way: it compares normalized labels and, for short ones, by containment either way, so
   * declining "Mammography" also declines "Mammography imaging". That is the behaviour the
   * experience step already has for duties, and having two different ideas of "the same suggestion"
   * in one builder is how a rejection starts feeling unreliable.
   */
  const visible = useMemo(() => {
    const fresh = new Set(
      filterFresh(items.map((i) => i.text), { confirmed: [], pending: [], rejected: rejected(state, section) }),
    );
    return items.filter((i) => fresh.has(i.text));
  }, [items, state, section]);

  /*
   * A rejection is written as an item, offered and immediately rejected, rather than kept in local
   * state.
   *
   * Two dispatches instead of one because `offer` is the only way an item enters the bag and
   * `reject` is the only way one leaves it — the same two-step the skills section uses to confirm.
   * The result is that `filterFresh` sees it: the next "Suggest more" will not re-offer a reworded
   * version of something already declined.
   */
  const drop = (text: string) => {
    const item = newItem({ section, type: field, text, source: "ai" });
    dispatch({ t: "offer", items: [item] });
    dispatch({ t: "reject", id: item.id });
    track("builder_suggestion_rejected", { section, source: "ai" });
  };

  /*
   * The one automatic generation, fired at most once per mount and only when there is nothing to
   * read. The ref is what stops a re-render — a preview debounce, a keystroke elsewhere — from
   * firing a second one; `mayCall`'s `auto` ceiling is the backstop for the case the ref cannot
   * see, which is a remount.
   */
  const fired = useRef(false);
  useEffect(() => {
    if (!auto || fired.current || stored || !career.occupation.trim()) return;
    fired.current = true;
    void gen.run({ task: "role_blueprint", input, payload: { confirmedSkills: input.confirmedSkills }, trigger: "auto" })
      .then((out) => { if (out.data) setFresh(out.data); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, stored, career.occupation]);

  const ask = async () => {
    const out = await gen.run({
      task: "role_blueprint", input,
      payload: { confirmedSkills: input.confirmedSkills },
      trigger: "explicit",
    });
    if (out.data) setFresh(out.data);
  };

  const busy = gen.busy && gen.task === "role_blueprint";
  const noTitle = !career.occupation.trim();
  /* "Suggest more" once something is on screen — counted on what is VISIBLE, so a user who
     dismissed every chip is offered a fresh attempt rather than "more" of an empty list. */
  const label = busy ? c.stop : visible.length ? c.more : stored ? c.read : c.ask;

  return (
    <div className="mt-3">
      <button
        onClick={busy ? gen.cancel : () => void ask()}
        disabled={noTitle}
        className={`t-tap flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40${
          busy ? " t-busy" : ""}`}
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        <BrandOrb variant="button" size={16} busy={busy} />
        {label}
      </button>

      {/* The cost affordance. Part 19: each button must say whether it may use a request. */}
      {!busy && !noTitle && (
        <span className="ms-2 text-xs" style={{ color: "var(--faint)" }}>
          {stored ? c.fromCache : c.willCall}
        </span>
      )}

      {noTitle && <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{c.needTitle}</p>}

      {busy && (
        <>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{c.thinking}</p>
          {/* Chip-shaped placeholders in the place the chips will land, so the block does not grow
              under the reader's thumb when the answer arrives. See `.t-ghost`. */}
          <div className="bd-chips mt-3" aria-hidden>
            {[104, 78, 140, 96, 120, 84].map((w, i) => (
              <span key={i} className="t-ghost" style={{ width: w, height: 36 }} />
            ))}
          </div>
        </>
      )}

      {/* A refusal is amber, not red: a budget ceiling is not a fault, and colouring it like one
          teaches the user to distrust real errors. */}
      {!busy && gen.message && (
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: gen.state === "refused" ? "#fcd34d" : "#fca5a5" }}
        >
          {gen.message}
        </p>
      )}

      {visible.length > 0 && (
        <>
          {/* Every chip here came from the same blueprint, so the provenance is stated once rather
              than as a button on each of twenty-five of them. `showWhy={false}` for the same
              reason — see `sharedWhy` in `lib/provenance.ts`. */}
          <p className="bd-why-note mt-3 text-xs">{whySentence(lang, "ai")}</p>
          <div className="bd-chips t-stagger mt-2">
            {visible.map((item) => (
              <SuggestionChip
                key={item.text}
                text={item.text}
                lang={lang}
                source="ai"
                showWhy={false}
                suffix={item.note ? <span className="bd-opt"> · {item.note}</span> : undefined}
                onAdd={() => onPick(item.text)}
                onReject={() => drop(item.text)}
              />
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{note || c.unchecked}</p>
        </>
      )}
    </div>
  );
}

/**
 * Pull one field out of a blueprint as flat strings.
 *
 * Tolerant of a missing or wrong-shaped field rather than throwing: the response has already been
 * validated server-side, and a client that crashes on an unexpected shape turns a thin answer into
 * a blank screen. An unreadable field renders as no chips, which is the honest outcome.
 */
function slice(bp: Record<string, unknown>, field: BlueprintField): string[] {
  const v = bp[field];
  if (!Array.isArray(v)) return [];

  if (field === "skillGroups") {
    return v.flatMap((g) => {
      const items = (g as { items?: unknown })?.items;
      return Array.isArray(items) ? items.filter((x): x is string => typeof x === "string") : [];
    });
  }

  if (field === "credentialSuggestions") {
    /*
     * The blueprint returns credential IDS, because the server filters them against the verified
     * country rules and an id is what survives that filter. The user needs a title, so the id is
     * resolved here rather than trusting a title the model wrote — which is how "SCAFACH" would
     * have reached a CV.
     */
    return v
      .map((cred) => String((cred as { id?: unknown })?.id ?? ""))
      .filter(Boolean);
  }

  return v.filter((x): x is string => typeof x === "string");
}
