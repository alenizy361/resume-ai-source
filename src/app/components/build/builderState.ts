"use client";

/**
 * The builder's state machine, in its own module.
 *
 * It lived inside `Builder.tsx` while the builder was one scrolling page, which was
 * fine for exactly as long as there was one mounted component. Splitting the journey
 * into a route per step needs the same reducer driving eleven pages, and the way that
 * goes wrong is obvious in advance: a second copy of these transitions, drifting from
 * this one, is the "duplicated business logic" the audit already found three times.
 *
 * So the reducer moves out and nothing is duplicated. `Builder.tsx` (the long page)
 * and `BuilderProvider.tsx` (the step routes) import the same `reducer` and the same
 * `Action`. Extracted verbatim — every transition and every comment is the one that
 * was already running in production.
 */

import { contactLine } from "@/app/lib/draftStore";
import {
  type BuilderState, type SectionId, type Item, type Credential, type CredentialKind,
  type LanguageEntry,
  newItem, confirmItem, rejectItem, editItem, newId, summaryBasis,
  cvLang, levelWord, validToWord,
} from "@/app/lib/builderDoc";
import { type Role, rolesToLines } from "@/app/lib/resumeDoc";
import {
  type CareerContext, type GenerationStore, invalidate, tasksToInvalidate,
} from "@/app/lib/aiCache";
import type { ResumeLedger } from "@/app/lib/aiBudget";
import type { TranslatedVersion } from "@/app/lib/translate";
import { type RolePack } from "@/app/lib/rolePacks";
import { type ParsedCv } from "@/app/lib/importCv";


export type Action =
  | { t: "hydrate"; state: BuilderState }
  | { t: "entry"; v: BuilderState["entry"] }
  | { t: "target"; patch: Partial<BuilderState["target"]> }
  | { t: "personal"; patch: Partial<BuilderState["personal"]> }
  | { t: "template"; slug: string }
  | { t: "seed"; pack: RolePack; ui: "ar" | "en"; cv: "ar" | "en" }
  | { t: "addRole" }
  | { t: "role"; id: string; patch: Partial<Role> }
  | { t: "removeRole"; id: string }
  | { t: "moveBullet"; roleId: string; from: number; to: number }
  | { t: "removeBullet"; roleId: string; index: number }
  | { t: "offer"; items: Item[] }
  | { t: "editItem"; id: string; text: string }
  | { t: "education"; text: string }
  | { t: "credAdd"; cred: Credential }
  | { t: "cred"; id: string; patch: Partial<Credential> }
  | { t: "credRemove"; id: string }
  | { t: "langAdd"; entry: LanguageEntry }
  | { t: "lang"; id: string; patch: Partial<LanguageEntry> }
  | { t: "langRemove"; id: string }
  | { t: "offerSummary"; items: Item[] }
  | { t: "pickSummary"; id: string }
  | { t: "summaryText"; text: string }
  | { t: "import"; cv: ParsedCv; lang: "ar" | "en" }
  | { t: "removeSkill"; text: string }
  | { t: "tailorCopy" }
  | { t: "confirm"; id: string }
  | { t: "reject"; id: string }
  | { t: "done"; section: SectionId }
  /**
   * Commit a generation and its cost together.
   *
   * One action for both because they must never diverge: a stored result whose call was not
   * counted under-reports the spend, and a counted call with no stored result buys the same
   * answer again on the next visit. Two dispatches could interleave with anything else in the
   * queue; one cannot.
   */
  | { t: "ai"; store: GenerationStore; ledger: ResumeLedger }
  /**
   * Record the answer to the occupation question, or clear it.
   *
   * `"none"` is a real answer, not an absence: it means "I saw the question and none of the options
   * fit". Stored so the question stops being asked, which an empty string could not express — an empty
   * string is "never answered" and would make the prompt reappear on every visit.
   */
  | { t: "occupation"; id: string }
  /**
   * Store a localized version. WORDING ONLY.
   *
   * It cannot touch `profile`, and that is structural rather than a rule: the action carries a
   * `TranslatedVersion`, which holds translated strings by source item id and has nowhere to put a
   * career fact. So there is exactly one set of facts and no way for the English CV to claim something
   * the Arabic one does not.
   */
  | { t: "version"; lang: string; version: TranslatedVersion }
  /** Switch which version is shown. Never touches content — see `activeVersion`. */
  | { t: "viewVersion"; lang: string };

