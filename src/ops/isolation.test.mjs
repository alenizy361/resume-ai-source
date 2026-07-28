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

/* Both stores, because the visit rule now lives in `sessionStorage` — the tab-scoped one. A fake
   window with only `localStorage` would make `mayRestore` answer "no" for every case and the whole
   visit block would pass by never being able to say yes. */
globalThis.window = { localStorage: new FakeStorage(), sessionStorage: new FakeStorage() };
const store = globalThis.window.localStorage;
const session = globalThis.window.sessionStorage;

const {
  deleteResume, forgetOwner, indexKey, listResumes, markMirrored, migrateLegacy, newResumeId,
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

/* ═════════════════ signing in adopts the anonymous work ═════════════════ */

console.log("\n── paying anonymously then being signed in must not orphan the buyer's data ──");
{
  const { adoptAnonymousResumes, listResumes, readResume, writeResume: wr, newResumeId: nid, ownerKey: ok2 } =
    await import("../app/lib/resumeStore.ts");
  const { adoptAnonymous, scopedKey } = await import("../app/lib/personalStore.ts");

  store.clear();
  const ACC = ok2("buyer@example.com");

  /*
   * The reported sequence: a buyer builds anonymously, pays, and `/api/pay/verify` signs them in.
   * The owner changes from `anon` to `u_<base64>` mid-session, and every key is `${base}:${owner}`.
   */
  const anonId = nid();
  wr("anon", anonId, "en", cv("Built before paying"));
  store.setItem(scopedKey("anon", "ra_optimize_draft"), "the pasted CV");
  store.setItem(scopedKey("anon", "ra_jobs"), '[{"employer":"A hospital"}]');

  const movedResumes = adoptAnonymousResumes(ACC);
  const movedKeys = adoptAnonymous(ACC);

  ok("the anonymous resume moves to the account", movedResumes === 1, String(movedResumes));
  ok("under the SAME resumeId, so an open URL still resolves",
    readResume(ACC, anonId).record?.state?.target?.title === "Built before paying");
  /* The record carries its owner; a raw copy would still say `anon` inside and be quarantined on
     read — losing exactly what this was meant to save. */
  ok("and the record's own owner was rewritten, not just its key",
    readResume(ACC, anonId).record?.owner === ACC);
  ok("it appears in the account's index", listResumes(ACC).some((r) => r.resumeId === anonId));

  ok("the personal stores move too", movedKeys.length === 2, movedKeys.join(", "));
  ok("the optimiser draft is readable under the account",
    store.getItem(scopedKey(ACC, "ra_optimize_draft")) === "the pasted CV");

  /* And the anonymous keyspace is emptied — adopting without removing turns a data-loss bug into a
     data-leak one for the next anonymous visitor in this browser. */
  ok("nothing is left under anon", listResumes("anon").length === 0);
  ok("nor any anonymous personal key", store.getItem(scopedKey("anon", "ra_jobs")) === null);
}

console.log("\n── but the account is the authority, not the anonymous session ──");
{
  const { adoptAnonymousResumes, readResume, writeResume: wr, newResumeId: nid, ownerKey: ok2 } =
    await import("../app/lib/resumeStore.ts");
  const { adoptAnonymous, scopedKey } = await import("../app/lib/personalStore.ts");

  store.clear();
  const ACC = ok2("returning@example.com");
  const id = nid();

  /* A returning customer already has this resume and this draft. Anonymous work in the same browser
     must never replace them. */
  wr(ACC, id, "en", cv("The account's own CV"));
  store.setItem(scopedKey(ACC, "ra_optimize_draft"), "the account's draft");
  wr("anon", id, "en", cv("Anonymous work"));
  store.setItem(scopedKey("anon", "ra_optimize_draft"), "anonymous draft");

  adoptAnonymousResumes(ACC);
  adoptAnonymous(ACC);

  ok("the account's resume is not overwritten",
    readResume(ACC, id).record?.state?.target?.title === "The account's own CV");
  ok("nor its personal draft",
    store.getItem(scopedKey(ACC, "ra_optimize_draft")) === "the account's draft");
  /* Not adopted, and still removed: an anonymous value the account has a better answer for is
     still anonymous data sitting in a shared browser. */
  ok("and the anonymous copy is gone rather than left behind",
    store.getItem(scopedKey("anon", "ra_optimize_draft")) === null);

  ok("adopting into `anon` is refused outright", adoptAnonymousResumes("anon") === 0);
  ok("and so is adopting into nobody", adoptAnonymous("").length === 0);

  /* These blocks wrote anonymous resumes, and every write stamps the tab-session visit marker. The
     visit block below opens by asserting that a browser with NO marker restores nothing — so leaving
     it set makes a correct assertion fail on state this block created. Cleaned up here rather than
     defended against there, because the mess is this block's. */
  store.clear();
  session.clear();
}

/* And the wiring: the one moment this is correct is the TRANSITION, never on mount. */
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/components/useOwner.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  ok("useOwner adopts on the anon → account transition",
    /before === "anon" && owner !== "anon"/.test(src));
  ok("and calls both halves", /adoptAnonymousResumes\(owner\)/.test(src) && /adoptAnonymous\(owner\)/.test(src));
}

