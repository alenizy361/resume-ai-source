/**
 * The truthfulness rules, asserted structurally.
 *
 * The product's central promise is that AI never puts a fact on a CV the user did
 * not confirm. That promise is kept here by a data-model invariant rather than by a
 * render-time filter: unconfirmed items live in `suggestions` and the resume is
 * rendered from `profile`, so there is no path from one to the other except
 * `confirmItem`. These tests exist to prove that path is the only one.
 *
 * The Radiology Technologist case the product owner mandated is at the bottom, run
 * end to end: X-ray, CT and PACS confirmed; MRI, SCFHS and RSO suggested and never
 * confirmed; the CV must contain the first three and none of the last three.
 *
 *   node --experimental-strip-types src/ops/builderdoc.test.mjs
 */

import {
  EMPTY_BUILDER, newItem, confirmItem, rejectItem, editItem, pending, rejected,
  hasUnconfirmed, filterFresh, bulletRoom, normalizeLabel, summaryBasis,
  cvLang, levelWord, validToWord, SCHEMA_VERSION, migrateBuilder,
} from "../app/lib/builderDoc.ts";
import { assembleResume } from "../app/lib/mergeProfile.ts";
import { upsertRole, rolesToLines } from "../app/lib/resumeDoc.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const base = () => ({ ...EMPTY_BUILDER, profile: { ...EMPTY_BUILDER.profile, roles: [] } });

eq("the schema is versioned", SCHEMA_VERSION, 3);

/* ────────────────── bringing a stored resume forward ────────────────── */

/*
 * The provider used to spread `{ ...EMPTY_BUILDER, ...saved }` inline, which is correct only while
 * every schema change is a new optional field. The first change that is not — a renamed key, a
 * moved shape — would be applied in one shell and not the other, and a user's stored CV would
 * quietly lose a section. One function, called by both.
 */
{
  /* A v2 draft: everything the old schema had, nothing the new one added. */
  const v2 = {
    schemaVersion: 2,
    profile: { ...EMPTY_BUILDER.profile, name: "عبدالعزيز", skills: "CT، MRI" },
    suggestions: [newItem({ section: "skills", type: "skill", text: "PACS" })],
    entry: "new",
    target: { ...EMPTY_BUILDER.target, title: "Radiology Technologist", country: "SA", language: "en" },
    personal: { ...EMPTY_BUILDER.personal, fullName: "عبدالعزيز" },
    credentials: [], languages: [], template: "azure", sectionsDone: ["target"], updatedAt: 5,
  };

  const up = migrateBuilder(v2);
  ok("a v2 draft is recognised as older", up.migrated === true);
  eq("and stamped at the current version", up.state.schemaVersion, SCHEMA_VERSION);
  eq("the name survives", up.state.profile.name, "عبدالعزيز");
  eq("so do the suggestions", up.state.suggestions.length, 1);
  eq("and the chosen template", up.state.template, "azure");
  ok("the new fields are absent rather than invented",
    up.state.userId === undefined && up.state.status === undefined);

  /* A current draft is not reported as migrated — the UI would otherwise claim an upgrade on
     every single load. */
  const same = migrateBuilder({ ...v2, schemaVersion: SCHEMA_VERSION });
  ok("a current draft is not a migration", same.migrated === false);

  /*
   * A draft from a NEWER build — a second tab left open across a deploy — is left alone. Older
   * code cannot know what it would be dropping, and dropping it is not recoverable.
   */
  const newer = migrateBuilder({ ...v2, schemaVersion: SCHEMA_VERSION + 1, template: "executive" });
  eq("a newer draft keeps its version", newer.state.schemaVersion, SCHEMA_VERSION + 1);
  ok("and is not treated as a migration", newer.migrated === false);
  eq("and its content is untouched", newer.state.template, "executive");

  /* Nothing stored at all is a fresh document, not a migration. */
  const none = migrateBuilder(null);
  ok("no stored draft is not a migration", none.migrated === false);
  eq("and produces an empty builder", none.state.schemaVersion, SCHEMA_VERSION);
}