/**
 * Rebuild the certifications block from the confirmed credentials only.
 *
 * "valid to" is chosen by the CV's language, not the interface's. An Arabic CV that
 * says "الرخصة — valid to 2027" was written by a tool that could not tell the two
 * apart, and a recruiter can see that at a glance.
 */
export function withCreds(s: BuilderState, credentials: Credential[]): BuilderState {
  const cv = cvLang(s.target);
  const text = credentials
    .filter((c) => c.status === "confirmed" && c.title.trim())
    .map((c) => [
      c.title.trim(),
      c.issuer.trim(),
      c.issueDate.trim(),
      c.expiryDate.trim() && `${validToWord(cv)} ${c.expiryDate.trim()}`,
      c.credentialNumber?.trim(),
    ].filter(Boolean).join(" — "))
    .join("\n");
  return { ...s, credentials, profile: { ...s.profile, certifications: text } };
}

/**
 * Rebuild the languages line. An entry with no level is not published.
 *
 * The level is STORED as an English key and PUBLISHED as a word in the CV's language.
 * Storing the word would make the data un-comparable across languages; publishing the
 * key would print "العربية (native)" on an Arabic resume.
 */
export function withLangs(s: BuilderState, languages: LanguageEntry[]): BuilderState {
  const cv = cvLang(s.target);
  const text = languages
    .filter((l) => l.status === "confirmed" && l.name.trim() && l.level)
    .map((l) => `${l.name.trim()} (${levelWord(l.level as Exclude<LanguageEntry["level"], "">, cv)})`)
    .join(cv === "ar" ? "، " : ", ");
  return { ...s, languages, profile: { ...s.profile, languages: text } };
}