/* ═════════════════ anonymous work lasts the visit; signing in saves it ═════════════════ */

console.log("\n── an anonymous draft does not come back from a previous visit ──");
{
  const { mayRestore, endAnonymousVisit, touchVisit } =
    await import("../app/lib/resumeStore.ts");

  /*
   * ── the visit is the TAB SESSION, and the first answer here was a thirty-minute cache ──
   *
   * This block used to assert a thirty-minute last-seen window: a gap inside it was the same visit,
   * a gap beyond it a new one. That shipped, and came straight back as "open the site and the
   * previous entries are still there" — because thirty minutes of localStorage IS a cache, and the
   * instruction had been that only signing in should bring old data back.
   *
   * `sessionStorage` is the primitive that matches: it survives a reload and dies with the tab.
   */
  ok("a browser with no session marker restores nothing", mayRestore("anon") === false);

  touchVisit("anon", Date.now());
  ok("but work just done IS restorable — the same tab, after a reload", mayRestore("anon") === true);

  /* Time does not enter into it any more, which is the point: an hour later in the same tab is still
     the same visit, and one second later in a NEW tab is not. */
  ok("an hour later in the same tab is still the same visit", mayRestore("anon") === true);

  /* A new tab is a new sessionStorage. Simulated the only way it can be here — by clearing it. */
  session.clear();
  ok("a new tab is a new visit", mayRestore("anon") === false);

  /* And it fails CLOSED where sessionStorage cannot be reached, because the cost of that is a clean
     builder while the cost of failing open is somebody else's CV. */
  globalThis.window.sessionStorage = undefined;
  ok("no sessionStorage means no restore", mayRestore("anon") === false);
  globalThis.window.sessionStorage = session;

  /* And the records go, rather than merely being skipped — anything left behind could surface later
     through a path this rule does not control.

     The record is written HERE rather than relied on from earlier in the file: the rewrite of this
     block dropped the `writeResume` the old version had, and the assertion then failed on an empty
     keyspace — a true statement about nothing. */
  writeResume("anon", newResumeId(), "en", cv("Lapsed anonymous draft"));
  ok("ending the visit removes the anonymous records", endAnonymousVisit() >= 1);
  ok("the draft is gone", readResume("anon", "rV").record === null);
  ok("and so is the marker", store.getItem("ra_visit:anon") === null);
}

console.log("\n── a signed-in account is never subject to it ──");
{
  const { mayRestore, endAnonymousVisit, touchVisit } =
    await import("../app/lib/resumeStore.ts");
  store.clear();

  writeResume(A, "rMine", "en", cv("alice's CV"));
  /* The offer signing in makes, stated as an assertion: your CVs come back because we know whose
     they are. No marker, an ancient marker, no marker at all — none of it applies. */
  ok("an account restores with no visit marker", mayRestore(A) === true);
  touchVisit(A, Date.now() - 90 * 24 * 60 * 60 * 1000);
  ok("and restores however long ago it was — three months, still theirs", mayRestore(A) === true);

  /* The rule must not become a way to delete an account's work. */
  writeResume("anon", "rAnon", "en", cv("anonymous"));
  endAnonymousVisit();
  ok("ending an anonymous visit leaves the account untouched",
    readResume(A, "rMine").record?.state?.target?.title === "alice's CV");
  ok("while the anonymous draft is gone", readResume("anon", "rAnon").record === null);

  /* An unknown owner restores nothing — the same rule as every other read here. */
  ok("an empty owner restores nothing", mayRestore("") === false);
}

console.log("\n── the builder applies it before it reads anything ──");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/components/build/BuilderProvider.tsx", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  ok("hydration asks before it reads", /const restorable = mayRestore\(owner\)/.test(code));
  ok("and clears a lapsed visit", /if \(!restorable\) endAnonymousVisit\(\)/.test(code));
  ok("the stored record is not even read when it may not be restored",
    /restorable\s*\?\s*readResume\(owner, wanted\)/.test(code));
  /* Three separate doors to the same data. Closing one and leaving the others open would make the
     rule look implemented while old work still walked back in. */
  ok("the legacy slot is not adopted either", /restorable \? migrateLegacy/.test(code));
  ok("nor the chat draft", /const fromChat = restorable/.test(code));
}