/* ── a suggestion is not content ── */
{
  let st = base();
  st.suggestions = [newItem({ section: "skills", type: "skill", text: "Magnetic Resonance Imaging" })];
  ok("a fresh item is only suggested", st.suggestions[0].status === "suggested");
  ok("the resume cannot see it", !assembleResume(st.profile, false).includes("Magnetic"));
  ok("and the document knows something is pending", hasUnconfirmed(st));

  const r = confirmItem(st, st.suggestions[0].id);
  ok("confirming puts it in the resume", assembleResume(r.state.profile, false).includes("Magnetic Resonance Imaging"));
  ok("and it leaves the suggestion bag", r.state.suggestions.length === 0);
  ok("so nothing is pending any more", !hasUnconfirmed(r.state));
}

/* ── rejection is a decision, not a dismissal ── */
{
  let st = base();
  st.suggestions = [newItem({ section: "skills", type: "skill", text: "Mammography" })];
  st = rejectItem(st, st.suggestions[0].id);
  eq("a rejected item is out of the pending list", pending(st, "skills").length, 0);
  eq("but it is remembered", rejected(st, "skills").length, 1);
  ok("the resume never saw it", !assembleResume(st.profile, false).includes("Mammography"));

  // Regenerate offers it again, reworded. It must not come back.
  const fresh = filterFresh(
    ["Mammography imaging", "Fluoroscopy"],
    { confirmed: [], pending: [], rejected: rejected(st, "skills") },
  );
  ok("a reworded rejection is not re-offered", !fresh.some((t) => /Mammography/i.test(t)), JSON.stringify(fresh));
  ok("a genuinely new suggestion still comes through", fresh.includes("Fluoroscopy"));
}

/* ── editing keeps provenance but records the human ── */
{
  let st = base();
  st.suggestions = [newItem({ section: "experience", type: "duty", text: "Performed imaging", roleId: "r1" })];
  st = editItem(st, st.suggestions[0].id, "Performed CT imaging under protocol");
  ok("the edit is stored", st.suggestions[0].text === "Performed CT imaging under protocol");
  ok("provenance stays ai — it is history, not current state", st.suggestions[0].source === "ai");
  ok("but the human is recorded", st.suggestions[0].editedByUser === true);
}

/* ── the bullet cap must block, never silently discard ── */
{
  let st = base();
  st.profile.roles = [{
    id: "r1", title: "Radiographer", company: "Dallah", location: "Riyadh",
    start: "2024", end: "الآن",
    bullets: ["a one", "b two", "c three", "d four", "e five", "f six"],
  }];
  eq("a full current role has no room", bulletRoom(st.profile.roles[0]), 0);

  st.suggestions = [newItem({ section: "experience", type: "duty", text: "a seventh duty entirely", roleId: "r1" })];
  const r = confirmItem(st, st.suggestions[0].id);
  eq("confirming a 7th is blocked, not swallowed", r.blocked, "bullet-cap");
  eq("the role is untouched", r.state.profile.roles[0].bullets.length, 6);
  ok("and the suggestion is still there to retry", r.state.suggestions.length === 1);
}
{
  // A past role's budget is tighter than a current one's.
  const past = { id: "r2", title: "Intern", company: "NGHA", location: "", start: "2022", end: "2023", bullets: ["x one", "y two"] };
  eq("a past role allows fewer", bulletRoom(past), 2);
}

