/**
 * Folding the brain's patches into one resume.
 *
 * This was inside the client component, and a live build showed why that is the
 * wrong home for it: the same employer came out as three separate jobs on the
 * finished CV. Roles were identified by the exact text of their header line, so
 * "أخصائي أشعة", "أخصائي أشعة — مستشفى دلة | سبتمبر 2024", and "أخصائي أشعة في
 * مستشفى دلة" were three different jobs at three different places as far as the
 * merge was concerned. A recruiter reads that as padding and stops reading.
 *
 * Identity now comes from the title and employer, normalized — not from the
 * sentence they happen to be written in — and a header that carries dates
 * upgrades one that does not, rather than starting a new job beside it.
 */

export interface Profile {
  role: string; name: string; contact: string; summary: string;
  education: string; skills: string; extras: string[];
  /**
   * Certifications and languages are their own sections on a real CV. They used
   * to be folded into education and skills, which cost a healthcare CV the
   * section a recruiter scans first — the product owner's own resume lists eight
   * certifications with issuing bodies and expiry dates.
   */
  certifications: string; languages: string;
  wovenLines: string[]; jobAd: string;
  yearsOfExperience: number | null; industry: string; graduationYear: string;
  draftedFor: string;
}

export const EMPTY_PROFILE: Profile = {
  role: "", name: "", contact: "", summary: "", education: "", skills: "",
  extras: [], wovenLines: [], jobAd: "",
  certifications: "", languages: "",
  yearsOfExperience: null, industry: "", graduationYear: "", draftedFor: "",
};

/** A bullet, as opposed to a role header. */
const IS_BULLET = /^[-•]/;

/**
 * Placeholders belong in a bullet where a metric is genuinely missing — that is
 * the product's honesty promise. They must never appear in a header, because a
 * header carries employer and dates, which are facts the user either gave or did
 * not. "September [add your real year]" is not honesty, it is a lost answer.
 */
const HEADER_PLACEHOLDER = /\s*[|–-]?\s*\[[^\]]*\]/g;

/**
 * Identity of a job: title and employer, stripped of the wording around them.
 * Arabic joins a role to its employer with "في" or "—" or "|", English with "at"
 * or "—", and the same job arrives written all three ways across turns.
 */
export function roleKey(header: string): string {
  return String(header)
    .split("|")[0]                               // drop the date range
    .replace(HEADER_PLACEHOLDER, " ")
    .replace(/[—–-]/g, " ")            // em/en dash → space
    .replace(/\s+(?:في|لدى|بـ|at|in|for)\s+/gi, " ")
    .replace(/[ً-ْ]/g, "")             // Arabic diacritics
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when the header carries a period — the version worth keeping. */
function hasPeriod(header: string): boolean {
  return /\|/.test(header) && !/\[[^\]]*\]/.test(header.split("|").slice(1).join("|"));
}

/**
 * Do two headers name the same job?
 *
 * Equal keys are the easy case. The one that mattered in the live build is the
 * unequal one: the first turn knows only "أخصائي أشعة" and the next turn learns
 * it was at مستشفى دلة. The bare title is a provisional entry waiting for its
 * employer, and its key is a word-prefix of the fuller one — so a prefix match
 * lets the complete header absorb the stub instead of standing beside it.
 * Two real employers never prefix each other; they diverge at the employer.
 */
function sameJob(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(`${short} `);
}

/** Every line under a header, up to the next header. */
function bulletRun(lines: string[], from: number): number {
  let end = from + 1;
  while (end < lines.length && IS_BULLET.test(lines[end].trim())) end++;
  return end;
}

/**
 * A resume line that is neither a header nor dashed renders as a heading in the
 * template, so a duty written without its dash silently becomes a section title.
 */
export function dashify(line: string): string {
  const t = String(line).trim();
  if (!t) return "";
  if (IS_BULLET.test(t)) return `- ${t.replace(/^[-•]\s*/, "")}`;
  return t;
}

/**
 * Place one role's header and bullets into the woven lines, merging with the
 * same job if it is already there.
 */
export function weaveRole(lines: string[], header: string, bullets: string[]): string[] {
  const out = [...lines];
  const clean = header.replace(HEADER_PLACEHOLDER, "").trim();
  if (!clean) { out.push(...bullets); return out; }

  const key = roleKey(clean);
  const at = out.findIndex((l) => !IS_BULLET.test(l.trim()) && sameJob(roleKey(l), key));

  if (at === -1) { out.push(clean, ...bullets); return out; }

  // Same job. Keep whichever header states the period, and union the bullets so
  // a later turn's detail is added rather than replacing what came before.
  const end = bulletRun(out, at);
  const existing = out.slice(at + 1, end);
  const seen = new Set(existing.map((b) => b.replace(/^[-•]\s*/, "").trim()));
  const merged = [...existing];
  for (const b of bullets) {
    const body = b.replace(/^[-•]\s*/, "").trim();
    if (body && !seen.has(body)) { seen.add(body); merged.push(b); }
  }
  // Prefer the header that says more: a period beats none, and failing that the
  // longer key (title + employer) beats a bare title.
  const prev = out[at];
  const keptHeader =
    hasPeriod(clean) !== hasPeriod(prev)
      ? (hasPeriod(clean) ? clean : prev)
      : (roleKey(clean).length >= roleKey(prev).length ? clean : prev);
  out.splice(at, end - at, keptHeader, ...merged);
  return out;
}

