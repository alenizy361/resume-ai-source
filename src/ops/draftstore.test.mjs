/**
 * The shared draft, pinned.
 *
 * The point of the form is that it is a second door to the SAME draft. If a
 * switch lost work, offering the switch would be worse than not offering it, so
 * the round-trip is asserted rather than assumed.
 *
 *   node --experimental-strip-types src/ops/draftstore.test.mjs
 */

import { draftKey, readDraft, writeDraft, contactLine } from "../app/lib/draftStore.ts";
import { EMPTY_PROFILE, mergePatch } from "../app/lib/mergeProfile.ts";

// A minimal localStorage so the module under test runs outside a browser.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

eq("the key is the interview's own, so old drafts are not orphaned", draftKey("ar"), "ra_journey_ar");
eq("a missing draft reads as empty, not as a crash", readDraft("en").profile.role, "");

/* ── the switch that must not lose work ── */
{
  // The chat captures a role and its duties.
  let p = mergePatch({ ...EMPTY_PROFILE }, {
    role: "أخصائي أشعة",
    experiences: [{
      header: { title: "أخصائي أشعة", company: "مستشفى دلة", start_date: "سبتمبر 2024", end_date: "الآن" },
      bullets: ["أعد فحوصات الأشعة التشخيصية", "حافظ على معايير السلامة الإشعاعية"],
    }],
  });
  writeDraft("ar", { profile: p, door: "chat" });

  // The user gives up on chatting and opens the form.
  const reopened = readDraft("ar");
  eq("the role survives the switch", reopened.profile.roles.length, 1);
  eq("the employer survives", reopened.profile.roles[0].company, "مستشفى دلة");
  eq("the duties survive", reopened.profile.roles[0].bullets.length, 2);
  ok("the period survives", reopened.profile.roles[0].start === "سبتمبر 2024");

  // The form adds a second job and hands back to the chat.
  const p2 = mergePatch(reopened.profile, {
    experiences: [{ header: { title: "متدرب أشعة", company: "الحرس الوطني", start_date: "2022", end_date: "2023" }, bullets: ["ساعد في الفحوصات"] }],
  });
  writeDraft("ar", { profile: p2, door: "form" });
  const back = readDraft("ar");
  eq("both jobs are there after the round trip", back.profile.roles.length, 2);
  eq("the door is remembered", back.door, "form");
}

/* ── a draft written before roles existed ── */
{
  mem.set(draftKey("en"), JSON.stringify({
    profile: { role: "Accountant", wovenLines: ["Accountant — Acme | 2020 – 2024", "- Closed the monthly books"] },
  }));
  const old = readDraft("en");
  ok("an old flat-line draft loads without error", old.profile.role === "Accountant");
  const merged = mergePatch(old.profile, {});
  ok("its lines are parsed back into roles on first merge", merged.roles.length === 1, JSON.stringify(merged.roles));
}

/* ── the Gulf details, rendered only when volunteered ── */
eq("nothing volunteered gives a plain contact line",
  contactLine({ phone: "0581453234", email: "a@b.com" }), "0581453234 | a@b.com");
eq("volunteered details are appended in the order employers scan",
  contactLine({ phone: "055", email: "a@b.com" }, { city: "الرياض", nationality: "سعودي", visaStatus: "" }),
  "055 | a@b.com | الرياض | سعودي");
eq("empty strings never leave a dangling separator",
  contactLine({ phone: "", email: "a@b.com" }, {}), "a@b.com");

/* ── a hostile localStorage must not break the builder ── */
{
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
  ok("a blocked read degrades to an empty draft", readDraft("en").profile.role === "");
  let threw = false;
  try { writeDraft("en", { door: "form" }); } catch { threw = true; }
  ok("a full store does not throw", !threw);
  globalThis.localStorage = real;
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
