/**
 * Every piece of text on the site, measured against the ground it is actually painted on.
 *
 * ── why a browser and not a CSS review ──
 *
 * The token that fails is never the one you read. `--faint` was flagged as failing AA at 3.82:1 and
 * was fixed by a bump to 0.68 alpha — but the COMMENT beside it kept quoting the old figure, so the
 * defect read as open for weeks after it closed. The only way to know is to ask a browser what a
 * node's `color` and its nearest painted ancestor actually resolve to, and divide.
 *
 * It also catches the class of defect a token audit structurally cannot: text whose colour is fine
 * against the token it was designed for and wrong against the surface it ended up on.
 *
 * ── the one thing this cannot see ──
 *
 * A `background-image` — a gradient — has no readable colour. `getComputedStyle` gives the gradient
 * string, not the pixel under the glyph. So an element sitting on a gradient is REPORTED AND SKIPPED
 * rather than measured, and the count of skips is printed: a silent skip would let `.btn-accent`
 * (white on a violet sweep, 5.70:1 by its own rule) show up as 1.07:1 forever and train everyone to
 * ignore the output. Twenty-one such false alarms is exactly what the first version of this file
 * produced.
 *
 * Needs the app running.
 *
 *   node ops/contrast.test.mjs [baseUrl]
 */

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";
const EXE = process.env.CHROMIUM_PATH || undefined;

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* Both languages, both worlds (the marketing palette and the product one), and the pages that carry
   the most small text — captions, counts and notes are where `--faint` lives. */
const PAGES = [
  "/", "/ar",
  "/builder?entry=upload", "/optimize", "/pricing", "/ar/pricing",
  "/templates", "/account", "/login", "/resume-examples", "/terms",
];

const SWEEP = () => {
  const lum = (r, g, b) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const num = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  /** The nearest ancestor that actually paints, and whether it paints a colour we can read. */
  const groundOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { gradient: true };
      const c = num(cs.backgroundColor);
      if (c.length >= 3 && (c.length < 4 || c[3] > 0.98)) return { rgb: [c[0], c[1], c[2]] };
      n = n.parentElement;
    }
    const c = num(getComputedStyle(document.body).backgroundColor);
    return { rgb: c.length >= 3 ? [c[0], c[1], c[2]] : [255, 255, 255] };
  };

  const bad = [];
  let skipped = 0, measured = 0;
  for (const el of document.querySelectorAll("body *")) {
    /* Own text only — a wrapper inherits its children's words and would be measured with the
       wrapper's colour, which is not the colour anyone sees. */
    const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim()).join(" ").trim();
    if (text.length < 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;

    const ground = groundOf(el);
    if (ground.gradient) { skipped++; continue; }
    measured++;

    const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
    /* WCAG's own definition of large text: 24px, or 18.66px at 700. */
    const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    const c = num(cs.color);
    const a = c.length > 3 ? c[3] : 1;
    const fg = [0, 1, 2].map((i) => a * c[i] + (1 - a) * ground.rgb[i]);
    const L1 = lum(...fg), L2 = lum(...ground.rgb);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < need) {
      bad.push({
        text: text.slice(0, 44), size, weight, color: cs.color,
        ground: `rgb(${ground.rgb.join(",")})`, ratio: Math.round(ratio * 100) / 100, need,
      });
    }
  }
  return { bad, skipped, measured };
};

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let totalMeasured = 0, totalSkipped = 0;
for (const p of PAGES) {
  await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  /* The homepage opens behind a full-screen intro; end it so the page underneath is what is read. */
  await page.evaluate(() => document.querySelector(".cine-skip")?.click());
  await page.waitForTimeout(900);
  const { bad, skipped, measured } = await page.evaluate(SWEEP);
  totalMeasured += measured; totalSkipped += skipped;
  ok(`${p} — every text node clears AA (${measured} measured, ${skipped} on gradients)`,
    bad.length === 0,
    bad.slice(0, 6).map((b) => `${b.ratio}:1 need ${b.need} · ${b.size}px/${b.weight} ${b.color} on ${b.ground} · "${b.text}"`).join(" | "));
}

/* A sweep that measured nothing would pass every assertion above. */
ok("the sweep actually read the pages", totalMeasured > 400, String(totalMeasured));
console.log(`\n${totalMeasured} text nodes measured · ${totalSkipped} skipped on gradients`);

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