export function reducer(s: BuilderState, a: Action): BuilderState {
  switch (a.t) {
    case "hydrate":
      return a.state;
    case "entry":
      return { ...s, entry: a.v };
    case "target": {
      const target = { ...s.target, ...a.patch };
      // The role headline on the CV follows the target title, so the preview shows
      // the job being aimed at rather than staying blank until the summary exists.
      const profile = a.patch.title !== undefined
        ? { ...s.profile, role: a.patch.title }
        : s.profile;
      /*
       * A target edit is the one change that can retire paid work, so it is also the one that
       * bumps `revision` and invalidates.
       *
       * Which fields count is NOT decided here — `tasksToInvalidate` compares two career contexts
       * and answers from a dependency table. That is what makes "changing the employer must not
       * invalidate skills" true: `employer` is not part of a career context, so it cannot appear
       * in the diff. A branch here that tried to remember which fields matter is precisely the
       * thing that drifts when a field is added.
       */
      const dead = tasksToInvalidate(careerContext(s), careerContext({ ...s, target }));
      const next: BuilderState = {
        ...s, target, profile,
        ...(dead.length
          ? {
            generations: invalidate(s.generations, dead, Date.now()),
            revision: (s.revision ?? 0) + 1,
          }
          : {}),
      };
      // Switching the CV's language changes strings already published from structured
      // data — "valid to" and every proficiency word. Rebuilding them here is what
      // makes the language field retroactive instead of applying only to what comes
      // after it.
      return a.patch.language !== undefined && a.patch.language !== s.target.language
        ? withLangs(withCreds(next, next.credentials), next.languages)
        : next;
    }
    case "personal": {
      const personal = { ...s.personal, ...a.patch };
      const profile = {
        ...s.profile,
        name: personal.fullName,
        // contactLine composes in the order an employer scans, and drops empties so
        // a half-filled form never renders a dangling separator.
        contact: contactLine(
          { phone: personal.phone, email: personal.email },
          { city: [personal.city, personal.country].filter(Boolean).join(", "),
            nationality: personal.nationality, visaStatus: personal.visaStatus },
        ),
      };
      return { ...s, personal, profile };
    }
    case "template":
      return { ...s, template: a.slug };

    /*
     * Seed the suggestion bag from the cached role pack.
     *
     * This is what makes the blueprint instant: no model call stands between typing
     * a job title and seeing what the builder knows about it. Everything seeded is
     * `status: "suggested"` and `source: "occupation"`, so it is offered and nothing
     * more — an X-ray technologist does not necessarily do MRI, and the pack cannot
     * assert that they do.
     */
    case "seed": {
      // Item TEXT is CV content, so it follows the document's language. `group` is a
      // heading in the form and follows the interface. Same pack, two languages, and
      // the distinction is the whole reason the seeded duties were coming out Arabic
      // on an English CV.
      const L = a.cv;
      const already = new Set(s.suggestions.map((i) => i.normalized));
      const fresh: Item[] = [];
      for (const g of a.pack.groups) {
        for (const it of g.items) {
          const item = newItem({
            section: "skills", type: "skill", text: it[L],
            source: "occupation", sourceRef: a.pack.slug, group: g.label[a.ui],
            reason: a.ui === "ar" ? "شائع في هذا المسمى" : "common for this job title",
          });
          if (!already.has(item.normalized)) { already.add(item.normalized); fresh.push(item); }
        }
      }
      return { ...s, suggestions: [...s.suggestions, ...fresh] };
    }

    /* ── roles ── */
    case "addRole": {
      const role: Role = {
        id: newId("r"), title: "", company: "", location: "",
        department: "", start: "", end: "", bullets: [],
      };
      return { ...s, profile: { ...s.profile, roles: [...(s.profile.roles || []), role] } };
    }
    case "role": {
      const roles = (s.profile.roles || []).map((r) => r.id === a.id ? { ...r, ...a.patch } : r);
      return { ...s, profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) } };
    }
    case "removeRole": {
      const roles = (s.profile.roles || []).filter((r) => r.id !== a.id);
      return {
        ...s,
        profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) },
        // Orphaned suggestions would sit in the bag forever, invisible and counted.
        suggestions: s.suggestions.filter((i) => i.roleId !== a.id),
      };
    }
    case "moveBullet": {
      const roles = (s.profile.roles || []).map((r) => {
        if (r.id !== a.roleId) return r;
        const b = [...r.bullets];
        const [m] = b.splice(a.from, 1);
        b.splice(a.to, 0, m);
        return { ...r, bullets: b };
      });
      return { ...s, profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) } };
    }
    case "removeBullet": {
      const roles = (s.profile.roles || []).map((r) => r.id !== a.roleId
        ? r
        : { ...r, bullets: r.bullets.filter((_, i) => i !== a.index) });
      return { ...s, profile: { ...s.profile, roles, wovenLines: rolesToLines(roles) } };
    }
    case "offer":
      return { ...s, suggestions: [...s.suggestions, ...a.items] };
    case "editItem":
      return editItem(s, a.id, a.text);

    case "education":
      return { ...s, profile: { ...s.profile, education: a.text } };

    /* ── credentials ──
     * A credential reaches the CV only once it is `confirmed` AND has a title. The
     * derived string is rebuilt from scratch each time rather than appended to, so
     * un-confirming one actually removes it from the document.
     */
    case "credAdd":
      return withCreds(s, [...s.credentials, a.cred]);
    case "cred":
      return withCreds(s, s.credentials.map((x) => x.id === a.id ? { ...x, ...a.patch } : x));
    case "credRemove":
      return withCreds(s, s.credentials.filter((x) => x.id !== a.id));

    /* ── languages ──
     * Level is required, never defaulted: an entry without one is held back rather
     * than published as a guess. Nothing may quietly assert "fluent English".
     */
    case "langAdd":
      return withLangs(s, [...s.languages, a.entry]);
    case "lang":
      return withLangs(s, s.languages.map((x) => x.id === a.id ? { ...x, ...a.patch } : x));
    case "langRemove":
      return withLangs(s, s.languages.filter((x) => x.id !== a.id));

    /* ── summary ──
     * The summary is one field, not a list, so its suggestions do not accumulate:
     * a new set of variants replaces the old one outright, and choosing one discards
     * the other two. An unchosen variant is not a pending item the user still owes a
     * decision on — it is a road not taken, and leaving it in the bag would have the
     * review section report unconfirmed AI content forever.
     */
    case "offerSummary":
      return {
        ...s,
        suggestions: [...s.suggestions.filter((i) => i.section !== "summary"), ...a.items],
      };
    case "pickSummary": {
      const next = confirmItem(s, a.id).state;
      return {
        ...next,
        suggestions: next.suggestions.filter((i) => i.section !== "summary"),
        summaryBasis: summaryBasis(next.profile),
      };
    }
    case "summaryText": {
      const text = a.text.trim();
      const profile = { ...s.profile, summary: text };
      return {
        ...s,
        profile,
        // Recomputed from the result, not passed in: the stale notice is only honest
        // if the stored basis is the state the summary was actually written against.
        summaryBasis: text ? summaryBasis(profile) : undefined,
      };
    }

    /*
     * Apply to a second job without rebuilding a career.
     *
     * The profile IS the master career record — employers, dates, duties, credentials
     * are true regardless of which advert they are being sent to. What is target-bound
     * is exactly two things: the advert itself, and the summary that was written to
     * answer it. So those are cleared and nothing else is, which is what makes this a
     * tailored copy rather than a fresh start.
     *
     * `sectionsDone` loses its target-side ticks so the journey asks again rather than
     * showing a green check over a step that now describes the previous application.
     * `reached` is monotonic, so nothing re-locks — the user is asked, not blocked.
     */
    case "tailorCopy": {
      const stale: SectionId[] = ["target", "summary", "review", "design"];
      return {
        ...s,
        target: { ...s.target, jobAdText: "", jobAdUrl: "", employer: "" },
        profile: { ...s.profile, summary: "", jobAd: "" },
        summaryBasis: undefined,
        suggestions: s.suggestions.filter((i) => i.section !== "summary"),
        sectionsDone: s.sectionsDone.filter((x) => !stale.includes(x)),
      };
    }

    /*
     * A CV the user already has, brought into the form.
     *
     * Three rules decide what lands where, and each one is about not losing or not
     * over-claiming the user's own words:
     *
     * 1. Their FACTS go straight in — name, contact, jobs with dates, education, their
     *    own summary. This is transcription, not suggestion: the document is theirs and
     *    a form that made them re-approve their own employer would be insulting.
     * 2. Duties land up to the role's budget, and the OVERFLOW becomes suggestions.
     *    `capBullets` keeps the earliest six, so importing ten silently would delete
     *    four of their lines with no trace. Offered, they are one tap from returning.
     * 3. Skills, credentials and languages arrive UNCONFIRMED. Not because they are
     *    doubted, but because each needs something the parse cannot supply: a skill
     *    needs to fit the target job, a credential needs its issuer and expiry, and a
     *    language needs a level this product refuses to guess.
     *
     * Existing input is never overwritten. Someone who typed their phone number and
     * then imported a file keeps what they typed.
     */
    case "import": {
      const cv = a.cv;
      const keep = (mine: string, theirs: string) => mine.trim() || theirs.trim();
      const personal = {
        ...s.personal,
        fullName: keep(s.personal.fullName, cv.name),
        phone: keep(s.personal.phone, cv.phone),
        email: keep(s.personal.email, cv.email),
        linkedin: keep(s.personal.linkedin, cv.linkedin),
      };

      const roles: Role[] = [...(s.profile.roles || [])];
      const offered: Item[] = [];
      for (const r of cv.roles) {
        const id = newId("r");
        const current = /present|now|الآن|حالي/i.test(r.end) || !r.end;
        const cap = current ? 6 : 4;
        roles.push({
          id, title: r.title, company: r.company, location: r.location,
          department: "", start: r.start, end: r.end,
          bullets: r.bullets.slice(0, cap),
        });
        for (const extra of r.bullets.slice(cap)) {
          offered.push(newItem({
            section: "experience", type: "duty", text: extra, roleId: id,
            source: "imported", sourceRef: "cv-upload",
            reason: a.lang === "ar" ? "من سيرتك المرفوعة — تجاوزت حد المهام" : "from your uploaded CV — over this job's bullet limit",
          }));
        }
      }

      for (const skill of cv.skills) {
        offered.push(newItem({
          section: "skills", type: "skill", text: skill,
          source: "imported", sourceRef: "cv-upload",
          reason: a.lang === "ar" ? "من سيرتك المرفوعة" : "from your uploaded CV",
        }));
      }

      const credentials: Credential[] = [
        ...s.credentials,
        ...cv.certifications.map((title) => ({
          id: newId("cr"), kind: "certification" as CredentialKind, title,
          issuer: "", issueDate: "", expiryDate: "",
          status: "suggested" as const, source: "imported" as const,
        })),
      ];

      const languages: LanguageEntry[] = [
        ...s.languages,
        ...cv.languages
          // A parsed "English (Fluent)" carries a level we did not ask for; the name is
          // kept and the level is not, because a level has to be the user's own claim.
          .map((raw) => raw.replace(/\s*[([].*$/, "").trim())
          .filter((name) => name && !s.languages.some((l) => l.name === name))
          .map((name) => ({
            id: newId("lg"), name, level: "" as const,
            status: "suggested" as const, source: "imported" as const,
          })),
      ];

      const education = [s.profile.education, ...cv.education].filter((x) => x && x.trim()).join("\n");

      const next: BuilderState = {
        ...s,
        entry: "upload",
        personal,
        suggestions: [...s.suggestions, ...offered],
        profile: {
          ...s.profile,
          name: personal.fullName,
          contact: contactLine(
            { phone: personal.phone, email: personal.email },
            { city: [personal.city, personal.country].filter(Boolean).join(", ") },
          ),
          roles,
          wovenLines: rolesToLines(roles),
          education,
          summary: s.profile.summary || cv.summary,
        },
      };
      return withLangs(withCreds({ ...next, credentials, languages }, credentials), languages);
    }

    /* A confirmed skill had no way off the CV. Importing twelve of them made that
       impossible to ignore. */
    case "removeSkill": {
      const kept = String(s.profile.skills || "")
        .split(/[,،]/).map((x) => x.trim()).filter(Boolean)
        .filter((x) => x !== a.text);
      return { ...s, profile: { ...s.profile, skills: kept.join("، ") } };
    }

    case "confirm":
      return confirmItem(s, a.id).state;

    case "reject":
      return rejectItem(s, a.id);
    case "done":
      return s.sectionsDone.includes(a.section)
        ? s
        : { ...s, sectionsDone: [...s.sectionsDone, a.section] };
    default:
      return s;
  }
}

