/**
 * Copy the three personal stores out of Vercel Edge Config and into Redis.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MOVES, AND WHY EACH ONE IS FRIGHTENING
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 *   pub_<slug>  →  pub:<slug>     published CVs. A live URL somebody has already put on a job
 *                                 application. If this 404s, that is their application broken.
 *   ent_<b64>   →  ent:<email>    WHO HAS PAID. Lose one and a paying customer is locked out.
 *   res_<b64>   →  res:<email>    saved CVs. A person's own documents.
 *
 * Published CVs go first because they are the only ones a stranger can already be looking at.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * HOW IT REFUSES TO BE DANGEROUS
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * · It is a DRY RUN unless `--apply` is passed. Printing what it would do costs nothing and is the
 *   only way to find out that the credentials are wrong before it matters.
 * · It never deletes from Edge Config. The source is left intact so a rollback is "point the env vars
 *   back", not "restore from a backup you hope you took".
 * · It never overwrites a destination key that already holds something, unless `--force`. Running it
 *   twice must not clobber writes that happened in between.
 * · It READS EVERY KEY BACK from Redis after writing and compares the value. "Copied 40" proves 40
 *   writes were issued, not that one can be found again — and the key schemes differ between the two
 *   backends, so a one-character drift produces a silent, total loss that looks like success.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 *   EDGE_CONFIG_ID=…  EDGE_CONFIG_READ_TOKEN=…  VERCEL_API_TOKEN=…  EDGE_CONFIG_TEAM_ID=… \
 *   UPSTASH_REDIS_REST_URL=…  UPSTASH_REDIS_REST_TOKEN=… \
 *   node ops/store-migrate.mjs            # dry run — reports, writes nothing
 *   node ops/store-migrate.mjs --apply    # writes, then verifies every key
 *
 * The read token is enough for the source; `VERCEL_API_TOKEN` is only needed to LIST the items, which
 * the public read endpoint cannot do one key at a time without knowing the names in advance.
 */

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

const EC_ID = process.env.EDGE_CONFIG_ID;
const EC_READ = process.env.EDGE_CONFIG_READ_TOKEN;
const EC_TEAM = process.env.EDGE_CONFIG_TEAM_ID;
const EC_WRITE = process.env.VERCEL_API_TOKEN;
const UP_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const missing = [
  ["EDGE_CONFIG_ID", EC_ID], ["EDGE_CONFIG_READ_TOKEN", EC_READ],
  ["VERCEL_API_TOKEN", EC_WRITE],
  ["UPSTASH_REDIS_REST_URL", UP_URL], ["UPSTASH_REDIS_REST_TOKEN", UP_TOKEN],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  console.error("Nothing was read and nothing was written.");
  process.exit(1);
}

async function redis(args) {
  const res = await fetch(UP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).result;
}

/** Every item in the Edge Config store, with its value. One call, so the source is a snapshot. */
async function edgeItems() {
  const team = EC_TEAM ? `?teamId=${EC_TEAM}` : "";
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${EC_ID}/items${team}`, {
    headers: { Authorization: `Bearer ${EC_WRITE}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`edge-config list ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

/** `ent_<base64url>` / `res_<base64url>` carry the email encoded; Redis keys use it plainly. */
function decodeEmail(suffix) {
  try {
    return Buffer.from(suffix.replace(/_/g, "-"), "base64url").toString("utf8").toLowerCase().trim();
  } catch { return ""; }
}

/**
 * The three families, in the order that matters. `to` returns null for a key this family cannot
 * translate — an undecodable email is reported rather than written under a mangled key.
 */
const FAMILIES = [
  {
    name: "published CVs",
    match: (k) => k.startsWith("pub_"),
    to: (k) => `pub:${k.slice(4)}`,
    why: "a live URL someone may already have sent to an employer",
  },
  {
    name: "entitlements",
    match: (k) => k.startsWith("ent_"),
    to: (k) => { const e = decodeEmail(k.slice(4)); return e ? `ent:${e}` : null; },
    why: "who has paid",
  },
  {
    name: "saved CVs",
    match: (k) => k.startsWith("res_"),
    to: (k) => { const e = decodeEmail(k.slice(4)); return e ? `res:${e}` : null; },
    why: "a signed-in user's own documents",
  },
];

const asString = (v) => (typeof v === "string" ? v : JSON.stringify(v));

console.log(APPLY ? "APPLYING — writing to Redis\n" : "DRY RUN — nothing will be written\n");

const items = await edgeItems();
console.log(`Edge Config holds ${items.length} item(s).\n`);

let planned = 0, wrote = 0, skipped = 0, unmapped = 0, verified = 0, mismatched = 0;
const problems = [];

for (const fam of FAMILIES) {
  const mine = items.filter((it) => fam.match(String(it.key || "")));
  console.log(`── ${fam.name} — ${mine.length} — ${fam.why}`);

  for (const it of mine) {
    const from = String(it.key);
    const to = fam.to(from);
    if (!to) { unmapped++; problems.push(`${from}: key could not be translated`); console.log(`   ✗ ${from} — cannot translate`); continue; }

    const value = asString(it.value);
    planned++;

    if (!APPLY) { console.log(`   · ${from}  →  ${to}  (${value.length} chars)`); continue; }

    const existing = await redis(["GET", to]);
    if (existing !== null && existing !== undefined && !FORCE) {
      skipped++;
      console.log(`   ↷ ${to} already exists — left alone (use --force to overwrite)`);
      continue;
    }

    await redis(["SET", to, value]);
    wrote++;

    /* Read it back. This is the step that turns "wrote 40" into "40 can be found again". */
    const back = await redis(["GET", to]);
    if (asString(back) === value) { verified++; console.log(`   ✓ ${to}`); }
    else { mismatched++; problems.push(`${to}: written but read back different`); console.log(`   ✗ ${to} — READ BACK DIFFERENT`); }
  }
  console.log("");
}

console.log("─".repeat(60));
if (!APPLY) {
  console.log(`Would copy ${planned} key(s). Nothing was written.`);
  if (unmapped) console.log(`${unmapped} key(s) could not be translated — see above.`);
  console.log("\nRe-run with --apply when the plan above looks right.");
} else {
  console.log(`copied ${wrote} · verified ${verified} · skipped ${skipped} · unmapped ${unmapped} · mismatched ${mismatched}`);
  if (verified === wrote && !mismatched && !unmapped) {
    console.log("\nEvery key written was read back from Redis and matched.");
    console.log("Edge Config is untouched — rollback is putting its env vars back.");
  } else {
    console.log("\nPROBLEMS:");
    for (const p of problems) console.log(`  · ${p}`);
    console.log("\nEdge Config still holds the originals. Do not cut over.");
  }
}
process.exit(mismatched || unmapped ? 1 : 0);