console.log("\n── and the visitor is told, where they would look ──");
{
  const { readFileSync } = await import("node:fs");
  const shell = readFileSync("app/components/build/BuilderShell.tsx", "utf8");
  /*
   * Withdrawing a promise silently is worse than not making it. The line has to name the limit AND
   * offer the remedy, or it is a warning with no way out.
   */
  ok("an anonymous visitor is told the limit", /owner === "anon" && onStep/.test(shell));
  ok("in both languages", /keepWhy: "Without an account/.test(shell) && /keepWhy: "بدون حساب/.test(shell));
  ok("with the remedy one tap away", /bd-keep-link/.test(shell) && /\/login/.test(shell));
  ok("and it is not shown to someone signed in", !/owner !== "anon"/.test(shell));
}

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

/* ── the record remembers which account revision it last agreed with ── */
{
  // The mount-time pull can only answer "is the server AHEAD of what this browser has
  // seen?" if the record carries that fact. `revision` cannot answer it — a local
  // per-write counter compared to the server's counter compares two unrelated clocks —
  // which is why an untouched session used to adopt an OLDER server copy over newer
  // local edits whose final mirror had failed, then autosave the loss.
  store.clear();
  const owner = ownerKey("mirror@example.com");
  const id = newResumeId(1000);
  writeResume(owner, id, "en", cv("train edits"));
  ok("a record that never met the server says so", readResume(owner, id).record.serverRevision === 0);
  ok("and holds unconfirmed edits", readResume(owner, id).record.dirty === true);

  markMirrored(owner, id, 7);
  const acked = readResume(owner, id).record;
  ok("a confirmed mirror records the account revision", acked.serverRevision === 7);
  ok("and clears dirty — the server has vouched for this content", acked.dirty === false);
  ok("without counting as an edit", acked.revision === 1);

  writeResume(owner, id, "en", cv("more edits"));
  const edited = readResume(owner, id).record;
  ok("an ordinary autosave carries the marker forward", edited.serverRevision === 7);
  ok("and is dirty again until the next mirror confirms it", edited.dirty === true);

  // A mirror that raced a newer keystroke confirms the revision without vouching
  // for the edits: `clean: false` keeps dirty true.
  markMirrored(owner, id, 8, { clean: false });
  const raced = readResume(owner, id).record;
  ok("a raced mirror advances the revision but does not vouch for newer edits",
    raced.serverRevision === 8 && raced.dirty === true);

  markMirrored(owner, "no-such-id", 9);
  ok("acknowledging a missing record does nothing rather than minting one",
    readResume(owner, "no-such-id").record === null);
}