/* ── duties land on the right job, and the header carries department ── */
{
  let st = base();
  st.profile.roles = upsertRole([], {
    id: "r1", title: "Radiographer", company: "Dallah", location: "Riyadh",
    department: "CT", start: "Sep 2024", end: "الآن", bullets: [],
  });
  st.suggestions = [newItem({ section: "experience", type: "duty", text: "Operated CT scanners to protocol", roleId: "r1" })];
  const r = confirmItem(st, st.suggestions[0].id);
  const lines = rolesToLines(r.state.profile.roles);
  ok("the department reaches the header", lines[0].includes("Radiographer, CT"), lines[0]);
  ok("the employer and period are intact", lines[0].includes("Dallah") && lines[0].includes("Sep 2024"), lines[0]);
  ok("the duty is dashed under it", lines[1].startsWith("- Operated CT"), lines[1]);
}

/* ── normalization so one skill is not two ── */
{
  ok("case and punctuation collapse", normalizeLabel("CT-Scan") === normalizeLabel("ct scan"));
  ok("Arabic orthography collapses", normalizeLabel("أشعة") === normalizeLabel("اشعه"));
  let st = base();
  st.profile.skills = "CT Scan";
  st.suggestions = [newItem({ section: "skills", type: "skill", text: "ct scan" })];
  const r = confirmItem(st, st.suggestions[0].id);
  eq("confirming a duplicate skill does not double it", r.state.profile.skills, "CT Scan");
}

/* ══════════ THE MANDATED RADIOLOGY TECHNOLOGIST CASE ══════════
 * Confirmed: X-ray, CT, PACS, BLS. Suggested only: MRI, SCFHS, RSO.
 * The finished CV must contain the first set and none of the second.
 */
{
  let st = base();
  st.target = { ...st.target, title: "Radiology Technologist", language: "en" };
  st.profile.role = "Radiology Technologist";
  st.profile.name = "Abdulaziz Alenzi";
  st.profile.contact = "0581453234 | a@b.com";
  st.profile.roles = upsertRole([], {
    id: "r1", title: "Radiology Technologist", company: "Dallah Hospital",
    location: "Riyadh", start: "Sep 2024", end: "Present", bullets: [],
  });

  const stamp = 1;
  st.suggestions = [
    newItem({ section: "skills", type: "skill", text: "General X-ray", createdAt: stamp, group: "Modalities" }),
    newItem({ section: "skills", type: "skill", text: "Computed Tomography", createdAt: stamp, group: "Modalities" }),
    newItem({ section: "skills", type: "skill", text: "Magnetic Resonance Imaging", createdAt: stamp, group: "Modalities" }),
    newItem({ section: "skills", type: "skill", text: "PACS", createdAt: stamp, group: "Systems" }),
    newItem({ section: "experience", type: "duty", roleId: "r1", createdAt: stamp,
      text: "Performed diagnostic X-ray and CT examinations to approved clinical protocols" }),
    newItem({ section: "experience", type: "duty", roleId: "r1", createdAt: stamp,
      text: "Managed imaging studies and documentation through PACS" }),
  ];

  // The user confirms only what they actually do.
  for (const want of ["General X-ray", "Computed Tomography", "PACS"]) {
    const it = st.suggestions.find((i) => i.text === want);
    st = confirmItem(st, it.id).state;
  }
  for (const it of st.suggestions.filter((i) => i.type === "duty").slice()) {
    st = confirmItem(st, it.id).state;
  }
  // BLS is confirmed as a credential; SCFHS and RSO are offered and left alone.
  st.credentials = [
    { id: "c1", kind: "certification", title: "Basic Life Support (BLS)", issuer: "National CPR Foundation",
      issueDate: "2026-05", expiryDate: "2028-05", status: "confirmed", source: "user" },
    { id: "c2", kind: "registration", title: "SCFHS Professional Registration", issuer: "SCFHS",
      issueDate: "", expiryDate: "", status: "suggested", source: "ai" },
    { id: "c3", kind: "certification", title: "Radiation Protection Officer (RSO)", issuer: "",
      issueDate: "", expiryDate: "", status: "suggested", source: "ai" },
  ];
  st.profile.certifications = st.credentials
    .filter((c) => c.status === "confirmed")
    .map((c) => [c.title, c.issuer, c.expiryDate && `valid to ${c.expiryDate}`].filter(Boolean).join(" — "))
    .join("\n");
  st.languages = [
    { id: "l1", name: "Arabic", level: "native", status: "confirmed", source: "user" },
    { id: "l2", name: "English", level: "professional", status: "confirmed", source: "user" },
  ];
  st.profile.languages = st.languages.filter((l) => l.status === "confirmed" && l.level)
    .map((l) => `${l.name} (${l.level})`).join(", ");

  const cv = assembleResume(st.profile, false);

  ok("X-ray is on the CV", /X-ray/i.test(cv));
  ok("CT is on the CV", /Computed Tomography|\bCT\b/.test(cv));
  ok("PACS is on the CV", /PACS/.test(cv));
  ok("BLS is on the CV", /Basic Life Support/.test(cv));
  ok("Arabic is native, English is professional — not defaulted to fluent",
    /Arabic \(native\)/.test(cv) && /English \(professional\)/.test(cv) && !/fluent/i.test(cv));

  ok("MRI is NOT on the CV", !/Magnetic Resonance|\bMRI\b/.test(cv), cv.match(/.{0,30}MRI.{0,30}/)?.[0]);
  ok("SCFHS is NOT on the CV", !/SCFHS/.test(cv));
  ok("RSO is NOT on the CV", !/Radiation Protection Officer|\bRSO\b/.test(cv));
  ok("the misspelling SCAFACH appears nowhere", !/SCAFACH/i.test(cv));

  ok("no invented percentage", !/%|٪/.test(cv), cv.match(/.{0,30}%.{0,30}/)?.[0]);
  ok("no invented examination volume", !/\b\d{2,}\s*(exam|case|patient|study)/i.test(cv));

  ok("MRI is still offered, just not claimed",
    st.suggestions.some((i) => /Magnetic/.test(i.text) && i.status === "suggested"));
  ok("the CV still knows it has unconfirmed suggestions", hasUnconfirmed(st));

  const jobs = rolesToLines(st.profile.roles).filter((l) => !/^[-•]/.test(l));
  eq("one employer, one job entry", jobs.length, 1);
}

