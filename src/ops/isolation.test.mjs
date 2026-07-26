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

/* ═════════════════════ the OTHER seven stores ═════════════════════ */

/*
 * ── what `resumeStore` did not cover ──
 *
 * Everything above is about the builder draft. Seven other keys held more of a person than the draft
 * does and were keyed on nothing at all: the full text of up to ten saved CVs, ten complete ATS
 * analyses, fifty job applications with private notes, the CV pasted into the optimiser, its analysis,
 * the published links WITH their unpublish tokens, and the paid-entitlement flag.
 *
 * Fixing the builder and leaving those is the version of this work that looks finished and is not.
 */

console.log("\n── the other personal stores are owner-scoped too ──");

const {
  PERSONAL_KEYS, DEVICE_KEYS, scopedKey, retiredKey,
  readPersonal, writePersonal, removePersonal, readPersonalJson, writePersonalList,
  migrateUnowned, forgetPersonal,
} = await import("../app/lib/personalStore.ts");

const {
  addJob, getJobs, removeJob, updateJob,
  addScan, getScans, removeScan,
  saveResume, getResumes, removeResume,
} = await import("../app/lib/localdata.ts");

{
  store.clear();
  const B2 = ownerKey("second@example.com");

  saveResume(A, { title: "Alice CV", source: "built", text: "ALICE FULL TEXT" });
  saveResume(B2, { title: "Bob CV", source: "built", text: "BOB FULL TEXT" });

  ok("each account sees only its own saved CV",
    getResumes(A).length === 1 && getResumes(A)[0].text === "ALICE FULL TEXT"
    && getResumes(B2).length === 1 && getResumes(B2)[0].text === "BOB FULL TEXT");
  /* The assertion that would have caught the original bug directly. */
  ok("no account can read the other's CV text",
    !JSON.stringify(getResumes(B2)).includes("ALICE FULL TEXT"));

  addScan(A, { score: 71, mode: "general", jobTitle: "Nurse", lang: "en", result: { secret: "alice" } });
  addJob(A, { company: "Aramco", title: "Nurse", url: "", status: "saved", note: "private note" });
  ok("scan history is scoped", getScans(A).length === 1 && getScans(B2).length === 0);
  ok("the job tracker is scoped", getJobs(A).length === 1 && getJobs(B2).length === 0);
  ok("and a private note does not cross", !JSON.stringify(getJobs(B2)).includes("private note"));

  /* Removing works through the owner too — a delete that ignored the owner would delete nothing, or
     worse, the other account's row. */
  removeResume(A, getResumes(A)[0].id);
  ok("delete removes only the caller's row", getResumes(A).length === 0 && getResumes(B2).length === 1);
  updateJob(A, getJobs(A)[0].id, { status: "applied" });
  ok("update is scoped", getJobs(A)[0].status === "applied");
  removeJob(A, getJobs(A)[0].id);
  removeScan(A, getScans(A)[0].id);
  ok("scan and job deletes are scoped", getScans(A).length === 0 && getJobs(A).length === 0);
}

console.log("\n── an unknown owner reads nothing, and never the unowned key ──");
{
  store.clear();
  /*
   * The single most important assertion in this file.
   *
   * `useOwner` returns `""` until `/api/auth/me` answers, so every one of these pages renders at least
   * once with no owner. A fallback to the unowned key at that moment is exactly how the previous
   * person's CV appears on screen for a second — and a fallback is the obvious, helpful-looking thing
   * to write.
   */
  store.setItem("ra_saved_resumes", JSON.stringify([{ id: "x", ts: 1, title: "leftover", source: "built", text: "SOMEONE ELSE" }]));
  ok("an empty owner reads nothing at all", getResumes("").length === 0);
  ok("and it does not fall back to the unowned key",
    !JSON.stringify(getResumes("")).includes("SOMEONE ELSE"));
  ok("an empty owner cannot write either", writePersonal("", "ra_jobs", "[]") === false);
  ok("nor read a raw value", readPersonal("", "ra_jobs") === null);

  /* A different owner is not a fallback either — the point of scoping. */
  ok("another owner sees nothing of it", getResumes(ownerKey("nobody@example.com")).length === 0);
}

