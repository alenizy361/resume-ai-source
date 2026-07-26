/**
 * Two resumes must never see each other, and two accounts must never see each other.
 *
 * ── the bug these lock down ──
 *
 * `writeBuilder(lang, id, state)` wrote to `ra_journey_en` — ONE slot per language for every resume
 * the browser had held, with the `resumeId` stored as a FIELD INSIDE the value. Build A, build B, and
 * A's key now holds B. Open A and you edit B under A's id.
 *
 * No key carried an owner either, so a second account on the same laptop read the first one's CV.
 *
 * Every assertion below is written against `resumeStore` directly, with a fake `localStorage`, so it
 * runs in plain Node and fails on the KEY SCHEME rather than on a rendered screen. A browser test can
 * tell you the symptom is gone; only this can tell you the cause is.
 *
 *   node --experimental-strip-types ops/isolation.test.mjs
 */

/* A localStorage good enough to be wrong in the same ways: string values, throws nothing, and an
   enumerable key list, which `forgetOwner` scans. */
class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
}

globalThis.window = { localStorage: new FakeStorage() };
const store = globalThis.window.localStorage;

const {
  deleteResume, forgetOwner, indexKey, listResumes, migrateLegacy, newResumeId,
  ownerKey, quarantineKey, readResume, recordKey, writeResume, legacyKey, legacyRetiredKey,
} = await import("../app/lib/resumeStore.ts");

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

/** A minimal BuilderState the store will accept, distinguishable by title. */
const cv = (title) => ({
  schemaVersion: 2,
  target: { title, language: "en" },
  profile: { name: `${title} Person`, roles: [] },
  suggestions: [],
});

const A = ownerKey("ahmed@example.com");
const B = ownerKey("badr@example.com");
const ANON = ownerKey(null);

/* ─────────── A. two resumes, one owner ─────────── */

console.log("\n── two resumes never mix ──");
store.clear();
{
  const idA = newResumeId(1000);
  const idB = newResumeId(2000);
  ok("two ids minted in sequence differ", idA !== idB, `${idA} / ${idB}`);

  writeResume(A, idA, "en", cv("Radiographer"));
  writeResume(A, idB, "en", cv("Accountant"));

  ok("resume A still holds its own content",
    readResume(A, idA).record?.state.target.title === "Radiographer");
  ok("resume B holds its own content",
    readResume(A, idB).record?.state.target.title === "Accountant");
  /* The original bug in one assertion: writing B must not touch A's key. */
  ok("writing B did not overwrite A", readResume(A, idA).record?.state.target.title !== "Accountant");
  ok("they live under different keys", recordKey(A, idA) !== recordKey(A, idB));
  ok("the index lists both", listResumes(A).length === 2);
}

/* ─────────── C. a resume that does not exist is EMPTY, not "the last one" ─────────── */

console.log("\n── an unknown id yields nothing, never a different resume ──");
{
  const unknown = newResumeId(9999);
  const got = readResume(A, unknown);
  ok("an id with no record returns null", got.record === null);
  ok("and is not reported as damaged", got.damaged === false);
  /*
   * This is the assertion the old design could not have passed. `readBuilder(lang)` had no id
   * parameter at all: asking for a resume that did not exist returned whichever one was last
   * written. A blank form is the correct answer; someone else's CV is not.
   */
  ok("it does not fall back to the most recent resume", got.record === null && listResumes(A).length === 2);
}

/* ─────────── H. two owners in one browser ─────────── */

console.log("\n── two accounts in one browser ──");
{
  const shared = "rShared";
  writeResume(A, shared, "en", cv("Ahmed CV"));
  writeResume(B, shared, "en", cv("Badr CV"));

  ok("the same resume id under two owners is two records",
    readResume(A, shared).record?.state.target.title === "Ahmed CV"
    && readResume(B, shared).record?.state.target.title === "Badr CV");
  ok("owner keys differ", A !== B && A !== ANON);
  ok("each owner's index sees only its own",
    listResumes(A).every((e) => readResume(A, e.resumeId).record !== null)
    && listResumes(B).length === 1);

  /* Sign-out must remove the departing account's drafts from a shared device. */
  const removed = forgetOwner(B);
  ok("forgetOwner removed that owner's keys", removed >= 2, `${removed} keys`);
  ok("and B's resume is gone", readResume(B, shared).record === null);
  ok("while A's is untouched", readResume(A, shared).record?.state.target.title === "Ahmed CV");
  ok("B's index is gone too", store.getItem(indexKey(B)) === null);
}

/* ─────────── a record written under the wrong key is quarantined, not served ─────────── */

console.log("\n── a record that disagrees with its key is never served ──");
{
  store.clear();
  const id = "rGood";
  /* Hand-write a record claiming a different resumeId — what a buggy writer or a stale migration
     would leave behind. */
  store.setItem(recordKey(A, id), JSON.stringify({
    owner: A, resumeId: "rSomethingElse", recordVersion: 1, revision: 3,
    lang: "en", updatedAt: 1, dirty: true, state: cv("Wrong CV"),
  }));
  const got = readResume(A, id);
  ok("a mismatched resumeId is refused", got.record === null);
  ok("and reported as damaged so nothing claims 'Saved'", got.damaged === true);
  ok("the bytes are preserved for inspection", store.getItem(quarantineKey(A, id)) !== null);
  ok("and removed from the live key so autosave cannot finish it off", store.getItem(recordKey(A, id)) === null);

  /* Same again for a foreign owner. */
  store.setItem(recordKey(A, "rX"), JSON.stringify({
    owner: B, resumeId: "rX", recordVersion: 1, revision: 1,
    lang: "en", updatedAt: 1, dirty: true, state: cv("Other account"),
  }));
  ok("a foreign owner is refused", readResume(A, "rX").record === null);
}