/**
 * Free-form resume_lines from the brain. They arrive as a mix of headers and
 * duties, and a duty that lost its dash must not become a heading — nor may a
 * line restate a job that is already on the resume.
 */
export function weaveLoose(lines: string[], incoming: string[]): string[] {
  let out = [...lines];
  for (const raw of incoming) {
    const line = String(raw).trim();
    if (!line) continue;
    if (IS_BULLET.test(line)) {
      const body = line.replace(/^[-•]\s*/, "").trim();
      if (!out.some((l) => l.replace(/^[-•]\s*/, "").trim() === body)) out.push(dashify(line));
      continue;
    }
    // A non-dashed line naming a job we already have is a restatement, not a
    // new section — this is exactly how one employer became three.
    const key = roleKey(line);
    const dup = key && out.some((l) => !IS_BULLET.test(l.trim()) && sameJob(roleKey(l), key));
    if (dup) continue;
    out = [...out, line];
  }
  return out;
}

/** Fold one profile_patch into the profile. */
export function mergePatch(p: Profile, patch: Record<string, unknown>): Profile {
  const n: Profile = { ...p, extras: [...p.extras], wovenLines: [...p.wovenLines] };
  const str = (v: unknown, max: number) => (typeof v === "string" && v ? v.slice(0, max) : "");

  const name = str(patch.name, 100); if (name) n.name = name;
  const contact = str(patch.contact, 200); if (contact) n.contact = contact;
  const role = str(patch.role, 120); if (role) n.role = role;
  const target = str(patch.targetRole, 120); if (target) n.role = target;
  const summary = str(patch.summary, 700); if (summary) n.summary = summary;
  const industry = str(patch.industry, 80); if (industry) n.industry = industry;
  const drafted = str(patch.drafted_for, 120); if (drafted) n.draftedFor = drafted;
  if (typeof patch.years_of_experience === "number" && patch.years_of_experience >= 0) {
    n.yearsOfExperience = patch.years_of_experience;
  }

  const eduStr = str(patch.education, 400); if (eduStr) n.education = eduStr;
  if (patch.education && typeof patch.education === "object" && !Array.isArray(patch.education)) {
    const e = patch.education as Record<string, unknown>;
    const gy = String(e.graduation_year || "").match(/\d{4}/)?.[0] || "";
    if (gy && !n.graduationYear) n.graduationYear = gy;
    const line = [
      [e.degree, e.field].filter(Boolean).map(String).join(" — "),
      e.university ? String(e.university) : "",
      n.graduationYear,
    ].filter(Boolean).join(" · ");
    if (line && !n.education.includes(line)) n.education = n.education ? `${n.education}\n${line}` : line;
  }
  const cert = str(patch.certifications, 400);
  if (cert && !n.certifications.includes(cert)) {
    n.certifications = n.certifications ? `${n.certifications}\n${cert}` : cert;
  }
  const langs = str(patch.languages, 200);
  if (langs) n.languages = langs;

  if (typeof patch.skills === "string" && patch.skills) n.skills = patch.skills.slice(0, 400);
  if (Array.isArray(patch.skills)) n.skills = patch.skills.map(String).filter(Boolean).slice(0, 12).join("، ");
  const jobAd = str(patch.jobAd, 3000); if (jobAd) n.jobAd = jobAd;
  if (Array.isArray(patch.extras)) n.extras.push(...patch.extras.map(String).slice(0, 6));

  if (Array.isArray(patch.experiences)) {
    for (const ex of patch.experiences as Array<Record<string, unknown>>) {
      let head = "";
      if (typeof ex?.header === "string") head = ex.header;
      else if (ex?.header && typeof ex.header === "object") {
        const h = ex.header as Record<string, unknown>;
        const from = String(h.start_date || "").trim();
        const to = String(h.end_date || "").trim();
        const period = from && to ? `${from} – ${to}` : from || to;
        head = [h.title, h.company].filter(Boolean).join(" — ") + (period ? ` | ${period}` : "");
      }
      const bullets = Array.isArray(ex?.bullets)
        ? (ex.bullets as unknown[]).map((b) => `- ${String(b).replace(/^[-•]\s*/, "")}`)
        : [];
      n.wovenLines = weaveRole(n.wovenLines, head, bullets);
    }
  }
  return n;
}

/** The canonical ATS order the product ships. */
export function assembleResume(p: Profile, rtl: boolean): string {
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  if (p.contact) parts.push(p.contact);
  if (p.role) parts.push(p.role);
  if (p.summary) parts.push(`\n${rtl ? "الملخص المهني" : "PROFESSIONAL SUMMARY"}\n${p.summary}`);
  if (p.wovenLines.length) parts.push(`\n${rtl ? "الخبرة العملية" : "WORK EXPERIENCE"}\n${p.wovenLines.join("\n")}`);
  if (p.skills) parts.push(`\n${rtl ? "المهارات" : "SKILLS"}\n${p.skills}`);
  if (p.education) parts.push(`\n${rtl ? "التعليم" : "EDUCATION"}\n${p.education}`);
  if (p.certifications) parts.push(`\n${rtl ? "الشهادات والتدريب" : "CERTIFICATIONS & TRAINING"}\n${p.certifications}`);
  if (p.languages) parts.push(`\n${rtl ? "اللغات" : "LANGUAGES"}\n${p.languages}`);
  if (p.extras.length) parts.push(`\n${rtl ? "إضافات" : "ADDITIONAL"}\n${p.extras.map((x) => `- ${x}`).join("\n")}`);
  return parts.join("\n");
}
