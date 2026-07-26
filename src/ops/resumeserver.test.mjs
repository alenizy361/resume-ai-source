/**
 * Server-side persistence of the structured CV.
 *
 * ── why this runs against a real HTTP server and not a stubbed module ──
 *
 * The thing being tested is a protocol conversation: GET a key, compare a revision, SET it back.
 * Stubbing `redis()` would assert that the code calls the functions it calls, which is true by
 * construction and stays true after the bug is introduced. So this stands up an actual HTTP server
 * that speaks the Upstash REST shape — `POST` a command array, answer `{ result }` — and points the
 * module at it through the same environment variables production uses.
 *
 * What that buys, concretely: the key strings are exercised as strings, a malformed stored value is
 * a real malformed response, and the conflict check is measured on two writers against one store.
 *
 *   node --experimental-strip-types ops/resumeserver.test.mjs
 */

import { createServer } from "node:http";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

/* ── a Redis that is only as clever as it needs to be ─────────────────────────────── */
const store = new Map();
let commands = [];
let failNext = null;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    if (failNext) { const s = failNext; failNext = null; res.writeHead(s); res.end("nope"); return; }
    let args;
    try { args = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
    commands.push(args);
    const [cmd, key, value] = args;
    let result = null;
    if (cmd === "GET") result = store.has(key) ? store.get(key) : null;
    else if (cmd === "SET") { store.set(key, value); result = "OK"; }
    else if (cmd === "DEL") { result = store.delete(key) ? 1 : 0; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result }));
  });
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

/* Imported AFTER the env is set: `redisEnv` reads `process.env` at call time, but importing first
   would still be relying on that, and a module that cached it would fail here silently. */
const M = await import("../app/lib/resumeServer.ts");

const ME = "Person@Example.com";
const OTHER = "someone.else@example.com";
const stateOf = (title) => ({ schemaVersion: 2, target: { title }, profile: { role: title } });

/* ── 1. it is available only when a store is ──────────────────────────────────────── */
console.log("\n── availability is a fact the caller can read ──");
{
  ok("configured when Redis is present", M.resumeServerConfigured() === true);

  const url = process.env.UPSTASH_REDIS_REST_URL;
  process.env.UPSTASH_REDIS_REST_URL = "";
  ok("not configured when it is absent", M.resumeServerConfigured() === false);
  const blocked = await M.saveServerResume({
    email: ME, resumeId: "r1", lang: "en", state: stateOf("Nurse"), baseRevision: 0, title: "Nurse",
  });
  ok("and a save is refused rather than attempted", blocked.ok === false && blocked.reason === "unconfigured",
    JSON.stringify(blocked));
  ok("reading returns null rather than throwing", (await M.readServerResume(ME, "r1")) === null);
  process.env.UPSTASH_REDIS_REST_URL = url;
}

/* ── 2. a document survives a round trip ──────────────────────────────────────────── */
console.log("\n── the document goes to the server and comes back ──");
{
  const saved = await M.saveServerResume({
    email: ME, resumeId: "r1", lang: "en", state: stateOf("Radiology Technologist"),
    baseRevision: 0, title: "Radiology Technologist", now: 1000,
  });
  ok("the first save succeeds at revision 1", saved.ok === true && saved.revision === 1, JSON.stringify(saved));

  const back = await M.readServerResume(ME, "r1");
  ok("and reads back as the same document",
    back?.state?.target?.title === "Radiology Technologist", JSON.stringify(back?.state));
  ok("carrying its own account and id", back?.account === "person@example.com" && back?.resumeId === "r1");
  ok("the email is normalised in the key", store.has("cvdoc:person@example.com:r1"),
    [...store.keys()].join(", "));

  const list = await M.listServerResumes(ME);
  ok("and it appears in the account's index", list.length === 1 && list[0].resumeId === "r1");
  ok("with a title, so a list can be rendered without loading every document",
    list[0].title === "Radiology Technologist");
}

/* ── 3. the isolation rule, which is why the record carries its own address ───────── */
console.log("\n── a record that disagrees with its key is refused, not returned ──");
{
  ok("another account cannot read it", (await M.readServerResume(OTHER, "r1")) === null);
  ok("and their index is empty", (await M.listServerResumes(OTHER)).length === 0);

  /* The failure this guards against: a value written under the wrong key. Fetched by key alone it
     is indistinguishable from a correct record — this is the check that tells them apart. */
  store.set("cvdoc:person@example.com:r-planted", JSON.stringify({
    account: OTHER, resumeId: "r-planted", recordVersion: 1, revision: 9,
    lang: "en", updatedAt: 1, state: stateOf("Someone else's CV"),
  }));
  ok("a record naming a different account is not served",
    (await M.readServerResume(ME, "r-planted")) === null);

  store.set("cvdoc:person@example.com:r-mixed", JSON.stringify({
    account: "person@example.com", resumeId: "SOMETHING-ELSE", recordVersion: 1, revision: 3,
    lang: "en", updatedAt: 1, state: stateOf("Wrong id"),
  }));
  ok("a record naming a different resume is not served",
    (await M.readServerResume(ME, "r-mixed")) === null);

  store.set("cvdoc:person@example.com:r-junk", "{ this is not json");
  ok("and unparseable bytes are null, not an exception",
    (await M.readServerResume(ME, "r-junk")) === null);
}

