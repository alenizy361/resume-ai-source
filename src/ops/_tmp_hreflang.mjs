// Read-only hreflang/canonical audit across all sitemap routes.
import { readFileSync, writeFileSync } from "node:fs";
const ORIGIN = "http://localhost:3000";
const SITE = "https://cv.rabit.sa";
const paths = readFileSync(process.argv[2], "utf8").trim().split("\n");

const alt = new Map(); // path -> {canonical, langs:{hreflang:path}}
for (const p of paths) {
  const r = await fetch(ORIGIN + p);
  const html = await r.text();
  const langs = {};
  for (const m of html.matchAll(/<link rel="alternate"[^>]*>/g)) {
    const tag = m[0];
    const hl = tag.match(/hreflang="([^"]*)"/);
    const href = tag.match(/href="([^"]*)"/);
    if (hl && href) langs[hl[1]] = href[1].replace(SITE, "");
  }
  const can = html.match(/<link rel="canonical" href="([^"]*)"/);
  alt.set(p, { canonical: can ? can[1].replace(SITE, "") : null, langs });
}

const set = new Set(paths);
const problems = [];
for (const [p, v] of alt) {
  // canonical must be self (or an existing route)
  if (v.canonical && v.canonical !== p) problems.push(["canonical-mismatch", p, v.canonical]);
  for (const [hl, target] of Object.entries(v.langs)) {
    const t = alt.get(target);
    if (!t) { problems.push(["alt-target-not-in-sitemap", p, `${hl}=${target}`]); continue; }
    // reciprocation: target must declare back at p
    const back = Object.values(t.langs);
    if (!back.includes(p)) problems.push(["no-reciprocation", p, `${hl}=${target} (target declares ${JSON.stringify(t.langs)})`]);
  }
}
console.log("pages:", alt.size, "problems:", problems.length);
for (const x of problems) console.log(" ", x.join(" | "));
writeFileSync("/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/hreflang.json", JSON.stringify(Object.fromEntries(alt), null, 1));
