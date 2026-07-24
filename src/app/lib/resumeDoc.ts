/**
 * The resume as a document, not as a pile of lines.
 *
 * Three live builds ended with one job carrying ten near-identical duties, and
 * every attempt to dedupe them was a patch on the same root: the resume was
 * stored as an append-only list of strings. Nothing in the codebase could say
 * "this role's duties are these six and no others" — a turn could only add.
 *
 * So roles are structured here, with a bounded and REPLACEABLE bullet set, and
 * the flat lines the template renders are DERIVED from them. There is no longer
 * a place for a near-duplicate to accumulate, which is a stronger guarantee than
 * any comparison of strings.
 */

/** How many bullets a role may carry. */
export const BULLET_CAP_CURRENT = 6;
export const BULLET_CAP_PAST = 4;

export interface Role {
  title: string;
  company: string;
  /** Kept because the CV the product was measured against shows one per role. */
  location: string;
  start: string;
  end: string;
  bullets: string[];
}

/** Identity of a job, independent of how the sentence around it was worded. */
export function jobKey(title: string, company: string): string {
  const norm = (s: string) => String(s || "")
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")   // alef maqsura and ya are written interchangeably
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${norm(title)}@${norm(company)}`;
}

/**
 * Is this role the current one? Bullet budgets differ, because a recruiter
 * reads the recent job and skims the old ones — six on the current role and
 * four on the rest is the shape the sources agree on, and ten is the shape the
 * product was producing.
 */
function isCurrent(r: Role): boolean {
  return /الآن|حالي|present|current|now/i.test(r.end) || !r.end;
}

/** Trim a role to its budget, keeping the earliest (best-drafted) bullets. */
export function capBullets(r: Role): Role {
  const cap = isCurrent(r) ? BULLET_CAP_CURRENT : BULLET_CAP_PAST;
  return { ...r, bullets: r.bullets.slice(0, cap) };
}

/**
 * Two bullets say the same thing when their meaningful words overlap, not when
 * their characters match. "أعد فحوصات الأشعة التشخيصية باستخدام أجهزة متقدمة"
 * and "أعد فحوصات الأشعة التشخيصية باستخدام أجهزة متقدمة مثل MRI" are one duty
 * written twice, and an exact comparison called them two.
 */
const STOP = new Set([
  "في", "من", "على", "الى", "إلى", "مع", "عن", "ثم", "او", "أو", "و", "the", "a",
  "an", "of", "to", "in", "and", "or", "for", "with", "on", "at", "by", "using",
  "such", "as", "مثل", "التي", "الذي", "بشكل", "وفق", "وفقا", "حسب",
]);

function contentWords(s: string): Set<string> {
  return new Set(
    String(s)
      .replace(/^[-•*]\s*/, "")
      .replace(/[ً-ْ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")   // alef maqsura and ya are written interchangeably
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function saysTheSame(a: string, b: string, threshold = 0.6): boolean {
  const A = contentWords(a), B = contentWords(b);
  if (!A.size || !B.size) return false;
  // Meaning cannot be judged from one or two words. Below that, only an exact
  // match counts — otherwise "مهمة أ" and "مهمة ب" collapse into one duty, which
  // is a worse failure than leaving a duplicate.
  if (Math.min(A.size, B.size) < 3) {
    return a.replace(/^[-•*]\s*/, "").trim() === b.replace(/^[-•*]\s*/, "").trim();
  }
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  // Against the SMALLER set: a short duty fully contained in a longer one is
  // the same duty with extra words, which is exactly how these arrive.
  return shared / Math.min(A.size, B.size) >= threshold;
}

/** Drop bullets that restate one already present. */
export function dedupeBullets(bullets: string[]): string[] {
  const out: string[] = [];
  for (const b of bullets) {
    const body = String(b).replace(/^[-•*]\s*/, "").trim();
    if (!body) continue;
    if (out.some((k) => saysTheSame(k, body))) continue;
    out.push(body);
  }
  return out;
}

/**
 * Put a role into the document.
 *
 * `bullets` REPLACES what the role had when `replace` is set — that is the whole
 * point of this module. Otherwise they are merged, deduped by meaning, capped.
 * Known fields are only ever filled in, never blanked by a later empty patch.
 */
export function upsertRole(roles: Role[], incoming: Partial<Role>, replace = false): Role[] {
  const title = String(incoming.title || "").trim();
  const company = String(incoming.company || "").trim();
  if (!title && !company) return roles;

  const key = jobKey(title, company);
  const bare = jobKey(title, "");
  const at = roles.findIndex((r) => {
    const k = jobKey(r.title, r.company);
    // A title-only entry is a stub waiting for its employer; the first role that
    // shares the title claims it.
    return k === key || (!company && k.startsWith(`${bare.slice(0, -1)}`) && jobKey(r.title, "") === bare)
      || (!r.company && jobKey(r.title, "") === bare);
  });

  const incomingBullets = dedupeBullets((incoming.bullets || []).map(String));

  if (at === -1) {
    return [...roles, capBullets({
      title, company,
      location: String(incoming.location || ""),
      start: String(incoming.start || ""),
      end: String(incoming.end || ""),
      bullets: incomingBullets,
    })];
  }

  const prev = roles[at];
  const merged: Role = {
    title: title || prev.title,
    company: company || prev.company,
    location: String(incoming.location || prev.location),
    start: String(incoming.start || prev.start),
    end: String(incoming.end || prev.end),
    bullets: replace ? incomingBullets : dedupeBullets([...prev.bullets, ...incomingBullets]),
  };
  const out = [...roles];
  out[at] = capBullets(merged);
  return out;
}

/** The header line the template and the ATS both read. */
export function roleHeader(r: Role): string {
  const who = [r.title, r.company].filter(Boolean).join(" — ");
  const where = r.location ? `, ${r.location}` : "";
  const period = r.start && r.end ? `${r.start} – ${r.end}` : r.start || r.end;
  return `${who}${where}${period ? ` | ${period}` : ""}`;
}

/** Flat lines for the template — derived, never stored. */
export function rolesToLines(roles: Role[]): string[] {
  const out: string[] = [];
  for (const r of roles) {
    out.push(roleHeader(r));
    for (const b of r.bullets) out.push(`- ${b}`);
  }
  return out;
}

/**
 * What the model is shown of what it has already written.
 *
 * The turn prompt used to send JSON.stringify(profile).slice(0, 2600) — a cut
 * that lands mid-object, so the model was handed invalid JSON and told it was
 * its entire memory. It could not see the duties it had drafted, so it drafted
 * them again in slightly different words, every turn. This is compact by
 * construction and never truncated mid-value.
 */
export function rolesDigest(roles: Role[]): string {
  if (!roles.length) return "(no roles captured yet)";
  return roles.map((r) => {
    const head = roleHeader(r);
    const cap = isCurrent(r) ? BULLET_CAP_CURRENT : BULLET_CAP_PAST;
    const shown = r.bullets.map((b) => `    · ${b.slice(0, 60)}${b.length > 60 ? "…" : ""}`).join("\n");
    return `  ${head}\n    [${r.bullets.length}/${cap} bullets ALREADY WRITTEN — do not write them again]\n${shown}`;
  }).join("\n");
}

/**
 * Read the structured roles out of whatever the client sent.
 *
 * The client has carried `wovenLines` (flat strings) since before roles existed,
 * and older sessions still hold drafts in that shape. Parsing them back means a
 * user who started a CV yesterday does not lose it to today's fix.
 */
export function rolesFromProfile(profile: Record<string, unknown>): Role[] {
  if (Array.isArray(profile.roles)) {
    return (profile.roles as Array<Record<string, unknown>>).map((r) => ({
      title: String(r.title || ""),
      company: String(r.company || ""),
      location: String(r.location || ""),
      start: String(r.start || ""),
      end: String(r.end || ""),
      bullets: Array.isArray(r.bullets) ? r.bullets.map(String) : [],
    })).filter((r) => r.title || r.company);
  }

  // Fall back to the flat lines: a non-dashed line opens a role, dashed lines
  // belong to it.
  const lines = Array.isArray(profile.wovenLines) ? (profile.wovenLines as unknown[]).map(String) : [];
  const roles: Role[] = [];
  for (const raw of lines) {
    const line = String(raw).trim();
    if (!line) continue;
    if (/^[-•]/.test(line)) {
      if (roles.length) roles[roles.length - 1].bullets.push(line.replace(/^[-•]\s*/, ""));
      continue;
    }
    const [who, period = ""] = line.split("|").map((x) => x.trim());
    const [title, company = ""] = who.split(/\s+—\s+|\s+-\s+/).map((x) => x.trim());
    const [start = "", end = ""] = period.split(/\s*[–—]\s*/).map((x) => x.trim());
    roles.push({ title, company, location: "", start, end, bullets: [] });
  }
  return roles.map(capBullets);
}