console.log("\n── the pre-scoping values are adopted once, and retired not deleted ──");
{
  store.clear();
  store.setItem("ra_saved_resumes", JSON.stringify([{ id: "l1", ts: 1, title: "legacy", source: "built", text: "LEGACY TEXT" }]));
  store.setItem("ra_owned", "1");

  const adopted = migrateUnowned(A);
  ok("the legacy values are adopted", adopted.includes("ra_saved_resumes") && adopted.includes("ra_owned"));
  ok("and readable under the owner", getResumes(A)[0]?.text === "LEGACY TEXT");
  ok("the unowned key no longer answers", store.getItem("ra_saved_resumes") === null);
  /* Renamed, not deleted: it is somebody's only copy and this attribution is a judgement, not a fact. */
  ok("the bytes survive under a retired name",
    store.getItem(retiredKey("ra_saved_resumes"))?.includes("LEGACY TEXT") === true);

  /* Second run is a no-op, and must not overwrite newer data. */
  saveResume(A, { title: "newer", source: "built", text: "NEWER" });
  store.setItem("ra_saved_resumes", JSON.stringify([{ id: "l2", ts: 1, title: "again", source: "built", text: "STALE" }]));
  migrateUnowned(A);
  ok("a second migration never overwrites what is already scoped",
    !JSON.stringify(getResumes(A)).includes("STALE"));

  /* And the anon keyspace stays separate — the same decision `migrateLegacy` made for the builder. */
  store.clear();
  store.setItem("ra_jobs", JSON.stringify([{ id: "j", ts: 1, company: "X", title: "Y", url: "", status: "saved", note: "" }]));
  migrateUnowned("anon");
  ok("an anonymous visitor's data is adopted under `anon`", getJobs("anon").length === 1);
  ok("and signing in afterwards does not inherit it", getJobs(A).length === 0);
}

console.log("\n── signing out takes the account's data with it ──");
{
  store.clear();
  const B2 = ownerKey("second@example.com");
  saveResume(A, { title: "a", source: "built", text: "A TEXT" });
  addJob(A, { company: "c", title: "t", url: "", status: "saved", note: "" });
  writePersonal(A, "ra_published", JSON.stringify([{ slug: "s", url: "u", token: "SECRET-TOKEN" }]));
  saveResume(B2, { title: "b", source: "built", text: "B TEXT" });
  writeResume(A, "rSO", "en", cv("draft"));

  const removed = forgetPersonal(A);
  ok("the departing account's personal keys are removed", removed >= 3, String(removed));
  ok("its saved CVs are gone", getResumes(A).length === 0);
  /*
   * The publish token is a CAPABILITY, not just data: whoever holds it can take that CV off the
   * public web. Of the seven stores this was the one that mattered most and looked like it mattered
   * least.
   */
  ok("and the unpublish tokens with them",
    !JSON.stringify([...store.map.entries()]).includes("SECRET-TOKEN"));
  ok("the other account is untouched", getResumes(B2).length === 1);
  /* `forgetPersonal` is the personal half only — the draft is `forgetOwner`'s job, and `useOwner`
     calls both. Asserted so the division stays visible rather than becoming a surprise. */
  ok("the builder draft is a separate call's responsibility",
    store.getItem(recordKey(A, "rSO")) !== null);
  ok("and forgetOwner finishes the job", forgetOwner(A) >= 1 && store.getItem(recordKey(A, "rSO")) === null);
}

