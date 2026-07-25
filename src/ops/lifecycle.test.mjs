/**
 * The builder's states, and the one of them that protects a CV.
 *
 * The indicator shipped with four values — "", saving, saved, failed — derived from whether the last
 * write matched the current state. It answered one question. Three were being asked:
 *
 *   · is there anything on screen yet, or is a step about to announce an unread draft as empty
 *   · is a stored draft from an older schema being brought forward
 *   · is the stored draft UNREADABLE
 *
 * The third had no state at all, and it was the dangerous one. `readDraft` caught its own
 * `JSON.parse` failure and returned an empty profile, so a corrupted draft was indistinguishable
 * from a new visitor — and the autosave then overwrote the damaged blob 450ms later. Silent, and
 * the destroyed thing was the only copy of the user's CV.
 *
 * So these tests are mostly about `invalidResume`: that it exists, that it forbids writing, that it
 * outranks every other state, and that the wreckage is kept where a human can get at it.
 *
 *   node --experimental-strip-types ops/lifecycle.test.mjs
 */

import {
  LIFECYCLE_STATES, isReading, mayWrite, lifecycleLabel, lifecycleTone,
} from "../app/lib/lifecycle.ts";
import { readDraft, writeDraft, draftKey, damagedKey, readBuilder } from "../app/lib/draftStore.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ─────────────────────────── the enum itself ─────────────────────────── */

ok("every state the brief asked for exists", LIFECYCLE_STATES.length === 9);
for (const want of [
  "uninitialized", "loading", "migrating", "hydrated",
  "editing", "saving", "saved", "saveError", "invalidResume",
]) {
  ok(`"${want}" is a state`, LIFECYCLE_STATES.includes(want));
}

/*
 * Writing is the question that matters, so it is asked of every state rather than of the two the
 * implementation happens to check. A state added later that silently permits writing over an
 * unreadable draft is exactly the regression this file exists to catch.
 */
for (const l of LIFECYCLE_STATES) {
  const expected = !["uninitialized", "loading", "migrating", "invalidResume"].includes(l);
  ok(`${l}: writing is ${expected ? "allowed" : "held"}`, mayWrite(l) === expected);
}
ok("the three reading states are the ones that block a conclusion about the data",
  LIFECYCLE_STATES.filter(isReading).join(",") === "uninitialized,loading,migrating");

/* ───────────────────────────── the wording ───────────────────────────── */

for (const lang of ["en", "ar"]) {
  /* Silence is deliberate for three of them: a reader who has just opened a page does not need to
     be told it opened, and narrating every state is how a status line stops being read. */
  const quiet = LIFECYCLE_STATES.filter((l) => !lifecycleLabel(l, lang));
  ok(`${lang}: only the states with nothing to say are silent`,
    quiet.join(",") === "uninitialized,loading,hydrated", quiet.join(","));

  const speaking = LIFECYCLE_STATES.filter((l) => lifecycleLabel(l, lang));
  ok(`${lang}: every other state has a sentence`, speaking.length === 6);
}

/* The Arabic side must be Arabic. A `Record` with a missing key returns undefined, and a fallback
   then answers in English — the failure this repo has shipped more than once. */
for (const l of LIFECYCLE_STATES) {
  const ar = lifecycleLabel(l, "ar");
  if (!ar) continue;
  ok(`the Arabic sentence for ${l} is Arabic`, /[؀-ۿ]/.test(ar) && !/[A-Za-z]{3,}/.test(ar), ar);
}

ok("an unreadable draft is the only error tone", lifecycleTone("invalidResume") === "error");
ok("a failed write is a warning, not an error — the work is still on screen",
  lifecycleTone("saveError") === "warn");
ok("everything else is quiet",
  LIFECYCLE_STATES.filter((l) => lifecycleTone(l) === "quiet").length === 7);

/* ────────────────── the damaged draft, end to end in storage ────────────────── */

/**
 * A `localStorage` good enough for the two functions under test. Reproduced rather than imported
 * because the alternative is a browser, and what is being tested here is a decision about bytes.
 */
function fakeStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
  return map;
}

{
  const store = fakeStorage();

  /* A healthy draft first, to be sure the flag is not simply always on. */
  writeDraft("en", { resumeId: "r1", profile: { role: "Radiographer" } });
  ok("a readable draft is not reported as damaged", readDraft("en").damaged === undefined);
  ok("and readBuilder agrees", readBuilder("en").damaged === false);

  /* Now the real case: something is there, and it is not JSON. Truncation mid-write is the usual
     cause — a tab killed by iOS while the string was being stored. */
  store.set(draftKey("en"), '{"resumeId":"r1","profile":{"role":"Radiog');

  const d = readDraft("en");
  ok("an unparseable draft is reported", d.damaged === true);
  ok("and it does not pretend to have content", !d.profile.role);
  ok("readBuilder passes the flag up", readBuilder("en").damaged === true);

  /*
   * THE ASSERTION. The bytes are still somewhere. Recovering a CV is then a support conversation;
   * without this it is an apology.
   */
  const kept = store.get(damagedKey("en"));
  ok("the wreckage is kept under its own key", typeof kept === "string" && kept.includes("Radiog"));
  ok("and the damaged key is not the live key", damagedKey("en") !== draftKey("en"));

  /* And it is never read back automatically — an automatic recovery would be guessing at the shape
     of something that already failed to parse. */
  ok("the damaged copy is not resurrected as the draft", readDraft("en").profile.role === "");
}

{
  /* Storage that throws on read — private mode, or a policy. Nothing is damaged; there is simply
     nothing to read, and the builder works in memory. Reporting THIS as damage would hold every
     write for a user whose draft was never at risk. */
  globalThis.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => {},
    clear: () => {},
  };
  const d = readDraft("ar");
  ok("blocked storage is not damage", d.damaged === undefined);
  ok("and still returns a usable empty profile", typeof d.profile === "object");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