/* ── the summary: one field, three candidates, and a basis that can go stale ── */
{
  const roleAt = (title, company, bullets) => ({
    id: `r_${title}`, title, company, location: "", department: "",
    start: "Jan 2020", end: "Present", bullets,
  });

  let st = base();
  st.profile.role = "Radiology Technologist";
  st.profile.roles = [roleAt("Radiographer", "Dallah", ["Performed CT examinations"])];

  // Three variants offered at once. The UI shows one at a time; the bag holds all.
  const variants = ["concise version", "professional version", "achievement version"]
    .map((text, i) => newItem({
      section: "summary", type: "summary", text,
      group: ["concise", "professional", "achievement"][i],
    }));
  st.suggestions = variants;

  ok("no variant is on the CV before one is chosen",
    !assembleResume(st.profile, false).includes("version"));
  eq("all three are pending", pending(st, "summary").length, 3);

  // Confirming a summary REPLACES rather than appends — it is one field.
  const first = confirmItem(st, variants[1].id).state;
  ok("the chosen variant is the summary", first.profile.summary === "professional version");
  const second = confirmItem(
    { ...first, suggestions: [newItem({ section: "summary", type: "summary", text: "a rewrite" })] },
    "x",
  );
  ok("an unknown id changes nothing", second.state.profile.summary === "professional version");

  const written = summaryBasis(first.profile);
  ok("the basis is not the summary text itself", !written.includes("professional version"));

  // Rewording a bullet does NOT invalidate the summary: a digest that moved on every
  // keystroke would train the user to ignore the stale notice.
  const reworded = { ...first.profile, roles: [roleAt("Radiographer", "Dallah", ["Performed CT scans"])] };
  eq("rewording a duty leaves the basis alone", summaryBasis(reworded), written);

  // Gaining a whole responsibility, a new job, or a skill DOES.
  const gained = { ...first.profile, roles: [roleAt("Radiographer", "Dallah", ["Performed CT examinations", "Operated PACS"])] };
  ok("adding a responsibility moves the basis", summaryBasis(gained) !== written);

  const hired = { ...first.profile, roles: [...first.profile.roles, roleAt("Senior Radiographer", "KFSH", [])] };
  ok("adding a job moves the basis", summaryBasis(hired) !== written);

  const skilled = { ...first.profile, skills: "CT، PACS" };
  ok("adding skills moves the basis", summaryBasis(skilled) !== written);
}