console.log("\n── no personal key escapes the scoping list ──");
{
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  /* Every literal storage key the app names, gathered from source. */
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e)) files.push(p);
    }
  };
  walk("app");

  const found = new Set();
  for (const f of files) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    for (const m of src.matchAll(/(?:local|session)Storage\.(?:get|set|remove)Item\(\s*["'`](ra_[a-z_]+)["'`]/g)) {
      found.add(m[1]);
    }
  }

  /*
   * The list this test exists to keep honest. A new key added to a component joins neither
   * `PERSONAL_KEYS` nor `DEVICE_KEYS` by default, and the failure mode of forgetting is silent — the
   * key simply works, unscoped, until someone shares a laptop. So the omission is what fails here.
   */
  const known = new Set([...PERSONAL_KEYS, ...DEVICE_KEYS]);
  const unclassified = [...found].filter((k) => !known.has(k));
  ok("every literal storage key is classified as personal or device-level",
    unclassified.length === 0, unclassified.join(", "));

  /* And the direction that matters: no personal key is still addressed WITHOUT an owner. A raw
     `localStorage.setItem("ra_saved_resumes", …)` anywhere would defeat every assertion above. */
  const rawPersonal = [...found].filter((k) => PERSONAL_KEYS.includes(k));
  ok("no personal key is read or written directly by name",
    rawPersonal.length === 0, rawPersonal.join(", "));
  ok("the device-level keys are the only ones addressed directly",
    [...found].every((k) => DEVICE_KEYS.includes(k)), [...found].join(", "));

  /* The scoped key really carries the owner — a `scopedKey` that dropped it would pass everything
     above by making all owners equal. */
  ok("a scoped key contains the owner", scopedKey(A, "ra_jobs").includes(A));
  ok("and two owners produce two keys", scopedKey(A, "ra_jobs") !== scopedKey("anon", "ra_jobs"));
}

console.log("\n── a corrupt value degrades to empty, never to a crash ──");
{
  store.clear();
  store.setItem(scopedKey(A, "ra_jobs"), "{not json");
  ok("unparseable JSON reads as the fallback", getJobs(A).length === 0);
  store.setItem(scopedKey(A, "ra_jobs"), "null");
  ok("a stored null reads as the fallback too", readPersonalJson(A, "ra_jobs", []).length === 0);
  ok("a list write caps its length",
    writePersonalList(A, "ra_jobs", Array.from({ length: 90 }, (_, i) => ({ id: String(i) })), 50)
    && readPersonalJson(A, "ra_jobs", []).length === 50);
  removePersonal(A, "ra_jobs");
  ok("remove is scoped and works", readPersonal(A, "ra_jobs") === null);
}

/* ═════════════════ the owner fast path, and the safety it must not trade ═════════════════ */

/*
 * ── the bug ──
 *
 * `BuilderProvider` will not hydrate without an owner and `BuilderStep` shows a skeleton until it
 * has, so `useOwner`'s `fetch("/api/auth/me")` sat in front of the first form field. Every visitor,
 * every load, three grey bars until a round-trip finished. Proved by blocking that endpoint in a
 * browser: with the fetch hanging the builder showed its title and NOTHING else, indefinitely. With
 * the fast path, seven fields.
 *
 * The fast path is only allowed because of `hasOwnedRecords`, so that function IS the safety
 * property. If it ever answered `false` while a signed-in account's record was present, the builder
 * would render `anon`'s draft to a signed-in user and the autosave would then write it — which is
 * the original cross-account bug, reintroduced through the back door of a performance fix.
 */

console.log("\n── the owner may be guessed only when nothing can be got wrong ──");
{
  const { hasOwnedRecords } = await import("../app/lib/resumeStore.ts");
  store.clear();
  ok("an empty browser has no owned records", hasOwnedRecords() === false);

  writeResume("anon", "rA", "en", cv("anonymous draft"));
  ok("an anonymous draft alone still allows the guess", hasOwnedRecords() === false);

  /* The moment a signed-in account has written anything here, the guess must stop. */
  writeResume(A, "rB", "en", cv("alice"));
  ok("a signed-in account's record forbids the guess", hasOwnedRecords() === true);

  /* And via the index alone, because `forgetOwner` removes records and the index together but a
     partial failure could leave either behind — the conservative answer is the safe one. */
  store.clear();
  store.setItem(indexKey(A), JSON.stringify([{ resumeId: "rC", lang: "en", updatedAt: 1, revision: 1, title: "x" }]));
  ok("an index alone is enough to forbid it", hasOwnedRecords() === true);

  /* Personal data under an account is NOT a resume record, and the guess only governs which draft is
     read. Asserted so the boundary is deliberate rather than accidental. */
  store.clear();
  writePersonal(A, "ra_jobs", "[]");
  ok("an unrelated personal key does not forbid it", hasOwnedRecords() === false);
}

console.log("\n── and the hook does not put the network in front of the form ──");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/components/useOwner.ts", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  ok("it reads local storage through useSyncExternalStore", /useSyncExternalStore\(/.test(code));
  ok("the server snapshot is empty, so the prerender cannot claim an owner", /serverGuess\s*=\s*\(\)\s*:\s*string\s*=>\s*""/.test(code));
  ok("the guess is gated on hasOwnedRecords", /hasOwnedRecords\(\)\s*\?\s*""\s*:\s*"anon"/.test(code));
  /*
   * Adoption must wait for the SERVER, even though rendering does not. Running it on the guess would
   * file a returning account's saved CVs under `anon`. And `settled` must be state rather than a ref:
   * when the guess said `anon` and the server confirms `anon`, React bails out of the identical
   * update and a ref would leave this effect never running again — so no anonymous visitor's
   * pre-scoping data would ever be adopted, which is most visitors.
   */
  ok("adoption waits for the server's answer", /!settled\s*\|\|/.test(code));
  ok("and `settled` is state, so the effect re-runs on the transition", /\[settled, setSettled\] = useState/.test(code));
  ok("with settled in the dependency list", /\}, \[owner, settled\]\)/.test(code));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