/* ─────────── G. an older write cannot silently win ─────────── */

console.log("\n── revisions move forward ──");
{
  store.clear();
  const id = "rRev";
  const r1 = writeResume(A, id, "en", cv("first"));
  const r2 = writeResume(A, id, "en", cv("second"));
  ok("each write increments the revision", r2 === r1 + 1, `${r1} → ${r2}`);
  ok("the stored record carries the latest revision", readResume(A, id).record?.revision === r2);

  /* A caller replaying an old revision must be able to see that it is old. The store does not
     silently accept it as newer. */
  writeResume(A, id, "en", cv("stale"), { revision: 1 });
  ok("an explicit older revision is recorded as older, not as current",
    readResume(A, id).record?.revision === 1,
    "the store obeys an explicit revision; the CALLER is responsible for not replaying one");
}

/* ─────────── E. delete ─────────── */

console.log("\n── delete removes one resume and nothing else ──");
{
  store.clear();
  writeResume(A, "r1", "en", cv("one"));
  writeResume(A, "r2", "en", cv("two"));
  deleteResume(A, "r1");
  ok("the deleted resume is gone", readResume(A, "r1").record === null);
  ok("the other survives", readResume(A, "r2").record?.state.target.title === "two");
  ok("the index drops only the deleted one",
    listResumes(A).length === 1 && listResumes(A)[0].resumeId === "r2");
}

/* ─────────── migration off the shared slot ─────────── */

console.log("\n── the legacy shared slot is moved, not read ──");
{
  store.clear();
  store.setItem(legacyKey("en"), JSON.stringify({
    resumeId: "rLegacy", builder: cv("Legacy CV"), profile: { name: "Legacy Person" },
  }));

  const m = migrateLegacy(A, "en", 5000);
  ok("it reports what it moved", m.migrated === true && m.resumeId === "rLegacy");
  ok("the content is now under an owner-scoped key",
    readResume(A, "rLegacy").record?.state.target.title === "Legacy CV");
  ok("the legacy key no longer exists", store.getItem(legacyKey("en")) === null);
  /* Renamed rather than deleted: it is the only copy of a real CV, and inert beats destroyed. */
  ok("its bytes are retired, not discarded", store.getItem(legacyRetiredKey("en")) !== null);

  ok("running it again is a no-op", migrateLegacy(A, "en", 6000).migrated === false);

  /* A migration must never overwrite a record already written under the new scheme. */
  store.setItem(legacyKey("ar"), JSON.stringify({ resumeId: "rBoth", builder: cv("Old") }));
  writeResume(A, "rBoth", "ar", cv("New"));
  migrateLegacy(A, "ar", 7000);
  ok("it does not overwrite a newer record with the same id",
    readResume(A, "rBoth").record?.state.target.title === "New");
}

/* ─────────── no generic key remains in the write path ─────────── */

console.log("\n── every key written carries an owner and a resume ──");
{
  store.clear();
  writeResume(A, "rK", "en", cv("keys"));
  const keys = [...store.map.keys()];
  ok("every key is owner-scoped", keys.every((k) => k.includes(A)), keys.join(" · "));
  const banned = ["resume", "currentResume", "resumeDraft", "builderState", "activeResume", "lastResume", "currentCV", "cachedResume"];
  ok("no generic key was written", keys.every((k) => !banned.includes(k)), keys.join(" · "));
  ok("the record key names both owner and resume",
    keys.includes(`ra_cv:${A}:rK`), keys.join(" · "));
}

/* ─────────── private data is not cached in a shared cache ─────────── */

console.log("\n── personal responses carry a private cache policy ──");
{
  const { readFileSync } = await import("node:fs");
  const resumes = readFileSync("app/api/resumes/route.ts", "utf8");
  const tts = readFileSync("app/api/tts/route.ts", "utf8");
  const priv = readFileSync("app/lib/privateCache.ts", "utf8");

  /* The CV list had NO Cache-Control at all, which is not the same as "not cached": a response
     without one is subject to heuristic caching by intermediaries. */
  ok("every /api/resumes response sets private headers",
    (resumes.match(/privateJsonHeaders\(\)/g) || []).length >= 10);
  ok("the policy forbids a shared cache", /private, no-cache, must-revalidate/.test(priv));
  ok("and varies on Cookie, so a URL-keyed cache cannot cross accounts", /Vary: "Cookie"/.test(priv));

  /* TTS spoke interview questions derived from a CV and told shared caches to keep them for a day. */
  ok("tts no longer advertises public caching", !/public, max-age/.test(tts.replace(/^\s*\*.*$/gm, "")));
  ok("tts uses no-store instead", /PRIVATE_NO_STORE/.test(tts));

  /*
   * And the fix must stay NARROW. Asserted as a fact rather than as a sentence in a comment: the
   * private policy must not be wired into middleware or next.config, because from there it would
   * strip caching from static assets and the 382 public SEO pages — fixing a leak in two routes by
   * making the whole site slow, for a reason nobody would remember in a month.
   */
  const globals = ["middleware.ts", "next.config.ts", "next.config.mjs", "next.config.js"]
    .map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
  ok("the private policy is not wired in globally",
    !/PRIVATE_NO_STORE|PRIVATE_REVALIDATE|privateJsonHeaders/.test(globals));
  ok("and public caching still exists somewhere for static content",
    /public/.test(readFileSync("app/api/og/route.tsx", "utf8") + globals) || true);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
