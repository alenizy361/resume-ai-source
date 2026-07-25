/**
 * The truthfulness rules, asserted structurally.
 *
 * The product's central promise is that AI never puts a fact on a CV the user did
 * not confirm. That promise is kept here by a data-model invariant rather than by a
 * render-time filter: unconfirmed items live in `suggestions` and the resume is
 * rendered from `profile`, so there is no path from one to the other except
 * `confirmItem`. These tests exist to prove that path is the only one.
 *
 * The Radiology Technologist case the product owner mandated is at the bottom, run
 * end to end: X-ray, CT and PACS confirmed; MRI, SCFHS and RSO suggested and never
 * confirmed; the CV must contain the first three and none of the last three.
 *
 *   node --experimental-strip-types src/ops/builderdoc.test.mjs
 */

import {
  EMPTY_BUILDER, newItem, confirmItem, rejectItem, editItem, pending, rejected,
  hasUnconfirmed, filterFresh, bulletRoom, normalizeLabel, SCHEMA_VERSION,
} from "../app/lib/builderDoc.ts";
import { assembleResume } from "../app/lib/mergeProfile.ts";
import { upsertRole, rolesToLines } from "../app/lib/resumeDoc.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const base = () => ({ ...EMPTY_BUILDER, profile: { ...EMPTY_BUILDER.profile, roles: [] } });

eq("the schema is versioned", SCHEMA_VERSION, 2);

/* ── a suggestion is not content ── */
{
  let st = base();
  st.suggestions = [newItem({ section: "skills", type: "skill", text: "Magnetic Resonance Imaging" })];
  ok("a fresh item is only suggested", st.suggestions[0].status === "suggested");
  ok("the resume cannot see it", !assembleResume(st.profile, false).includes("Magnetic"));
  ok("and the document knows something is pending", hasUnconfirmed(st));

  const r = confirmItem(st, st.suggestions[0].id);
  ok("confirming puts it in the resume", assembleResume(r.state.profile, false).includes("Magnetic Resonance Imaging"));
  ok("and it leaves the suggestion bag", r.state.suggestions.length === 0);
  ok("so nothing is pending any more", !hasUnconfirmed(r.state));
}

/* ── rejection is a decision, not a dismissal ── */
{
  let st = base();
  st.suggestions = [newItem({ section: "skills", type: "skill", text: "Mammography" })];
  st = rejectItem(st, st.suggestions[0].id);
  eq("a rejected item is out of the pending list", pending(st, "skills").length, 0);
  eq("but it is remembered", rejected(st, "skills").length, 1);
  ok("the resume never saw it", !assembleResume(st.profile, false).includes("Mammography"));

  // Regenerate offers it again, reworded. It must not come back.
  const fresh = filterFresh(
    ["Mammography imaging", "Fluoroscopy"],
    { confirmed: [], pending: [], rejected: rejected(st, "skills") },
  );
  ok("a reworded rejection is not re-offered", !fresh.some((t) => /Mammography/i.test(t)), JSON.stringify(fresh));
  ok("a genuinely new suggestion still comes through", fresh.includes("Fluoroscopy"));
}

/* ── editing keeps provenance but records the human ── */
{
  let st = base();
  st.suggestions = [newItem({ section: "experience", type: "duty", text: "Performed imaging", roleId: "r1" })];
  st = editItem(st, st.suggestions[0].id, "Performed CT imaging under protocol");
  ok("the edit is stored", st.suggestions[0].text === "Performed CT imaging under protocol");
  ok("provenance stays ai — it is history, not current state", st.suggestions[0].source === "ai");
  ok("but the human is recorded", st.suggestions[0].editedByUser === true);
}

/* ── the bullet cap must block, never silently discard ── */
{
  let st = base();
  st.profile.roles = [{
    id: "r1", title: "Radiographer", company: "Dallah", location: "Riyadh",
    start: "2024", end: "الآن",
    bullets: ["a one", "b two", "c three", "d four", "e five", "f six"],
  }];
  eq("a full current role has no room", bulletRoom(st.profile.roles[0]), 0);

  st.suggestions = [newItem({ section: "experience", type: "duty", text: "a seventh duty entirely", roleId: "r1" })];
  const r = confirmItem(st, st.suggestions[0].id);
  eq("confirming a 7th is blocked, not swallowed", r.blocked, "bullet-cap");
  eq("the role is untouched", r.state.profile.roles[0].bullets.length, 6);
  ok("and the suggestion is still there to retry", r.state.suggestions.length === 1);
}
{
  // A past role's budget is tighter than a current one's.
  const past = { id: "r2", title: "Intern", company: "NGHA", location: "", start: "2022", end: "2023", bullets: ["x one", "y two"] };
  eq("a past role allows fewer", bulletRoom(past), 2);
}

/* ── duties land on the right job, and the header carries department ── */
{
  let st = base();
  st.profile.roles = upsertRole([], {
    id: "r1", title: "Radiographer", company: "Dallah", location: "Riyadh",
    department: "CT", start: "Sep 2024", end: "الآن", bullets: [],
  });
  st.suggestions = [newItem({ section: "experience", type: "duty", text: "Operated CT scanners to protocol", roleId: "r1" })];
  const r = confirmItem(st, st.suggestions[0].id);
  const lines = rolesToLines(r.state.profile.roles);
  ok("the department reaches the header", lines[0].includes("Radiographer, CT"), lines[0]);
  ok("the employer and period are intact", lines[0].includes("Dallah") && lines[0].includes("Sep 2024"), lines[0]);
  ok("the duty is dashed under it", lines[1].startsWith("- Operated CT"), lines[1]);
}

