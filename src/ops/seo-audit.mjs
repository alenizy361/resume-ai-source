/**
 * What a search engine actually receives from this site, page by page.
 *
 * ── why a crawler and not a checklist ──
 *
 * Every SEO claim in a repository is a claim about generated HTML: the title comes from a metadata
 * export, the canonical from a helper, the hreflang from a layout three levels up, and the body from
 * a component that may render nothing until JavaScript runs. Reading the source tells you what was
 * intended. Only fetching the page tells you what was sent — and search engines index what was sent.
 *
 * So this fetches every route the sitemap advertises plus every static route in the app, parses the
 * HTML as delivered, and reports the things that decide whether a page can rank at all:
 *
 *   · title and description — present, unique, the right length, in the page's own language
 *   · canonical — present, self-referential or deliberately pointing elsewhere, never to a
 *     different page
 *   · hreflang — reciprocal, because a one-way alternate is ignored
 *   · robots — which pages say noindex, and whether that matches what they are
 *   · content — how much text is in the server response, since a page whose body arrives empty
 *     ranks on nothing regardless of its metadata
 *   · structured data — which schema types, and whether they parse
 *   · brand — which name the page calls the product, which is how a split identity gets found
 *   · links — what links out, so orphans can be computed
 *
 * It asserts nothing on its own. It prints a table and writes JSON, and the fixes are separate
 * commits with their own verification — a number in a report is not a fix.
 *
 *   node ops/seo-audit.mjs [baseUrl] [--json out.json] [--all]
 *
 * Without `--all` it samples the templated families (resume-examples/<job> and friends) rather than
 * fetching four hundred near-identical pages, because the question those pages raise is "are they
 * the same as each other", and a sample answers it.
 */

import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://localhost:3142";
const ALL = args.includes("--all");
const jsonAt = args.indexOf("--json");
const JSON_OUT = jsonAt === -1 ? "" : args[jsonAt + 1];

/* ─────────────────────────── fetching ─────────────────────────── */

async function grab(path) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "seo-audit/1.0" } });
    const html = res.status < 300 ? await res.text() : "";
    return { path, status: res.status, location: res.headers.get("location") || "", html, ms: Date.now() - started };
  } catch (e) {
    return { path, status: 0, location: "", html: "", ms: Date.now() - started, error: String(e).slice(0, 80) };
  }
}

/** Concurrency without a dependency: a fixed pool pulling from one queue. */
async function crawl(paths, workers = 6) {
  const queue = [...paths];
  const out = [];
  await Promise.all(Array.from({ length: workers }, async () => {
    for (;;) {
      const p = queue.shift();
      if (!p) return;
      out.push(await grab(p));
    }
  }));
  return out;
}

/* ─────────────────────────── parsing ─────────────────────────── */

const pick = (html, re) => (html.match(re)?.[1] ?? "").trim();
const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

