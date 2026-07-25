/**
 * The number a customer READS must be the number their card is CHARGED.
 *
 * Before this suite existed, four files independently knew the price: lib/plans.ts (35 /
 * 99, hardcoded), /api/pay (`process.env.PRICE_SINGLE || 35` — the amount actually
 * invoiced), CheckoutButton ("SAR 35" as a literal, in the modal shown immediately
 * before paying), and layout.tsx's JSON-LD offers (35 / 99 again, quoted to Google).
 * Only one of them was authoritative, and it was not any of the three a customer sees.
 * Setting PRICE_SINGLE for a promotion would have displayed 35 everywhere while billing
 * the new amount.
 *
 * So: one function prices a plan, and these tests assert nothing can diverge from it.
 *
 *   node --experimental-strip-types src/ops/pricing.test.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PLANS, RETIRED_PRICES, planPrice, chargeableAmount, priceMismatch, formatPrice,
  toArabicDigits,
} from "../app/lib/plans.ts";

/** Every .ts/.tsx under a directory. Shared by the two file-scanning checks below. */
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
};

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

/* ── the display price and the charged price are one number ── */
{
  for (const id of ["single", "complete"]) {
    eq(`${id}: what the page shows is what the invoice charges`,
      planPrice(id), chargeableAmount(id));
  }
  eq("single is the approved 35", planPrice("single"), 35);
  eq("complete is the approved 99", planPrice("complete"), 99);
  eq("no promotion is configured, so nothing can mismatch", priceMismatch(), []);
}

/* ── an env promotion moves BOTH sides or the test catches it ── */
{
  process.env.PRICE_SINGLE = "19";
  eq("a server-side override is honoured", planPrice("single"), 19);
  eq("and the invoice follows it", chargeableAmount("single"), 19);
  // The client bundle only ever sees NEXT_PUBLIC_*, so a half-configured promotion is
  // exactly how a customer ends up reading one number and paying another.
  eq("a server-only override is reported as a mismatch", priceMismatch(), ["single"]);
  process.env.NEXT_PUBLIC_PRICE_SINGLE = "19";
  eq("configuring both clears it", priceMismatch(), []);
  process.env.NEXT_PUBLIC_PRICE_SINGLE = "25";
  eq("disagreeing values are still a mismatch", priceMismatch(), ["single"]);
  delete process.env.PRICE_SINGLE;
  delete process.env.NEXT_PUBLIC_PRICE_SINGLE;
  eq("and the approved price returns when the promotion ends", planPrice("single"), 35);
}

/* ── retired plans stay chargeable, but unsellable ── */
{
  ok("monthly is not offered for sale", !("monthly" in PLANS));
  eq("but an old monthly invoice can still be priced", chargeableAmount("monthly"), RETIRED_PRICES.monthly);
  eq("an unknown plan cannot be charged at all", chargeableAmount("banana"), null);
}

/* ── both languages state the same rule ── */
{
  eq("English prints Western digits", formatPrice("single", "en"), "SAR 35");
  eq("Arabic prints Arabic-Indic digits", formatPrice("single", "ar"), "٣٥ ريالاً");
  ok("an Arabic price contains no Western digit", !/[0-9]/.test(formatPrice("complete", "ar")));
  eq("the digit converter is exact", toArabicDigits(99), "٩٩");

  // The honest differentiator between plans is DURATION, not features. If these lists
  // ever differ, the pricing page starts selling a feature that is not gated.
  eq("both plans grant the same features", PLANS.single.features, PLANS.complete.features);
  eq("and the same in Arabic", PLANS.single.featuresAr, PLANS.complete.featuresAr);
  ok("the feature lists are translated, not duplicated English",
    PLANS.single.featuresAr.every((f) => /[؀-ۿ]/.test(f)));
  ok("access labels differ, because duration is the difference",
    PLANS.single.accessLabel !== PLANS.complete.accessLabel);
}

/* ── nothing new may hardcode a price ── */
{
  /*
   * A ratchet, not a clean sweep.
   *
   * Ten marketing and FAQ files still carry prices inside prose sentences, and rewriting
   * every one of them in the same change that restructured the pricing module would mix
   * a mechanical edit into a behavioural one. So they are listed, and the assertion is
   * that the list does not GROW: a new hardcoded price fails this test, and each listed
   * file can be migrated on its own afterwards.
   *
   * Files at the moment of decision — the checkout modal, the terms, the structured data
   * and the pricing pages — are deliberately NOT on this list. They were migrated first
   * because they are where a wrong number costs money rather than credibility.
   */
  /*
   * Empty, and it should stay that way.
   *
   * This was a list of eleven files carrying prices in prose while the pricing module was
   * restructured — a ratchet, so a NEW hardcoded price would fail while the existing ones
   * were migrated one at a time. They have all been migrated: every price a customer can
   * read now comes from `formatPrice()`, including the USD hints, which read
   * `PLANS.*.priceUsd` so a promotion moves those too.
   *
   * Two of the original eleven turned out to contain no price at all — they were caught by
   * a looser first draft of the pattern below.
   */
  const ALLOWED = new Set([]);

  const PRICE = new RegExp(
    "SAR\\s*(?:35|99|75)\\b"                       // "SAR 35"
    + "|\\b(?:35|99|75)\\s*(?:SAR|ريال)"            // "35 SAR"
    + "|(?<![٠-٩])(?:٣٥|٩٩|٧٥)(?![٠-٩])\\s*ريال",    // "٣٥ ريالاً", never inside ٩٩.٩٪
  );
  const offenders = [];
  for (const file of walk("app")) {
    const rel = file.replace(/^app\//, "");
    if (rel === "lib/plans.ts" || rel.startsWith("api/")) continue;
    if (ALLOWED.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    // Strip comments: a comment explaining the old hardcoding is not hardcoding.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (PRICE.test(code)) offenders.push(rel);
  }
  ok("no file outside the migration list hardcodes a price",
    offenders.length === 0, offenders.join(", "));

  // It reached zero. Anything added back is a regression, not a plan.
  ok("the migration list is empty", ALLOWED.size === 0, `${ALLOWED.size} files still listed`);
}

/* ── an interpolation must be in a context that interpolates ── */
{
  /*
   * `${formatPrice(...)}` inside JSX TEXT renders those characters literally.
   *
   * Migrating the last eleven files replaced price tokens across whole files, and five of
   * the sites turned out to be plain JSX text rather than string literals — so a user at
   * the paywall would have read "${formatPrice(\"single\", \"en\")}" where the price
   * belongs. A page fetch could not see it: those blocks only render after a scan
   * completes, which is exactly the kind of state a static check reaches and a smoke test
   * does not.
   *
   * A line holding `${...}` must also open a template literal or a string. If it has the
   * interpolation and no backtick and no quote, it is JSX text and the syntax is wrong.
   */
  const broken = [];
  for (const file of walk("app")) {
    for (const [i, line] of readFileSync(file, "utf8").split("\n").entries()) {
      if (!/\$\{formatPrice|\$\{PLANS\./.test(line)) continue;
      // Strip the interpolations before looking for a quote: `formatPrice("single","en")`
      // contains quotes of its own, and testing the raw line let every broken site through
      // — the first version of this check passed on the very lines it was written for.
      const outside = line.replace(/\$\{[^}]*\}/g, "");
      if (/[`"']/.test(outside)) continue;
      broken.push(`${file.replace(/^app\//, "")}:${i + 1}`);
    }
  }
  ok("no price interpolation sits in JSX text", broken.length === 0, broken.join(", "));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