/* ── 4. the concurrency rule ──────────────────────────────────────────────────────── */
console.log("\n── a stale write is refused with the winner attached ──");
{
  /* Two devices both holding revision 1: the laptop saves, then the phone wakes up. */
  const laptop = await M.saveServerResume({
    email: ME, resumeId: "r1", lang: "en", state: stateOf("Senior Radiographer"),
    baseRevision: 1, title: "Senior Radiographer", now: 2000,
  });
  ok("the up-to-date writer succeeds", laptop.ok === true && laptop.revision === 2);

  const phone = await M.saveServerResume({
    email: ME, resumeId: "r1", lang: "en", state: stateOf("STALE — from an hour ago"),
    baseRevision: 1, title: "stale", now: 3000,
  });
  ok("the stale writer is refused", phone.ok === false && phone.reason === "conflict", JSON.stringify(phone));
  ok("and is handed the winning record, so it can show it rather than only say no",
    phone.ok === false && phone.current?.revision === 2);

  const after = await M.readServerResume(ME, "r1");
  ok("the newer work survived the stale save",
    after?.state?.target?.title === "Senior Radiographer", after?.state?.target?.title);
}

/* ── 5. duplicate, which Phase 4 is built on ──────────────────────────────────────── */
console.log("\n── duplicating never writes to the original ──");
{
  const before = await M.readServerResume(ME, "r1");
  const dup = await M.duplicateServerResume({ email: ME, sourceId: "r1", newId: "r2", title: "Tailored", now: 4000 });
  ok("the copy is created at revision 1", dup.ok === true && dup.revision === 1, JSON.stringify(dup));

  const copy = await M.readServerResume(ME, "r2");
  ok("carrying the original's facts", copy?.state?.target?.title === before?.state?.target?.title);
  ok("under its own id", copy?.resumeId === "r2");

  const source = await M.readServerResume(ME, "r1");
  ok("and the original is untouched — same revision",
    source?.revision === before?.revision, `${before?.revision} → ${source?.revision}`);
  ok("and same content", source?.state?.target?.title === before?.state?.target?.title);

  const missing = await M.duplicateServerResume({ email: ME, sourceId: "nope", newId: "r3", title: "x" });
  ok("duplicating something that is not there fails cleanly", missing.ok === false);
  ok("and another account cannot duplicate mine",
    (await M.duplicateServerResume({ email: OTHER, sourceId: "r1", newId: "stolen", title: "x" })).ok === false);
}

/* ── 6. refusals are refusals, not truncations ────────────────────────────────────── */
console.log("\n── an oversized document is refused, never trimmed ──");
{
  const huge = { schemaVersion: 2, filler: "x".repeat(M.MAX_DOC_BYTES + 10) };
  const res = await M.saveServerResume({
    email: ME, resumeId: "r-big", lang: "en", state: huge, baseRevision: 0, title: "big",
  });
  ok("it is refused", res.ok === false && res.reason === "too-large", JSON.stringify(res).slice(0, 80));
  ok("and nothing partial was stored", (await M.readServerResume(ME, "r-big")) === null);
}

/* ── 7. delete ────────────────────────────────────────────────────────────────────── */
console.log("\n── delete removes the document and its listing ──");
{
  ok("delete reports success", (await M.deleteServerResume(ME, "r2")) === true);
  ok("the document is gone", (await M.readServerResume(ME, "r2")) === null);
  const list = await M.listServerResumes(ME);
  ok("and so is the index entry", list.every((s) => s.resumeId !== "r2"), JSON.stringify(list));
  ok("without taking the others with it", list.some((s) => s.resumeId === "r1"));
}

/* ── 8. the store falling over is not "you have no CVs" ───────────────────────────── */
console.log("\n── a broken store degrades to null, never to a wrong answer ──");
{
  failNext = 500;
  ok("a failed read is null, not a throw", (await M.readServerResume(ME, "r1")) === null);
  failNext = 500;
  ok("a failed list is empty, not a throw", (await M.listServerResumes(ME)).length === 0);
  /* And a failed WRITE must surface. Silently returning ok would tell the user their CV is safe on
     the server when it is not — the one lie this module must never tell. */
  failNext = 500;
  let threw = false;
  try {
    await M.saveServerResume({ email: ME, resumeId: "r1", lang: "en", state: stateOf("x"), baseRevision: 99, title: "x" });
  } catch { threw = true; }
  ok("a failed write is reported rather than swallowed", threw === true);
}

server.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
