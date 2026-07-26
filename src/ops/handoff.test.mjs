/**
 * The optimizer's output reaches the builder as a document, not as a dead string.
 *
 * `/optimize` used to end at two download buttons: a score, a rewritten paragraph and no
 * way to edit a single section, because the flow never produced sections. These tests
 * cover the two decisions in the hand-off that are easy to get wrong and impossible to
 * see: WHICH text crosses over, and what state it arrives in.
 *
 *   node --experimental-strip-types src/ops/handoff.test.mjs
 */

/*
 * `handoff.ts` writes through `resumeStore`, which reads `window.localStorage` at call time — so the
 * fakes are installed BEFORE the module graph is imported. Both stores, because `writeResume` stamps
 * the visit marker in `sessionStorage` and `resumesInProgress` is gated on it downstream.
 */
class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
}
globalThis.window = { localStorage: new FakeStorage(), sessionStorage: new FakeStorage() };
const store = globalThis.window.localStorage;

import { stateFromText } from "../app/lib/scoreText.ts";
import { assembleResume } from "../app/lib/mergeProfile.ts";
import { hasUnconfirmed } from "../app/lib/builderDoc.ts";
import { resumesInProgress, sendToBuilder } from "../app/lib/handoff.ts";
import { listResumes, newResumeId, ownerKey, readResume, writeResume } from "../app/lib/resumeStore.ts";
import { readFileSync, readdirSync } from "node:fs";

/** Comments out, so a docstring naming what was removed does not read as the thing still being there. */
const strip0 = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const UPLOADED = `Abdulaziz Alanazi
Riyadh | +966 581 453 234 | a@example.com

WORK EXPERIENCE
Radiographer — Dallah Hospital | Sep 2024 - Present
- Performed CT examinations following departmental protocols
- Operated PACS to store and retrieve diagnostic images

EDUCATION
Bachelor of Radiologic Technology — King Saud University, 2020

SKILLS
Computed Tomography, PACS, Radiation Protection
`;

/* ── what crosses over arrives as the user's own confirmed facts ── */
{
  const st = stateFromText(UPLOADED, "Senior Radiographer. Required: CT, PACS.");

  eq("the employer crosses", st.profile.roles[0].company, "Dallah Hospital");
  eq("with its dates", [st.profile.roles[0].start, st.profile.roles[0].end], ["Sep 2024", "Present"]);
  eq("both duties cross", st.profile.roles[0].bullets.length, 2);
  ok("education crosses", st.profile.education.includes("King Saud University"));
  ok("skills cross", st.profile.skills.includes("PACS"));
  ok("contact crosses", st.profile.contact.includes("a@example.com"));
  ok("the advert crosses, so the builder can score a match", st.target.jobAdText.includes("PACS"));

  // A resume the user already had is theirs. Arriving as pending suggestions would make
  // them re-approve their own employer, and would leave the review reporting
  // "unconfirmed AI content" about facts no AI wrote.
  ok("nothing arrives as an unconfirmed suggestion", !hasUnconfirmed(st));
  eq("and the suggestion bag is empty", st.suggestions.length, 0);

  // The invariant still holds from the other side: what is in `profile` renders.
  const cv = assembleResume(st.profile, false);
  ok("so the imported CV renders immediately", cv.includes("Dallah Hospital") && cv.includes("PACS"));
}

/* ── the model's rewrite is NOT what crosses by default ── */
{
  // This is the rule the callers implement: they pass `resume` (the upload), not
  // `result.optimizedResume`. The test states why, so a future edit that "helpfully"
  // switches to the rewrite has to argue with it.
  //
  // A rewrite is the model's phrasing of the user's facts. The builder's contract is that
  // model wording arrives as a suggestion to accept; installing it as confirmed content
  // would launder it into fact — the exact failure the whole suggestion bag exists to
  // prevent.
  const rewritten = UPLOADED.replace(
    "Performed CT examinations following departmental protocols",
    "Delivered high-throughput CT imaging aligned to departmental protocols",
  );
  const fromUpload = stateFromText(UPLOADED);
  const fromRewrite = stateFromText(rewritten);
  ok("the two texts genuinely differ",
    fromUpload.profile.roles[0].bullets[0] !== fromRewrite.profile.roles[0].bullets[0]);
  ok("the upload keeps the user's own words",
    fromUpload.profile.roles[0].bullets[0].startsWith("Performed CT"));
}