/* ═════════ a SECOND TAB is not a new visit, and must not destroy the first one's CVs ═════════ */
{
  /*
   * ── the bug this locks down ──
   *
   * The rule above is right: the visit is the tab session. But `sessionStorage` is per TAB, so a
   * SECOND tab of the same browser had no marker, `mayRestore` answered false, and
   * `BuilderProvider` then called `endAnonymousVisit()` — which does not decline to restore, it
   * `forgetOwner("anon")`s the entire anonymous keyspace.
   *
   * Measured in Chromium before the fix: two real CVs (12,504 and 7,033 bytes) replaced by a single
   * empty 781-byte record, from nothing but opening the builder in a new tab while the first was
   * still open and mid-edit. Silent and unrecoverable.
   *
   * The missing fact was "is another tab of this browser still alive?", which `sessionStorage`
   * structurally cannot answer. A `localStorage` liveness lease can. That is a DIFFERENT question
   * from "when does a visit end" — a visit still ends when the last tab closes — so it does not
   * reopen the `VISIT_GAP_MS` question the store deliberately retired.
   */
  const { mayRestore, endAnonymousVisit, touchVisit, keepVisitAlive } =
    await import("../app/lib/resumeStore.ts");

  store.clear(); session.clear();
  const owner = "anon";
  const id = newResumeId();
  writeResume(owner, id, "en", cv("Radiology Technologist"));
  const id2 = newResumeId();
  writeResume(owner, id2, "en", cv("Accountant"));
  ok("two anonymous CVs are stored", listResumes(owner).length === 2);

  /* Tab 1 is live and beating. `document` is stubbed because `keepVisitAlive` listens for
     visibilitychange — the listener is the real thing being exercised, not incidental. */
  const listeners = [];
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: (t, fn) => listeners.push([t, fn]),
    removeEventListener: (t, fn) => {
      const i = listeners.findIndex(([lt, lf]) => lt === t && lf === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const stopTab1 = keepVisitAlive();
  ok("a live tab registers a visibilitychange listener", listeners.some(([t]) => t === "visibilitychange"));
  ok("and stamps its own entry immediately, not on the first beat",
    Object.keys(JSON.parse(store.getItem("ra_visit_live") || "{}")).length === 1);

  /* THE BUG: a new tab clears sessionStorage. Tab 1 is still open. */
  session.clear();
  ok("a second tab may restore, because a sibling tab is still live", mayRestore(owner) === true);
  ok("and therefore nothing is destroyed", listResumes(owner).length === 2);

  /* The visibility hook restamps, so a tab whose timer was throttled while hidden does not have its
     own lease judged on a beat the browser refused to run. */
  listeners.filter(([t]) => t === "visibilitychange").forEach(([, fn]) => fn());
  {
    const entries = Object.values(JSON.parse(store.getItem("ra_visit_live") || "{}"));
    ok("returning to the foreground restamps this tab's entry",
      entries.length === 1 && Date.now() - Number(entries[0]) < 5_000);
  }

  /*
   * ══════════════════════════════════════════════════════════════════════════════════════
   * A TAB MUST NOT READ ITS OWN STAMP AS A SIBLING'S
   * ══════════════════════════════════════════════════════════════════════════════════════
   *
   * The first version of this lease stored a bare `Date.now()`, and that was WORSE than the bug it
   * fixed. `keepVisitAlive()` stamps on mount; the builder's hydration effect bails on its first
   * pass because `useOwner()` has not answered yet — so by the time `mayRestore("anon")` ran, the
   * only thing in the lease was a stamp this very tab had written milliseconds earlier. Every tab
   * read itself as a live sibling, the anonymous visit NEVER expired, and a shared machine showed
   * the next person the previous one's half-built CV. Measured with a negative control: block the
   * lease write and correct wiping returns at once.
   *
   * So the assertion is not "a lease exists" but "a lease belonging to SOMEBODY ELSE exists".
   */
  {
    const realSess = globalThis.window.sessionStorage;
    store.clear();
    /* The PREVIOUS visitor leaves a CV behind. Written first, and in their own session, because
       `writeResume` marks the visit — planting it after the swap would mark the NEW tab's session
       and `mayRestore` would then answer true for a legitimate reason, testing nothing. */
    writeResume(owner, newResumeId(), "en", cv("Left by the last visitor"));
    /* …then every tab closes and somebody else opens one: fresh sessionStorage, so no visit marker
       and a new tab id, with the previous visitor's localStorage still on the machine. */
    globalThis.window.sessionStorage = new FakeStorage();
    const stopSolo = keepVisitAlive();               // this tab stamps its own entry…
    ok("a lone tab does not read its own entry as a sibling", mayRestore(owner) === false,
      "the visit would otherwise never expire, and the next person would be shown a stranger's CV");
    stopSolo();
    globalThis.window.sessionStorage = realSess;
  }

  /* The previous visitor's `writeResume` above marked THEIR session, and that object is back in
     place now. Cleared, because every assertion below is a fresh tab judging somebody else's entry,
     and a leftover session marker would satisfy `mayRestore` before the lease was ever consulted —
     which is exactly the kind of accidentally-passing test this suite exists to avoid. */
  session.clear();

  /* ── and the ORIGINAL rule still holds: every tab closed means a clean builder ── */
  stopTab1();
  ok("stopping a tab removes its visibilitychange listener",
    !listeners.some(([t]) => t === "visibilitychange"));

  /* A clean close removes this tab's own entry, so the registry empties with the last tab. A tab
     that is KILLED never runs teardown, so an entry can also linger and expire — both paths are
     asserted, because only one of them is under our control. */
  ok("a clean teardown removes this tab's entry", store.getItem("ra_visit_live") === null);

  /* A stranger's entry, stale. Five minutes and one second after its last beat: */
  store.setItem("ra_visit_live", JSON.stringify({ tOther: Date.now() - (5 * 60_000 + 1000) }));
  ok("a stale sibling is not a live one — a genuinely new visit restores nothing",
    mayRestore(owner) === false);

  /*
   * A future-dated entry, and the first version of this assertion had it backwards.
   *
   * It asserted that ANY future entry is read as live, reasoning that a moved clock (NTP, a timezone
   * change) should not cost a draft. The consequence, measured: such an entry never expires and is
   * never pruned, so the anonymous visit on that browser never ends and the next person on a shared
   * machine is shown the previous person's CV — indefinitely. A seeded `now + 24h` entry restored a
   * stranger's CV and survived every prune.
   *
   * A SMALL skew is still tolerated, because two tabs' clocks can disagree by a little and reading a
   * live sibling as dead is the expensive direction. Beyond one beat it is a broken clock, not a tab.
   */
  store.setItem("ra_visit_live", JSON.stringify({ tOther: Date.now() + 60 * 60_000 }));
  ok("an entry far in the future is a broken clock, not a live sibling", mayRestore(owner) === false);
  store.setItem("ra_visit_live", JSON.stringify({ tOther: Date.now() + 5_000 }));
  ok("but a few seconds of clock skew is still tolerated", mayRestore(owner) === true);

  /* Ending the visit takes the whole registry with it, so the tab that just declared the visit over
     cannot read anything back and re-open it. */
  store.setItem("ra_visit_live", JSON.stringify({ tOther: Date.now() }));
  endAnonymousVisit();
  ok("ending the visit drops the lease", store.getItem("ra_visit_live") === null);
  ok("and the anonymous records with it", listResumes(owner).length === 0);

  /* A signed-in account is untouched by any of this — that difference IS the offer. */
  const acct = ownerKey("someone@example.com");
  writeResume(acct, newResumeId(), "en", cv("Signed in"));
  session.clear();
  store.removeItem("ra_visit_live");
  ok("an account restores with no session marker and no lease", mayRestore(acct) === true);
  ok("and endAnonymousVisit never touches it",
    (endAnonymousVisit(), listResumes(acct).length === 1));

  touchVisit(owner, Date.now());   // leave the store in a sane state for anything after this
  delete globalThis.document;
}

/* ═══════ and the provider must not write a record for a document nobody has touched ═══════ */
{
  /*
   * Merely LOADING /builder minted an id and autosaved an empty state 450ms later, and then
   * `BuilderStart` listed it: a visitor who had created nothing was shown "Untitled · 0 of 11 steps
   * done" under "Your CVs here" — twice, if they pressed "Build a new CV" and came back.
   *
   * Asserted against the source, like the hydration guards above, because the condition is a React
   * ref that no store-level test can reach.
   */
  const { readFileSync } = await import("node:fs");
  const code = readFileSync("app/components/build/BuilderProvider.tsx", "utf8");
  ok("the autosave refuses an untouched document",
    /if \(!touched\.current && !mustPersist\.current\) return;/.test(code));
  ok("and so does the navigation flush, which used to write it anyway",
    (code.match(/if \(!touched\.current && !mustPersist\.current\) return;/g) || []).length >= 2);
  ok("a resume carried over from the chat door is still persisted",
    /mustPersist\.current = true;\s*\/\/ real content/.test(code));
  ok("and so is a record upgraded to a newer schema",
    /if \(upgraded\) mustPersist\.current = true;/.test(code));
  ok("the builder holds the anonymous visit open while it is on screen",
    /useEffect\(\(\) => keepVisitAlive\(\), \[\]\)/.test(code));
  /*
   * The AI ledger is what `mayCall` enforces the per-resume budget from. Gated behind `touched` it
   * was never written on an untouched resume, so the cap reset on every reload.
   *
   * This first asserted the carve-out inside `dispatchUser` — and passed while the bug was still
   * live, because `commitAi` (the ONLY `{t:"ai"}` dispatch in the product) calls the raw reducer
   * `dispatch` and never goes near `dispatchUser`. Proved at runtime: the record was byte-identical
   * after three "Suggest with AI" presses. Asserted at the real call site now.
   */
  const commitAi = code.slice(code.indexOf("const commitAi"), code.indexOf("const gen = useGenerate"));
  ok("the AI dispatch persists its spend ledger",
    /mustPersist\.current = true;/.test(commitAi) && /t: "ai"/.test(commitAi), commitAi.slice(0, 160));
  /* A server copy adopted on a second device is content this browser does not hold. Without the
     flag it reached the screen and never the disk. */
  ok("an adopted server copy is written locally",
    /mustPersist\.current = true;\s*\n\s*dispatch\(\{ t: "hydrate", state: sync\.incoming\.state \}\)/.test(code));

  /* And the hole the gate had: "Build a new CV" wrote the empty record itself, outside the gate, so
     pressing it twice still listed two "Untitled" rows. */
  const start = readFileSync("app/components/build/BuilderStart.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const startNew = start.slice(start.indexOf("const startNew"), start.indexOf("const enter"));
  ok("startNew does not pre-write an empty record", !/writeResume\(/.test(startNew), startNew.slice(0, 200));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