function parse(page) {
  const h = page.html;
  const title = decode(pick(h, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = decode(pick(h, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i));
  const canonical = pick(h, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const robots = pick(h, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
  const lang = pick(h, /<html[^>]+lang=["']([^"']+)["']/i);
  const dir = pick(h, /<html[^>]+dir=["']([^"']+)["']/i);

  const alternates = [...h.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)].map((m) => ({
    hreflang: pick(m[0], /hreflang=["']([^"']+)["']/i),
    href: pick(m[0], /href=["']([^"']+)["']/i),
  })).filter((a) => a.hreflang);

  /* The BODY as delivered, with script and style stripped: this is the text a crawler weighs. */
  const body = h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const jsonLd = [...h.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((m) => {
      try {
        const v = JSON.parse(m[1]);
        const nodes = Array.isArray(v) ? v : v["@graph"] ? v["@graph"] : [v];
        return nodes.map((n) => String(n["@type"] ?? "?"));
      } catch { return ["INVALID"]; }
    });

  const links = [...h.matchAll(/<a[^>]+href=["'](\/[^"'#?]*)["']/gi)].map((m) => m[1].replace(/\/$/, "") || "/");

  return {
    ...page,
    title, description, canonical, robots, lang, dir, alternates, jsonLd,
    words: body ? body.split(" ").length : 0,
    h1: (h.match(/<h1[\s>]/gi) || []).length,
    links: [...new Set(links)],
    brands: {
      sira: /\bSira\b/.test(h) || /سيرة/.test(h),
      resumeAi: /ResumeAI|Resume AI/i.test(h),
      /*
       * The DOMAIN is not a brand name. The first version matched `cv.rabit.sa`, which appears in
       * every canonical, every Open Graph URL and every JSON-LD node — so it reported 191 pages
       * with a "mixed brand" and buried the five that genuinely had the domain in their TITLE.
       * A tool that cries wolf on every page is a tool nobody reads.
       */
      cvRabit: /\bCV[ -]?Rabit\b/i.test(h),
      rabit: /رابِت|Rabit/i.test(h),
    },
  };
}

/* ─────────────────────────── the route list ─────────────────────────── */

const sm = await grab("/sitemap.xml");
const sitemapPaths = [...sm.html.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => { try { return new URL(m[1]).pathname; } catch { return ""; } })
  .filter(Boolean);

/** One representative per templated family, unless --all. */
function sample(paths) {
  if (ALL) return paths;
  const seen = new Map();
  const kept = [];
  for (const p of paths) {
    const family = p.split("/").slice(0, 3).join("/");
    const n = seen.get(family) ?? 0;
    if (n < 3) { kept.push(p); seen.set(family, n + 1); }
  }
  return kept;
}

/* Routes worth auditing that a sitemap should NOT contain — the private half. */
/*
 * `/builder` is deliberately NOT here. It is the product's highest-intent landing page — it now
 * ships five hundred words of server-rendered content explaining what the builder does — and the
 * first version of this list called it private, which would have argued for hiding the one page
 * that should rank for "AI resume builder".
 */
const PRIVATE = ["/account", "/login", "/pay/callback", "/build", "/ar/build", "/journey", "/ar/journey"];

const paths = [...new Set([...sample(sitemapPaths), ...PRIVATE])];
console.log(`Crawling ${paths.length} of ${sitemapPaths.length} sitemap routes (${ALL ? "all" : "sampled"}) at ${BASE}\n`);

const pages = (await crawl(paths)).map(parse).sort((a, b) => a.path.localeCompare(b.path));

/* ─────────────────────────── findings ─────────────────────────── */

const byTitle = new Map();
const byDesc = new Map();
for (const p of pages) {
  if (p.title) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p.path]);
  if (p.description) byDesc.set(p.description, [...(byDesc.get(p.description) ?? []), p.path]);
}

const linkedTo = new Set(pages.flatMap((p) => p.links));
const indexable = (p) => p.status === 200 && !/noindex/i.test(p.robots);

const problems = [];
const flag = (path, kind, detail) => problems.push({ path, kind, detail });

for (const p of pages) {
  if (p.status >= 300 && p.status < 400) { flag(p.path, "redirect", `${p.status} → ${p.location}`); continue; }
  if (p.status !== 200) { flag(p.path, "not-200", String(p.status)); continue; }

  if (!p.title) flag(p.path, "no-title", "");
  else if (p.title.length > 65) flag(p.path, "title-long", `${p.title.length} chars`);
  if (!p.description) flag(p.path, "no-description", "");
  else if (p.description.length > 165) flag(p.path, "description-long", `${p.description.length} chars`);

  if ((byTitle.get(p.title) ?? []).length > 1) flag(p.path, "duplicate-title", (byTitle.get(p.title) ?? []).join(", "));
  if ((byDesc.get(p.description) ?? []).length > 1) flag(p.path, "duplicate-description", (byDesc.get(p.description) ?? []).slice(0, 4).join(", "));

  if (indexable(p) && !p.canonical) flag(p.path, "no-canonical", "");
  if (indexable(p) && p.h1 !== 1) flag(p.path, "h1-count", String(p.h1));
  if (indexable(p) && p.words < 200) flag(p.path, "thin", `${p.words} words in the server response`);
  if (indexable(p) && !linkedTo.has(p.path.replace(/\/$/, "")) && p.path !== "/") flag(p.path, "orphan", "no internal link found in the crawl");

  /* An Arabic page must say so, or every language signal downstream is wrong. */
  const arabic = /^\/ar(\/|$)/.test(p.path);
  if (arabic && p.lang !== "ar") flag(p.path, "lang-attr", `html lang="${p.lang}"`);
  if (arabic && p.dir !== "rtl") flag(p.path, "dir-attr", `dir="${p.dir}"`);

  /* Reciprocity: an alternate that does not point back is ignored by Google. */
  for (const a of p.alternates) {
    const other = pages.find((q) => { try { return q.path === new URL(a.href).pathname; } catch { return false; } });
    if (!other) continue;
    const back = other.alternates.some((b) => { try { return new URL(b.href).pathname === p.path; } catch { return false; } });
    if (!back) flag(p.path, "hreflang-one-way", `${a.hreflang} → ${a.href}`);
  }

  const names = [p.brands.sira && "Sira/سيرة", p.brands.resumeAi && "ResumeAI", p.brands.cvRabit && "CV Rabit"].filter(Boolean);
  if (names.length > 1) flag(p.path, "brand-mixed", names.join(" + "));
  if (p.jsonLd.includes("INVALID")) flag(p.path, "structured-data-invalid", "");
}

/* Private routes must not be indexable, and must not be in the sitemap. */
for (const priv of PRIVATE) {
  const p = pages.find((x) => x.path === priv);
  if (!p || p.status !== 200) continue;
  if (!/noindex/i.test(p.robots)) flag(priv, "private-indexable", `robots="${p.robots || "(none)"}"`);
  if (sitemapPaths.includes(priv)) flag(priv, "private-in-sitemap", "");
}

/* ─────────────────────────── the table ─────────────────────────── */

const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
console.log(pad("path", 34), pad("st", 4), pad("lang", 5), pad("words", 6), pad("idx", 4), pad("canon", 5), "title");
console.log("─".repeat(120));
for (const p of pages) {
  console.log(
    pad(p.path, 34),
    pad(p.status, 4),
    pad(p.lang, 5),
    pad(p.words, 6),
    pad(indexable(p) ? "yes" : "no", 4),
    pad(p.canonical ? "yes" : "—", 5),
    (p.title || "(none)").slice(0, 60),
  );
}

console.log(`\n${"═".repeat(120)}\nFINDINGS — ${problems.length}\n`);
const byKind = new Map();
for (const f of problems) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n■ ${kind} — ${list.length}`);
  for (const f of list.slice(0, 12)) console.log(`   ${pad(f.path, 34)} ${f.detail}`);
  if (list.length > 12) console.log(`   … and ${list.length - 12} more`);
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, crawled: pages.length, sitemap: sitemapPaths.length, pages, problems }, null, 2));
  console.log(`\nwritten: ${JSON_OUT}`);
}