/* ── an unusable input hands over nothing rather than an empty document ── */
{
  const empty = stateFromText("");
  eq("no roles", empty.profile.roles.length, 0);
  eq("no name", empty.profile.name, "");
  // The callers guard on this: `if (!text) return;` — a hand-off of nothing would
  // overwrite a real draft with a blank one.
  ok("so callers can detect there is nothing to send", !empty.profile.roles.length && !empty.profile.name);
}

/* ══════════════════════════════════════════════════════════════════════════════════════
 * THE TRANSPORT — measured broken in a browser, then replaced
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The hand-off used to write `ra_journey_{lang}` and navigate to `/builder`. That key is the OLD
 * single-slot scheme; `resumeStore` reads it exactly once per (owner, language) through
 * `migrateLegacy` and renames it on the way past. Driven against the real pages, that produced:
 *
 *   - every hand-off consumed the one-shot migration and left `ra_journey_en_legacy` behind
 *   - the "you already have work in the builder" confirm NEVER fired, because it asked the retired
 *     key — measured with three completed builder steps on screen
 *   - the start screen then showed the scan as the one CV in progress, and the user's own CV was
 *     nowhere on it
 *   - the owner was never passed; the migration guessed it from whoever was signed in
 *
 * These assertions are what stop each of those coming back.
 */

const OWNER = ownerKey("ahmed@example.com");
const OTHER = ownerKey("badr@example.com");

const reset = () => { store.clear(); globalThis.window.sessionStorage.clear(); };

console.log("\n── the hand-off writes a real record, not the retired key ──");
reset();
{
  const to = sendToBuilder(OWNER, "en", UPLOADED, { jobAd: "CT and PACS required." });

  ok("nothing was written to the retired key", store.getItem("ra_journey_en") === null,
    "a live write path pointing at a key the read path calls legacy is the whole of O-9");
  ok("and no migration was consumed", store.getItem("ra_journey_en_legacy") === null,
    "`migrateLegacy` runs once per owner and language — it is an upgrade path, not a bridge");

  const list = listResumes(OWNER);
  eq("one resume exists for this owner", list.length, 1);
  const id = list[0].resumeId;
  ok("the URL points AT it, not at the front door", to === `/builder/${id}/target`, to);

  const rec = readResume(OWNER, id).record;
  ok("the record is readable under this owner", Boolean(rec));
  eq("with the CV's content", rec.state.profile.roles[0].company, "Dallah Hospital");
  eq("and the advert", rec.state.target.jobAdText, "CT and PACS required.");
  eq("marked as an upload", rec.state.entry, "upload");
  ok("another account sees nothing", listResumes(OTHER).length === 0,
    "the previous transport wrote an unowned key and let the migration guess the owner");
}

console.log("\n── the CV's language, which the old bridge dropped ──");
reset();
{
  /* `stateFromText` leaves `target.language` at the schema default of English. On `/optimize` the
     user picks the document's language explicitly on step 3, and before this it was discarded — so a
     hand-off of an Arabic CV opened an English builder and every later suggestion came back English. */
  eq("the default really is English", stateFromText(UPLOADED).target.language, "en");

  sendToBuilder(OWNER, "en", UPLOADED, { cvLang: "ar" });
  const id = listResumes(OWNER)[0].resumeId;
  eq("an Arabic document opens as Arabic even from the English page",
    readResume(OWNER, id).record.state.target.language, "ar");

  reset();
  /* And the mirror: the Arabic page handing over an English CV. */
  sendToBuilder(OWNER, "ar", UPLOADED, { cvLang: "en" });
  const id2 = listResumes(OWNER)[0].resumeId;
  eq("an English document stays English on the Arabic page",
    readResume(OWNER, id2).record.state.target.language, "en");
  ok("while the record's own lang follows the INTERFACE", readResume(OWNER, id2).record.lang === "ar",
    "the two are different facts, and conflating them is the bug this product has paid for repeatedly");
}