/* ── the document's language is not the interface's ── */
{
  // The bug this pins was found by driving the Arabic interface in a real browser:
  // an English CV came back with 56 Arabic characters on it, because the role pack,
  // the credential titles and the proficiency words were all being chosen by the
  // language of the UI. cvLang() is the single answer to "which language is the
  // DOCUMENT in", and every string bound for the resume has to ask it.
  eq("an Arabic CV is Arabic", cvLang({ language: "ar" }), "ar");
  eq("an English CV is English", cvLang({ language: "en" }), "en");
  eq("both means English, matching the preview's direction", cvLang({ language: "both" }), "en");

  ok("a level is published as a word, not as the stored key",
    levelWord("native", "en") === "Native" && levelWord("native", "ar") === "اللغة الأم");
  ok("and never as the English key on an Arabic CV", !/native/i.test(levelWord("native", "ar")));
  ok("expiry is phrased in the CV's language",
    validToWord("en") === "valid to" && !/valid/i.test(validToWord("ar")));
}


/* ── the skill cap must block, never silently discard — same rule as the bullet cap ── */
{
  // Twelve confirmed skills, then a thirteenth chip. The old shape pushed and then
  // `slice(0, 12)`-ed — the newest skill vanished while its chip still left the bag,
  // so the user's click looked like it worked and did nothing.
  let st = base();
  st.profile.skills = Array.from({ length: 12 }, (_, i) => `Skill ${i + 1}`).join("، ");
  const extra = newItem({ section: "skills", type: "skill", text: "Skill 13", createdAt: 1 });
  st.suggestions = [extra];
  const r = confirmItem(st, extra.id);
  eq("confirming a 13th skill is blocked, not swallowed", r.blocked, "skill-cap");
  ok("the chip stays in the bag so the state of the world is visible",
    r.state.suggestions.some((i) => i.id === extra.id));
  ok("the twelve on the CV are untouched",
    r.state.profile.skills.split("، ").length === 12);

  // A duplicate of a skill already on the CV is NOT blocked at the cap — it adds
  // nothing, so it only clears the chip. That distinction is what makes the block
  // honest rather than a blanket refusal.
  let st2 = base();
  st2.profile.skills = Array.from({ length: 12 }, (_, i) => `Skill ${i + 1}`).join("، ");
  const dup = newItem({ section: "skills", type: "skill", text: "Skill 3", createdAt: 1 });
  st2.suggestions = [dup];
  const r2 = confirmItem(st2, dup.id);
  ok("a duplicate at the cap just clears its chip", !r2.blocked
    && !r2.state.suggestions.some((i) => i.id === dup.id)
    && r2.state.profile.skills.split(/[,،]/).length === 12);

  /*
   * ── the separator follows the CV's language ──
   *
   * `confirmItem` joined skills with the Arabic comma unconditionally, so an all-English CV came
   * out as "General X-ray، Computed Tomography". That is wrong to read, and it was also expensive:
   * `hasArabic` matched U+060C, `pdfRefusesArabic` agreed, and the design step REMOVED the plain
   * ATS PDF download from every English CV with two or more skills — while printing "an Arabic CV
   * downloads as Word" over a document containing no Arabic at all.
   *
   * Split on either mark above, because the point of this pair is that the two differ.
   */
  {
    const en = base();          // EMPTY_BUILDER.target.language is "en"
    en.profile.skills = "General X-ray";
    const s2 = newItem({ section: "skills", type: "skill", text: "Computed Tomography", createdAt: 1 });
    en.suggestions = [s2];
    const got = confirmItem(en, s2.id).state.profile.skills;
    eq("an English CV separates skills with a Latin comma", got, "General X-ray, Computed Tomography");

    const arSt = { ...base(), target: { ...base().target, language: "ar" } };
    arSt.profile.skills = "أشعة عامة";
    const s3 = newItem({ section: "skills", type: "skill", text: "التصوير المقطعي", createdAt: 1 });
    arSt.suggestions = [s3];
    const gotAr = confirmItem(arSt, s3.id).state.profile.skills;
    eq("an Arabic CV keeps the Arabic comma", gotAr, "أشعة عامة، التصوير المقطعي");
  }
}

