/**
 * One service decides what a visitor may do, and every rule fails closed.
 *
 * The rules were correct on the server and re-derived in twenty-six client places, two
 * of which disagreed about the same question. The disagreement had a direction: Journey
 * read `score?.watermark !== false` (a missing field means MARK IT) and /optimize read
 * `result.watermark` (a missing field means hand over a clean file). One of those loses
 * revenue silently the first time an API response changes shape.
 *
 * So these tests are mostly about the unknown state. A free user shown a watermark is
 * annoyed; a paying user shown one complains and can be fixed; an unpaid user handed a
 * clean PDF is revenue that never arrives and nobody ever hears about.
 *
 *   node --experimental-strip-types src/ops/entitlement.test.mjs
 */

import {
  NO_ACCESS, entitlementFrom, isExpired, shouldShowWatermark,
  canExportPDF, canExportWord, canUseCoverLetter, canUseLinkedInOptimizer,
  canUseInterviewPreparation, canRunUnlimitedChecks,
  watermarkFromResponse, accessExpiresAt, daysRemaining,
} from "../app/lib/entitlement.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const PAID = { paid: true, expiresAt: NOW + 3 * DAY };
const LAPSED = { paid: true, expiresAt: NOW - 1 };

/* ── the unknown state is never paid ── */
{
  const nothing = [undefined, null, {}, "yes", 0, [], { hasAccess: "true" }, { paid: "yes" }];
  for (const [i, input] of nothing.entries()) {
    eq(`unrecognised input #${i} grants nothing`, entitlementFrom(input), NO_ACCESS);
  }
  ok("no entitlement means watermark", shouldShowWatermark(undefined, NOW));
  ok("null entitlement means watermark", shouldShowWatermark(null, NOW));
  ok("and no cover letter", !canUseCoverLetter(null, NOW));
  ok("and no LinkedIn optimizer", !canUseLinkedInOptimizer(undefined, NOW));
  ok("and no interview prep", !canUseInterviewPreparation(null, NOW));
  ok("and no unlimited checks", !canRunUnlimitedChecks(null, NOW));
}

/* ── the shapes the product actually holds ── */
{
  eq("/api/auth/me for a paid visitor",
    entitlementFrom({ signedIn: true, hasAccess: true, until: NOW + DAY }),
    { paid: true, expiresAt: NOW + DAY });

  eq("/api/auth/me for a stranger",
    entitlementFrom({ signedIn: false, hasAccess: false }),
    { paid: false, expiresAt: 0 });

  // A device pass reports access with no timestamp. That must stay access: the server
  // already refused to report hasAccess for an expired pass, so re-deciding it here from
  // a missing number would revoke what the server just granted.
  const passNoExpiry = entitlementFrom({ hasAccess: true });
  ok("access with an unknown expiry is still access", passNoExpiry.paid);
  ok("and is not treated as expired", !isExpired(passNoExpiry, NOW));
  ok("so it does not get a watermark", !shouldShowWatermark(passNoExpiry, NOW));

  eq("a verified pass object",
    entitlementFrom({ plan: "complete", exp: NOW + 90 * DAY }),
    { paid: true, expiresAt: NOW + 90 * DAY, plan: "complete" });

  // An expired pass should never reach here (verifyPass returns null), but if it does,
  // it must not grant anything.
  ok("an expired pass is expired", isExpired(LAPSED, NOW));
  ok("and gets a watermark", shouldShowWatermark(LAPSED, NOW));
  ok("and no paid feature", !canUseCoverLetter(LAPSED, NOW));
}

/* ── paid access unlocks everything, per lib/plans.ts ── */
{
  ok("paid: no watermark", !shouldShowWatermark(PAID, NOW));
  ok("paid: cover letter", canUseCoverLetter(PAID, NOW));
  ok("paid: LinkedIn", canUseLinkedInOptimizer(PAID, NOW));
  ok("paid: interview prep", canUseInterviewPreparation(PAID, NOW));
  ok("paid: unlimited checks", canRunUnlimitedChecks(PAID, NOW));

  // Both plans grant the same features — the difference is duration — so no gate may
  // consult `plan`. If one ever does, this pair stops agreeing.
  const single = entitlementFrom({ plan: "single", exp: NOW + DAY });
  const complete = entitlementFrom({ plan: "complete", exp: NOW + 90 * DAY });
  for (const [name, fn] of Object.entries({
    canUseCoverLetter, canUseLinkedInOptimizer, canUseInterviewPreparation, canRunUnlimitedChecks,
  })) {
    eq(`${name} does not depend on which plan was bought`, fn(single, NOW), fn(complete, NOW));
  }

  // Exports are open to everyone; the watermark is the gate. This is what the pricing
  // copy promises, and a change of mind must happen in one function, not in each caller.
  ok("PDF export is not gated", canExportPDF() === true);
  ok("Word export is not gated", canExportWord() === true);
}

/* ── the API-response reader fails closed ── */
{
  ok("a response saying watermark:false is trusted", !watermarkFromResponse({ watermark: false }));
  ok("watermark:true marks it", watermarkFromResponse({ watermark: true }));
  // The bug this replaces: /optimize read the field's truthiness, so every one of these
  // handed out a clean file.
  ok("a MISSING watermark field marks it", watermarkFromResponse({ score: 70 }));
  ok("undefined marks it", watermarkFromResponse(undefined));
  ok("null marks it", watermarkFromResponse(null));
  ok("a non-object marks it", watermarkFromResponse("false"));
  ok("watermark:0 marks it — only an explicit false unlocks", watermarkFromResponse({ watermark: 0 }));
}

/* ── expiry copy ── */
{
  eq("an unpaid visitor has no expiry to show", accessExpiresAt(NO_ACCESS), 0);
  eq("a paid one does", accessExpiresAt(PAID), NOW + 3 * DAY);
  eq("three days left reads as 3", daysRemaining(PAID, NOW), 3);
  // Rounded up: a pass with four hours left has one day left, not zero.
  eq("four hours left reads as 1 day", daysRemaining({ paid: true, expiresAt: NOW + 4 * 60 * 60 * 1000 }, NOW), 1);
  eq("a lapsed pass has nothing to report", daysRemaining(LAPSED, NOW), null);
  eq("and neither does an unknown expiry", daysRemaining({ paid: true, expiresAt: 0 }, NOW), null);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