console.log("\n── adding never overwrites; replacing is explicit ──");
reset();
{
  const mine = newResumeId(1000);
  writeResume(OWNER, mine, "en", { ...stateFromText("Accountant\nAlmarai | 2014 - 2024\n- Closed the books.\n"), target: { ...stateFromText("x").target, title: "Accountant" } });
  eq("the user has one CV to begin with", listResumes(OWNER).length, 1);

  sendToBuilder(OWNER, "en", UPLOADED);
  eq("a hand-off ADDS rather than replaces", listResumes(OWNER).length, 2);
  eq("and the user's own CV is untouched",
    readResume(OWNER, mine).record.state.target.title, "Accountant");

  /* The explicit branch, and it must name an id the caller already had. */
  sendToBuilder(OWNER, "en", UPLOADED, { replace: mine });
  eq("replacing does not create a third", listResumes(OWNER).length, 2);
  ok("and the named record now holds the scan",
    readResume(OWNER, mine).record.state.profile.roles[0].company === "Dallah Hospital");
}

console.log("\n── what the caller is told about, instead of a dialog that could not fire ──");
reset();
{
  eq("an unresolved session reports nothing", resumesInProgress("").length, 0);
  eq("an owner with nothing reports nothing", resumesInProgress(OWNER).length, 0);

  const a = newResumeId(1000);
  writeResume(OWNER, a, "en", { ...stateFromText("x"), target: { ...stateFromText("x").target, title: "Accountant" } }, { now: 5000 });
  const b = newResumeId(2000);
  writeResume(OWNER, b, "en", { ...stateFromText("x"), target: { ...stateFromText("x").target, title: "Radiographer" } }, { now: 9000 });

  const rows = resumesInProgress(OWNER);
  eq("both are reported", rows.length, 2);
  eq("newest first, so the caller can name the likely one", rows[0].title, "Radiographer");
  ok("each carries the id the `replace` branch needs", rows.every((r) => Boolean(r.resumeId)));
  ok("and it reads the LIVE store, not the legacy key",
    resumesInProgress(OTHER).length === 0 && rows.length === 2);
}

console.log("\n── the retired key now has no live writer ──");
{
  /*
   * The point of the item, asserted against the source rather than against behaviour: `draftStore`
   * still READS `ra_journey_*`, because a chat draft written before this change is somebody's CV.
   * What must not exist is another live WRITE path into it — that is what "do not leave both
   * persistences active" asks for.
   */
  /*
   * Scanned across the whole app rather than at three named files. Naming the files is what lets a
   * fourth one appear: this is the assertion that `ra_journey_*` has NO live writer anywhere, which
   * is the actual end state the item asks for. `draftStore.ts` itself is excluded — it owns the key,
   * and `readDraft` must keep working for chat drafts written before this change.
   */
  const appFiles = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) appFiles.push(full);
    }
  };
  walk(new URL("../app", import.meta.url).pathname);
  const offenders = appFiles.filter((f) =>
    !f.endsWith("lib/draftStore.ts") && /\bwriteDraft\(/.test(strip0(readFileSync(f, "utf8"))));
  ok("no file outside draftStore writes the retired draft slot", offenders.length === 0,
    offenders.map((f) => f.split("/app/")[1]).join(", "));
  ok("and the scan actually looked at the app", appFiles.length > 100, String(appFiles.length));
  /*
   * Comments stripped first. Both of the next two assertions failed on their first run against the
   * raw file — matching this module's own docstring, which NAMES what it replaced. A test that reads
   * prose as code is a test that can only be satisfied by not explaining yourself.
   */
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const hand = strip(readFileSync(new URL("../app/lib/handoff.ts", import.meta.url), "utf8"));
  ok("the hand-off does not touch draftStore at all", !/draftStore/.test(hand));
  ok("it writes through the live store", /writeResume\(/.test(hand));
  ok("and the dead `builderDraftExists` is gone", !/builderDraftExists/.test(hand));

  /* The start screen has to be able to SHOW a second resume, or adding one hides it. Every
     consumer of the index took `[0]` until this change. */
  const start = readFileSync(new URL("../app/components/build/BuilderStart.tsx", import.meta.url), "utf8");
  ok("the start screen lists the owner's resumes", /listResumes\(owner\)\.map/.test(start),
    "a CV that cannot be reached is not a CV that was added");
  ok("and gates that list on the visit rule", /mayRestore\(owner\)/.test(start));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