/* ── a confirmed duty lands on the role its id names, not the first jobKey match ── */
{
  // Two stints at the same employer under the same title — a return to Hospital X.
  // The old path resolved the role by id and then wrote through `upsertRole`, which
  // re-resolves by title+company and takes the FIRST match: the duty landed on the
  // 2015 stint and, with replace=true, swapped that stint's own bullets for the
  // 2020 stint's set. One confirm corrupted two roles.
  let st = base();
  st.profile.roles = [
    { id: "r_old", title: "Radiographer", company: "Hospital X", location: "", department: "",
      start: "2015", end: "2018", bullets: ["Old duty A", "Old duty B"] },
    { id: "r_new", title: "Radiographer", company: "Hospital X", location: "", department: "",
      start: "2020", end: "Present", bullets: ["New duty A"] },
  ];
  const duty = newItem({ section: "experience", type: "duty", roleId: "r_new",
    text: "Calibrated the new CT scanner", createdAt: 1 });
  st.suggestions = [duty];
  const r = confirmItem(st, duty.id);
  const oldRole = r.state.profile.roles.find((x) => x.id === "r_old");
  const newRole = r.state.profile.roles.find((x) => x.id === "r_new");
  eq("the earlier stint keeps its own bullets", oldRole.bullets, ["Old duty A", "Old duty B"]);
  eq("the duty lands on the stint the suggestion names", newRole.bullets,
    ["New duty A", "Calibrated the new CT scanner"]);
  ok("both stints keep distinct ids", oldRole.id !== newRole.id);
  ok("the woven lines carry the new duty",
    r.state.profile.wovenLines.some((l) => l.includes("Calibrated the new CT scanner")));
}

/* ── ids stay unique across page loads ── */
{
  // The counter alone resets with the module, while the DOCUMENT is persisted and
  // re-hydrated: session 1's first role and session 2's first role both got `r_1_1`,
  // and every id-addressed action then patched or deleted BOTH. A second module
  // instance (same file, cache-busted) simulates the reload exactly.
  const again = await import("../app/lib/builderDoc.ts?reload=1");
  const a = (await import("../app/lib/builderDoc.ts")).newId("r");
  const b = again.newId("r");
  ok("the same first call in two sessions yields two different ids", a !== b, `both ${a}`);
}

