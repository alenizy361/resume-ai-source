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


/* ── the two doors must not destroy each other's work ──
 * Journey.persist() used to rebuild the stored record from its own eight-key
 * snapshot and write it straight over the draft. Once the form shares this key,
 * that turns from a latent bug into data loss: opening the chat after using the
 * form wiped the confirmed roles, the pending suggestions and the template. This
 * asserts the merge semantics that fix requires, at the store level.
 */
{
  // The form writes keys the chat has never heard of.
  writeDraft("en", {
    profile: { ...EMPTY_PROFILE, role: "Radiographer" },
    suggestions: [{ id: "it_1", text: "Performed CT", status: "suggested" }],
    template: "ats-pro",
    target: { title: "Radiology Technologist" },
    credentials: [{ id: "c1", title: "BLS", status: "confirmed" }],
  });

  // The chat then persists its own snapshot — which must MERGE, not replace.
  const before = readDraft("en");
  writeDraft("en", { profile: { ...before.profile, name: "Abdulaziz" }, stage: 2 });

  const after = readDraft("en");
  ok("the chat's own write lands", after.profile.name === "Abdulaziz");
  ok("the role the form captured survives", after.profile.role === "Radiographer");
  eq("pending suggestions survive the chat", after.suggestions?.length, 1);
  eq("the chosen template survives", after.template, "ats-pro");
  eq("the target job survives", after.target?.title, "Radiology Technologist");
  eq("confirmed credentials survive", after.credentials?.length, 1);
}


/* ─────────────────── nothing outside the builder may erase the draft ─────────────────── */

/**
 * The resume must survive payment, export and every other flow that clears caches.
 *
 * This is a static check on the SOURCE of the pages that clear browser storage, not a behavioural one,
 * and that is deliberate: the failure it guards against is somebody adding a tidy-up line months from
 * now. "Clear the stale results after payment" is a reasonable-sounding change that becomes a
 * catastrophe one key name later — the user pays, comes back, and the CV they paid to download is
 * gone. No test that exercises today's code can catch tomorrow's extra line; a check on which keys are
 * allowed to be removed can.
 *
 * The keys payment legitimately clears are the OPTIMIZER's cached scan results, which were generated
 * locked and would otherwise show a stale preview to someone who just paid to unlock it.
 */
{
  const { readFileSync, existsSync } = await import("node:fs");

  /** Every key that holds work the user would lose. */
  const SACRED = [draftKey("ar"), draftKey("en")];

  /** Pages that clear storage, and what each is allowed to clear. */
  const CLEARERS = ["app/pay/callback/page.tsx", "app/optimize/page.tsx"];

  const violations = [];
  let scanned = 0;
  for (const file of CLEARERS) {
    if (!existsSync(file)) continue;
    scanned++;
    const src = readFileSync(file, "utf8");
    for (const key of SACRED) {
      /* Removing it by name, or by a template that builds it. Both are how it would really happen. */
      if (src.includes(`removeItem("${key}")`) || src.includes(`removeItem(\`${key}\`)`)) {
        violations.push(`${file} removes ${key}`);
      }
    }
    /* `localStorage.clear()` takes everything, including the draft. There is never a reason for it in
       a product that stores one person's unfinished CV in the same origin. */
    if (/localStorage\s*\.\s*clear\s*\(/.test(src)) violations.push(`${file} calls localStorage.clear()`);
    /* A removal built from a variable cannot be checked by name, so it is refused outright — the
       check must not be defeatable by indirection it cannot see. */
    if (/removeItem\((?!["\`])/.test(src)) violations.push(`${file} removes a computed key`);
  }

  ok("the files that clear storage were actually read", scanned >= 1, `${scanned} files`);
  ok("no flow removes the builder draft", violations.length === 0, violations.join(" · "));

  /* And the guard must be checking the right names, or it passes vacuously. */
  ok("the draft keys are the ones the builder really uses",
    draftKey("ar") === "ra_journey_ar" && draftKey("en") === "ra_journey_en");

  /* Payment DOES legitimately clear the optimizer's locked results — asserted so that removing that
     behaviour is also a visible decision rather than an accident. */
  if (existsSync("app/pay/callback/page.tsx")) {
    const pay = readFileSync("app/pay/callback/page.tsx", "utf8");
    ok("payment still clears the stale locked scan results",
      pay.includes('removeItem("ra_optimize_result")'));
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
