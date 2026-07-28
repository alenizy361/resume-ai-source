// Read-only link-graph crawler. BFS from / and /ar following in-product links only.
import { writeFileSync } from "node:fs";

const ORIGIN = "http://localhost:3000";
const SEEDS = ["/", "/ar"];

const seen = new Map(); // path -> {status, redirect, len, title}
const inbound = new Map(); // path -> Set of source paths
const queue = [...SEEDS];
const enqueued = new Set(SEEDS);

function norm(href, from) {
  if (!href) return null;
  if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) return null;
  let u;
  try { u = new URL(href, ORIGIN + from); } catch { return null; }
  if (u.origin !== ORIGIN) return null;
  u.hash = "";
  return u.pathname + (u.search || "");
}

function addInbound(target, from) {
  const key = target.split("?")[0];
  if (!inbound.has(key)) inbound.set(key, new Set());
  inbound.get(key).add(from);
}

let n = 0;
while (queue.length) {
  const path = queue.shift();
  n++;
  let res, body = "";
  try {
    res = await fetch(ORIGIN + path, { redirect: "manual" });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) body = await res.text();
    else await res.arrayBuffer();
  } catch (e) {
    seen.set(path, { status: "ERR " + e.message });
    continue;
  }
  const rec = { status: res.status, redirect: res.headers.get("location") || "", len: body.length };
  const t = body.match(/<title[^>]*>([^<]*)<\/title>/i);
  rec.title = t ? t[1].slice(0, 80) : "";
  const h = body.match(/<html[^>]*lang="([^"]*)"[^>]*>/i);
  rec.htmlLang = h ? h[1] : "";
  const d = body.match(/<html[^>]*dir="([^"]*)"/i) || body.match(/<main[^>]*dir="([^"]*)"/i);
  rec.dir = d ? d[1] : "";
  seen.set(path, rec);

  if (res.status >= 300 && res.status < 400 && rec.redirect) {
    const tgt = norm(rec.redirect, path);
    if (tgt && !enqueued.has(tgt)) { enqueued.add(tgt); queue.push(tgt); }
    continue;
  }
  if (!body) continue;

  // extract hrefs
  const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const raw of hrefs) {
    const tgt = norm(raw, path);
    if (!tgt) continue;
    if (/\.(png|jpg|jpeg|svg|ico|css|js|webmanifest|txt|xml|woff2?)$/i.test(tgt.split("?")[0])) continue;
    addInbound(tgt, path);
    if (!enqueued.has(tgt)) { enqueued.add(tgt); queue.push(tgt); }
  }
}

const out = {
  crawled: n,
  pages: Object.fromEntries([...seen].sort()),
  inbound: Object.fromEntries([...inbound].map(([k, v]) => [k, [...v]]).sort()),
};
writeFileSync(process.argv[2] || "/tmp/crawl.json", JSON.stringify(out, null, 1));
console.log("crawled", n, "unique", seen.size);
const bad = [...seen].filter(([, v]) => typeof v.status === "string" || v.status >= 400);
console.log("BAD:", bad.length);
for (const [p, v] of bad) console.log("  ", v.status, p, "<-", [...(inbound.get(p.split("?")[0]) || [])].slice(0, 4).join(", "));