/* ── the reducer's two suggestion-bag rules, asserted against source ── */
{
  /*
   * `builderState.ts` imports through the `@/` alias, which Node cannot resolve, so this suite
   * cannot call the reducer — the same constraint `ops/isolation.test.mjs` works under for
   * `BuilderProvider`. Source assertions are weaker than behaviour and are said to be: they pin the
   * MECHANISM, and the browser pass is what confirms the effect.
   *
   * Rule 1 — `seed` deduped against the suggestion BAG only, and a confirmed item has LEFT the bag
   * (`confirmItem` removes it). So every cold load of a pack-titled resume re-offered the skills the
   * user had already accepted: confirm 5 of 23, reject the rest, reload, and 5 chips are back — and
   * the review raised a critical "Review 5 pending suggestions" counting items printed in the CV's
   * own SKILLS line, which could not be cleared by accepting them because they were accepted.
   *
   * Rule 2 — a CV-LANGUAGE change now retires unanswered pack chips, as a title change already did.
   * Without it, switching mid-build left 46 items in the bag: the same 23 skills in two scripts, one
   * tap away from putting Arabic text into an English CV.
   */
  const { readFileSync } = await import("node:fs");
  const code = readFileSync("app/components/build/builderState.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  ok("seed dedupes against the skills already on the CV", /const onCv = String\(s\.profile\.skills/.test(code));
  ok("using the same normalizer confirmItem compares with",
    /onCv[\s\S]{0,200}normalizeLabel\(/.test(code));
  ok("and both sets feed one lookup", /new Set\(\[\.\.\.s\.suggestions\.map\(\(i\) => i\.normalized\), \.\.\.onCv\]\)/.test(code));

  ok("a CV-language change is recognised", /const relanguaged = a\.patch\.language !== undefined/.test(code));
  ok("and retires unanswered pack chips with a retitle",
    /\(retitled \|\| relanguaged\)[\s\S]{0,160}source === "occupation" && i\.status === "suggested"/.test(code));
  /* A rejection must survive so a re-seed cannot re-offer refused text — the filter keeps anything
     that is not BOTH pack-sourced AND still unanswered. */
  ok("so a rejected chip is kept", /filter\(\(i\) => !\(i\.source === "occupation" && i\.status === "suggested"\)\)/.test(code));

  /*
   * ── the import filled everything except the one field the rest of the builder is keyed on ──
   *
   * Reported as "I upload a CV and the data disappears". Reproduced: the importer reads two
   * positions, education, contact, skills and languages, and the product then lands the user on
   * step 1 of 11 — "The job you are aiming for" — with every field empty and a 0/11 progress bar.
   * Nothing on that screen said an import had happened, because `ImportPanel`'s own "Brought
   * across" message renders in a component the same tick navigates away from.
   *
   * It compounded through `stepReady`, which keys on `target.title`: Skills, Summary and Review
   * each then announced "the job title you are aiming for is missing". Four screens told someone
   * who had just uploaded a complete CV that they had entered nothing.
   */
  ok("the import carries the CV's own most recent job title into the target",
    /const target = \{ \.\.\.s\.target, title: keep\(s\.target\.title, cv\.roles\[0\]\?\.title \|\| ""\) \}/.test(code));
  ok("through the same keep() the name and phone use — what the user typed still wins",
    /const keep = \(mine: string, theirs: string\) => mine\.trim\(\) \|\| theirs\.trim\(\)/.test(code));
  ok("and it is actually committed to the next state", /entry: "upload",\s*target,/.test(code));
  /* The target EMPLOYER is who they are applying TO. Carrying the last employer into it would be
     the same-shaped field with the opposite meaning, and would read as an invented fact. */
  ok("but the target employer is left alone", !/employer: keep\(/.test(code));

  const form = readFileSync("app/components/build/FormSections.tsx", "utf8");
  ok("the target step shows a receipt for what the upload brought", /<ImportedReceipt lang=\{p\.lang\} state=\{p\.state\} \/>/.test(form));
  ok("only after an upload", /if \(state\.entry !== "upload"/.test(form));
  ok("only until the step is completed", /state\.sectionsDone\.includes\("target"\)/.test(form));
  ok("and never for an import that read nothing", /\|\| !anything\) return null/.test(form));
  /* Counts, not a checkmark: "we read your file" is not the claim in doubt. */
  ok("it counts what arrived rather than congratulating itself",
    /positions/.test(form) && /skills/.test(form) && /education/.test(form) && /وظائف/.test(form));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