/* ── normalization so one skill is not two ── */
{
  ok("case and punctuation collapse", normalizeLabel("CT-Scan") === normalizeLabel("ct scan"));
  ok("Arabic orthography collapses", normalizeLabel("أشعة") === normalizeLabel("اشعه"));
  let st = base();
  st.profile.skills = "CT Scan";
  st.suggestions = [newItem({ section: "skills", type: "skill", text: "ct scan" })];
  const r = confirmItem(st, st.suggestions[0].id);
  eq("confirming a duplicate skill does not double it", r.state.profile.skills, "CT Scan");
}

/* ══════════ THE MANDATED RADIOLOGY TECHNOLOGIST CASE ══════════
 * Confirmed: X-ray, CT, PACS, BLS. Suggested only: MRI, SCFHS, RSO.
 * The finished CV must contain the first set and none of the second.
 */
{
  let st = base();
  st.target = { ...st.target, title: "Radiology Technologist", language: "en" };
  st.profile.role = "Radiology Technologist";
  st.profile.name = "Abdulaziz Alenzi";
  st.profile.contact = "0581453234 | a@b.com";
  st.profile.roles = upsertRole([], {
    id: "r1", title: "Radiology Technologist", company: "Dallah Hospital",
    location: "Riyadh", start: "Sep 2024", end: "Present", bullets: [],
  });

  const stamp = 1;
  st.suggestions = [
    newItem({ section: "skills", type: "skill", text: "General X-ray", createdAt: stamp, group: "Modalities" }),
    newItem({ section: "skills", type: "skill", text: "Computed Tomography", createdAt: stamp, group: "Modalities" }),
    newItem({ section: "skills", type: "skill", text: "Magnetic Resonance Imaging", createdAt: stamp, group: "Modalities" }),
    newItem({ section: "skills", type: "skill", text: "PACS", createdAt: stamp, group: "Systems" }),
    newItem({ section: "experience", type: "duty", roleId: "r1", createdAt: stamp,
      text: "Performed diagnostic X-ray and CT examinations to approved clinical protocols" }),
    newItem({ section: "experience", type: "duty", roleId: "r1", createdAt: stamp,
      text: "Managed imaging studies and documentation through PACS" }),
  ];

  // The user confirms only what they actually do.
  for (const want of ["General X-ray", "Computed Tomography", "PACS"]) {
    const it = st.suggestions.find((i) => i.text === want);
    st = confirmItem(st, it.id).state;
  }
  for (const it of st.suggestions.filter((i) => i.type === "duty").slice()) {
    st = confirmItem(st, it.id).state;
  }
  // BLS is confirmed as a credential; SCFHS and RSO are offered and left alone.
  st.credentials = [
    { id: "c1", kind: "certification", title: "Basic Life Support (BLS)", issuer: "National CPR Foundation",
      issueDate: "2026-05", expiryDate: "2028-05", status: "confirmed", source: "user" },
    { id: "c2", kind: "registration", title: "SCFHS Professional Registration", issuer: "SCFHS",
      issueDate: "", expiryDate: "", status: "suggested", source: "ai" },
    { id: "c3", kind: "certification", title: "Radiation Protection Officer (RSO)", issuer: "",
      issueDate: "", expiryDate: "", status: "suggested", source: "ai" },
  ];
  st.profile.certifications = st.credentials
    .filter((c) => c.status === "confirmed")
    .map((c) => [c.title, c.issuer, c.expiryDate && `valid to ${c.expiryDate}`].filter(Boolean).join(" — "))
    .join("\n");
  st.languages = [
    { id: "l1", name: "Arabic", level: "native", status: "confirmed", source: "user" },
    { id: "l2", name: "English", level: "professional", status: "confirmed", source: "user" },
  ];
  st.profile.languages = st.languages.filter((l) => l.status === "confirmed" && l.level)
    .map((l) => `${l.name} (${l.level})`).join(", ");

  const cv = assembleResume(st.profile, false);

  ok("X-ray is on the CV", /X-ray/i.test(cv));
  ok("CT is on the CV", /Computed Tomography|\bCT\b/.test(cv));
  ok("PACS is on the CV", /PACS/.test(cv));
  ok("BLS is on the CV", /Basic Life Support/.test(cv));
  ok("Arabic is native, English is professional — not defaulted to fluent",
    /Arabic \(native\)/.test(cv) && /English \(professional\)/.test(cv) && !/fluent/i.test(cv));

  ok("MRI is NOT on the CV", !/Magnetic Resonance|\bMRI\b/.test(cv), cv.match(/.{0,30}MRI.{0,30}/)?.[0]);
  ok("SCFHS is NOT on the CV", !/SCFHS/.test(cv));
  ok("RSO is NOT on the CV", !/Radiation Protection Officer|\bRSO\b/.test(cv));
  ok("the misspelling SCAFACH appears nowhere", !/SCAFACH/i.test(cv));

  ok("no invented percentage", !/%|٪/.test(cv), cv.match(/.{0,30}%.{0,30}/)?.[0]);
  ok("no invented examination volume", !/\b\d{2,}\s*(exam|case|patient|study)/i.test(cv));

  ok("MRI is still offered, just not claimed",
    st.suggestions.some((i) => /Magnetic/.test(i.text) && i.status === "suggested"));
  ok("the CV still knows it has unconfirmed suggestions", hasUnconfirmed(st));

  const jobs = rolesToLines(st.profile.roles).filter((l) => !/^[-•]/.test(l));
  eq("one employer, one job entry", jobs.length, 1);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