/**
 * The five facts that decide what a suggestion should say, lifted out of the builder's state.
 *
 * Narrow on purpose, and the omissions are the design: no name, no employer, no template, no
 * contact details. Everything Part 11 of the cost brief says must NOT invalidate an AI result is
 * absent from this function, so it cannot appear in a context diff and cannot invalidate anything.
 * That is a stronger guarantee than a rule someone has to remember.
 *
 * `country` prefers the TARGET country over the personal one: a Riyadh-based applicant aiming at
 * Dubai should be offered UAE credentials, and the market they are applying INTO is the one whose
 * regulator matters.
 */
export function careerContext(s: BuilderState): CareerContext {
  return {
    /*
     * The CONFIRMED occupation wins over the typed title when there is one.
     *
     * Without this the clarification would be theatre: the user answers "معلم رياضيات", the context
     * hash still says "معلم", and the cache serves the blended suggestions the question existed to
     * prevent. `"none"` falls back to the raw title, which is exactly right — it means the options did
     * not fit, so their own words are the best description available.
     */
    occupation: s.occupationId && s.occupationId !== "none" ? s.occupationId : s.target.title,
    specialization: s.target.industry,
    seniority: s.target.level,
    country: s.target.country || s.personal.country,
    cvLang: cvLang(s.target),
  };
}
