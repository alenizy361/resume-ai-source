/**
 * The pre-export review: what the CV is worth, and WHY.
 *
 * The shipped product printed one number over every CV and called it an "ATS
 * match score" — including when the user had never pasted a job advert. With no
 * advert there is nothing to match against, so the number was an opinion wearing
 * a metric's clothes: someone building a CV with no target job saw "68% ATS
 * match" and could not ask the only sensible question, "match with what?".
 *
 * Two rules follow, and they are the whole design of this module.
 *
 * 1. The KIND of report is decided by the data, not by the caller's mood. No job
 *    advert means `reviewQuality`, whose dimensions are all properties of the CV
 *    itself and whose labels never say "match". An advert means `reviewMatch`,
 *    which can finally name what it is comparing against. `reviewMatch` refuses
 *    to run without an advert rather than quietly inventing a match out of
 *    nothing — the failure mode this module exists to delete.
 *
 * 2. Every deduction carries its reason. `Dimension.why` is required, so a score
 *    that cost the user points cannot exist without a sentence explaining it.
 *    "Specificity 40" is a verdict; "4 of 10 bullets name a number, a system or a
 *    named tool" is something a person can act on this afternoon.
 *
 * Honesty also decides what this file will NOT do. A requirement from the advert
 * that the user's confirmed evidence does not support comes back in
 * `unsupported`, and there is deliberately NO function here that writes those
 * into the CV — the same structural reason `builderDoc` keeps suggestions out of
 * `profile`. "Add anyway" cannot be offered by a UI that has no function to call.
 * The three groups are the honest ones: `supported` (asked for, and on the CV),
 * `missingFromCv` (the user has the evidence, the document does not show it) and
 * `unsupported` (asked for, and not something the user has told us they have).
 *
 * Scoring is deterministic — no clock, no randomness. The credential-expiry check
 * therefore takes its reference date as an ARGUMENT: a score that drifts while
 * nothing was edited destroys trust in the number, and a test that reads the
 * clock passes today and fails in eight months for no reason anyone can see.
 */

import {
  type BuilderState, type Credential, type Item, type LanguageEntry,
  hasUnconfirmed, normalizeLabel,
} from "./builderDoc.ts";
import { assembleResume } from "./mergeProfile.ts";
import { languageSet, languageMismatch } from "./languages.ts";
import { type Role, saysTheSame, rolesFromProfile } from "./resumeDoc.ts";

/* ───────────────────────── shape of a review ───────────────────────── */

export type Severity = "critical" | "recommended" | "optional";

export interface Finding {
  id: string;
  severity: Severity;
  section: string;       // which builder section to jump to
  title: string;         // short, human, actionable
  detail: string;        // why it matters — never scolding
  fixHint?: string;
}

export interface Dimension {
  id: string;
  label: string;
  score: number;          // 0-100
  weight: number;         // contribution to the headline
  why: string;            // the explanation for the deduction, ALWAYS present
}

export interface QualityReport {
  /** "CV Quality Score" — used when there is NO job description. */
  kind: "quality";
  score: number;
  dimensions: Dimension[];
  findings: Finding[];
}

export interface MatchReport {
  /** "Job Match Score" — ONLY when a job description exists. */
  kind: "match";
  score: number;
  dimensions: Dimension[];
  findings: Finding[];
  /** The three honest groups. */
  supported: string[];        // in the JD and evidenced in the CV
  missingFromCv: string[];    // user has the evidence but the CV omits it
  unsupported: string[];      // in the JD, NOT in the user's confirmed evidence
}

/**
 * Weights sum to 1 in both reports, so the headline is a weighted average of
 * things the user can read rather than a curve nobody can reproduce.
 *
 * Completeness dominates the quality score because an incomplete CV fails before
 * style matters — a missing phone number costs the interview no matter how well
 * the bullets are written. Required-skill coverage dominates the match score for
 * the mirror-image reason: recruiters filter on the must-haves first.
 */
const QUALITY_WEIGHTS = {
  completeness: 0.30,
  specificity: 0.20,
  evidence: 0.15,
  readability: 0.15,
  ats: 0.10,
  language: 0.10,
} as const;

const MATCH_WEIGHTS = {
  required: 0.35,
  preferred: 0.10,
  experience: 0.15,
  title: 0.10,
  keyword: 0.15,
  credential: 0.15,
} as const;

/* ───────────────────────── text plumbing ───────────────────────── */

/**
 * Filler that carries no signal in a job advert. "5 years of experience in CT"
 * is a requirement about CT; matching on "years" and "experience" would call
 * every CV a match for every advert.
 */
const FILLER = new Set([
  "the", "a", "an", "of", "to", "in", "and", "or", "for", "with", "on", "at",
  "by", "as", "is", "are", "be", "you", "your", "we", "our", "their", "this",
  "that", "will", "can", "must", "should", "have", "has", "had", "who", "any",
  "all", "per", "from", "into", "up", "out", "if", "not", "also", "well", "its",
  "it", "them", "us", "new", "within", "etc", "title", "vacancy", "apply",
  "years", "year", "experience", "experienced", "ability", "able", "strong",
  "excellent", "good", "proven", "demonstrated", "minimum", "knowledge",
  "skills", "skill", "required", "requirements", "preferred", "plus", "work",
  "working", "understanding", "familiarity", "familiar", "hands", "related",
  "field", "role", "job", "position", "candidate", "candidates", "applicant",
  "في", "من", "على", "الى", "مع", "عن", "او", "و", "ثم", "التي", "الذي", "هذا",
  "مثل", "حسب", "وفق", "خبره", "سنوات", "سنه", "مهارات", "القدره", "المطلوب",
  "يفضل", "يشترط", "العمل", "يجب", "لدي", "كل", "غير", "قد", "ان",
]);

/** Words of a string, normalized so Arabic orthography and casing collapse. */
function words(s: string): string[] {
  return normalizeLabel(s).split(" ").filter(Boolean);
}

/** The words that actually carry meaning: no filler, no bare numbers. */
function contentWords(s: string): string[] {
  return words(s).filter((w) => w.length > 1 && !FILLER.has(w) && !/^\d+$/.test(w));
}

function tokenSet(s: string): Set<string> {
  return new Set(contentWords(s));
}

/** Does this text mention that phrase, as whole words? */
function mentions(haystack: string, phrase: string): boolean {
  const p = normalizeLabel(phrase);
  if (!p) return false;
  return ` ${normalizeLabel(haystack)} `.includes(` ${p} `);
}

/**
 * Is a requirement supported by a body of evidence?
 *
 * Judged on meaning, not on string equality: an advert says "Bachelor's degree in
 * Radiologic Technology" and the CV says "Bachelor of Radiologic Technology".
 * Most of the requirement's meaningful words must be present, so a requirement
 * naming two modalities is not "covered" by a CV that has one of them.
 */
function evidenced(evidence: Set<string>, requirement: string): boolean {
  const need = contentWords(requirement);
  if (!need.length) return false;
  let hit = 0;
  for (const w of new Set(need)) if (evidence.has(w)) hit++;
  const distinct = new Set(need).size;
  return hit / distinct >= 0.6;
}

function dedupeLabels(list: string[], cap = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const text = String(raw).replace(/^[-•*·]\s*/, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = normalizeLabel(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
const pct = (part: number, whole: number): number => (whole > 0 ? clamp((100 * part) / whole) : 0);
const list = (xs: string[], cap = 4): string => xs.slice(0, cap).join(", ") + (xs.length > cap ? `, +${xs.length - cap} more` : "");

/* ───────────────────────── the job advert ───────────────────────── */

const BULLET_MARK = /^[\s]*[-–•*·▪◦●o]\s+/;

/** Headings that open a section of an advert, in both languages the product ships. */
const HEAD_PREFERRED = /(preferred|nice[- ]to[- ]have|desirable|desired|bonus|advantage|a plus|يفضل|مرغوب|ميزه|ميزة)/i;
const HEAD_CREDENTIALS = /(certificat|certification|licen[cs]|registration|credential|education|qualification|الشهادات|الشهادة|الترخيص|التسجيل|المؤهل)/i;
// "technolog" is deliberately narrowed to the noun: "Radiology Technologist" is a
// job title, and reading it as a "Technology:" heading swallowed the whole advert
// into the tools bucket.
const HEAD_TOOLS = /(tools|systems|software|technolog(?:y|ies)|stack|platforms|equipment|الانظمه|الأنظمة|البرامج|الادوات|الأدوات|الاجهزه|الأجهزة)/i;

/** "Job Title: X" is a field, never a section heading. */
const TITLE_LABEL = /^\s*(?:job\s*title|position|role|title|vacancy|employer|company|location|المسمى الوظيفي|المسمى|الوظيفة|الوظيفه|جهة العمل|الموقع)\s*[:：-]/i;
const HEAD_REQUIRED = /(requirement|required|must have|essential|responsibilit|duties|what you|the role|about the role|المطلوب|المهام|المسؤوليات|الشروط|الواجبات)/i;

/** Credential language, wherever it appears — a licence is never "nice to have". */
const CREDENTIAL_WORD = /(licen[cs]e|licensed|registration|registered|certif|accredit|BLS|ACLS|PALS|CPR|SCFHS|PMP|CFA|CPA|degree|diploma|bachelor|master|doctorate|شهاده|شهادة|ترخيص|رخصه|رخصة|تسجيل|بكالوريوس|دبلوم|ماجستير)/i;

/**
 * Named tools worth recognising even when the advert buries them in prose. This
 * is a lexicon, not a guess: an acronym scan alone reads "KSA" and "SAR" as
 * software, and a recruiter's system does not.
 */
const TOOL_LEXICON = [
  "PACS", "RIS", "HIS", "EMR", "EHR", "Epic", "Cerner", "Oracle", "SAP",
  "Salesforce", "HubSpot", "Jira", "Confluence", "Figma", "Photoshop",
  "Illustrator", "AutoCAD", "SolidWorks", "MATLAB", "Excel", "PowerPoint",
  "Word", "Power BI", "Tableau", "Looker", "SQL", "Python", "JavaScript",
  "TypeScript", "React", "Node.js", "Java", "Docker", "Kubernetes", "AWS",
  "Azure", "Git", "Linux", "Figma", "Canva", "QuickBooks", "Xero",
  "MRI", "CT", "X-ray", "Ultrasound", "Mammography", "Fluoroscopy",
  "Angiography", "DEXA", "OPG", "C-arm",
];

/** Acronyms that are places, currencies or contract terms — never tools. */
const NOT_A_TOOL = new Set([
  "KSA", "UAE", "USA", "UK", "SAR", "AED", "USD", "HR", "CV", "JD", "OK",
  "ATS", "EU", "AM", "PM", "ID", "IT", "QA", "KPI", "SLA", "FTE", "MOH",
]);

function headingOf(line: string): "" | "required" | "preferred" | "tools" | "credentials" {
  // A heading is short and announces a section; a 30-word sentence containing
  // the word "required" is a requirement, not a heading.
  if (TITLE_LABEL.test(line)) return "";
  const colonTerminated = /[:：]\s*$/.test(line);
  const bare = line.replace(/[:：]\s*$/, "").trim();
  if (bare.length > 60 || words(bare).length > 7) return "";
  // Without a colon a heading has to look like one: a few words, no sentence
  // punctuation. "Experience with PACS systems." is a requirement.
  if (!colonTerminated && (words(bare).length > 5 || /[.!؟?]$/.test(bare))) return "";
  if (HEAD_PREFERRED.test(bare)) return "preferred";
  if (HEAD_CREDENTIALS.test(bare)) return "credentials";
  if (HEAD_TOOLS.test(bare)) return "tools";
  if (HEAD_REQUIRED.test(bare)) return "required";
  return "";
}

function titleFrom(text: string, lines: string[]): string {
  const labelled = text.match(/^\s*(?:job\s*title|position|role|title|vacancy|المسمى الوظيفي|المسمى|الوظيفة|الوظيفه)\s*[:：-]\s*(.+)$/im);
  if (labelled) return labelled[1].split(/[|(]/)[0].trim().slice(0, 80);
  const hiring = text.match(/(?:hiring|seeking|looking for|recruiting|نبحث عن|مطلوب)\s+(?:an?\s+|the\s+)?([^.,\n]{3,60})/i);
  if (hiring) return hiring[1].trim().replace(/\s+(to|who|with|for)$/i, "").slice(0, 80);
  // Failing that, the first line of an advert is almost always the title.
  const first = (lines[0] || "").replace(BULLET_MARK, "").trim();
  return first.length <= 80 && !headingOf(first) ? first : "";
}

/**
 * Read the advert into the parts a review can actually reason about.
 *
 * Deliberately conservative: an advert whose requirements cannot be located
 * yields empty lists, and the dimensions below say so out loud instead of
 * scoring the user against a section that was never found.
 */
export function parseJobAd(text: string): {
  title: string; required: string[]; preferred: string[];
  tools: string[]; credentials: string[]; keywords: string[];
} {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const required: string[] = [];
  const preferred: string[] = [];
  const tools: string[] = [];
  const credentials: string[] = [];

  const push = (bucket: string, body: string): void => {
    const item = body.replace(BULLET_MARK, "").replace(/[.;،]+\s*$/, "").trim();
    if (!item || item.length < 3) return;
    if (bucket === "tools" || bucket === "credentials") {
      // These arrive as lists ("PACS, RIS, HIS"), unlike a requirement sentence.
      for (const part of item.split(/[,،;/|]| and | و /i)) {
        const p = part.trim();
        if (p.length >= 2) (bucket === "tools" ? tools : credentials).push(p.slice(0, 60));
      }
      return;
    }
    const clipped = item.slice(0, 140);
    (bucket === "preferred" ? preferred : required).push(clipped);
    // A licence named inside a requirement is still a licence.
    if (CREDENTIAL_WORD.test(clipped)) credentials.push(clipped);
  };

  let bucket: "" | "required" | "preferred" | "tools" | "credentials" = "";
  for (const line of lines) {
    const head = headingOf(line);
    if (head) {
      bucket = head;
      const rest = line.split(/[:：]/).slice(1).join(":").trim();
      if (rest) push(bucket, rest);
      continue;
    }
    const body = line.replace(BULLET_MARK, "").trim();
    if (!body) continue;
    const bulleted = BULLET_MARK.test(line);
    if (bucket && (bulleted || body.length <= 180)) { push(bucket, body); continue; }
    // Outside any section, only sentences that state an obligation count.
    if (HEAD_PREFERRED.test(body)) push("preferred", body);
    else if (/\bmust\b|\brequire[sd]?\b|\bminimum\b|يجب|يشترط/i.test(body)) push("required", body);
    else if (CREDENTIAL_WORD.test(body) && body.length <= 120) push("credentials", body);
  }

  // Named tools, wherever they were written.
  for (const tool of TOOL_LEXICON) if (mentions(raw, tool)) tools.push(tool);
  for (const m of raw.match(/\b[A-Z][A-Za-z]*[A-Z][A-Za-z0-9]*\b/g) || []) {
    if (m.length >= 2 && m.length <= 8 && !NOT_A_TOOL.has(m.toUpperCase())) tools.push(m);
  }

  const title = titleFrom(raw, lines);
  const creds = dedupeLabels(credentials, 10);
  const out = {
    title,
    required: dedupeLabels(required, 20),
    preferred: dedupeLabels(preferred, 12),
    // "BLS" is a certification, not a piece of software. The acronym scan cannot
    // tell them apart, so anything already named as a credential is not a tool.
    tools: dedupeLabels(tools, 16).filter((t) => !creds.some((c) => mentions(c, t))),
    credentials: creds,
    keywords: [] as string[],
  };

  /**
   * Keywords, kept in the spelling the advert used so the UI can show the user
   * their own advert back.
   *
   * A plain frequency ranking of the whole posting returns "hiring", "group" and
   * "its" — words no CV will ever contain, which then sit in the user's "missing
   * keywords" list as noise they cannot act on. So a keyword has to earn its
   * place: it appears in the title or in a requirement, or it recurs in the
   * posting. Ties break alphabetically, because determinism is a promise here.
   */
  const counts = new Map<string, number>();
  const spelling = new Map<string, string>();
  for (const m of raw.match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu) || []) {
    const key = normalizeLabel(m);
    if (!key || key.length < 2 || FILLER.has(key) || /^\d+$/.test(key)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
    // Trailing sentence punctuation is not part of a keyword ("Riyadh." → "Riyadh").
    if (!spelling.has(key)) spelling.set(key, m.replace(/[.,;:]+$/, ""));
  }
  const salient = new Set(contentWords(
    [title, ...out.required, ...out.preferred, ...out.tools, ...out.credentials].join(" "),
  ));
  const earned = [...counts.entries()].filter(([k, n]) => salient.has(k) || n >= 2);
  const pool = earned.length ? earned : [...counts.entries()];
  out.keywords = pool
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([key]) => spelling.get(key) as string);

  return out;
}

/**
 * Everything the advert asks for, as one list with the overlaps removed.
 *
 * The same demand arrives more than once — "PACS documentation" as a requirement
 * and "PACS" from the tool lexicon — and a review that reports both makes the
 * user fix one thing twice. Requirements come first, so a bare tool name already
 * contained in a requirement is dropped rather than repeating it.
 */
function mergeAsks(groups: string[][], cap = 60): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const n = normalizeLabel(item);
      if (!n) continue;
      if (out.some((k) => ` ${normalizeLabel(k)} `.includes(` ${n} `))) continue;
      out.push(item);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/* ───────────────────────── the CV, as facts ───────────────────────── */

interface CvBullet { roleIndex: number; role: Role; text: string; length: number }

interface Facts {
  roles: Role[];
  bullets: CvBullet[];
  skills: string[];
  summary: string;
  education: string;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedin: boolean;
  /** Exactly what an export would contain — nothing unconfirmed is in here. */
  cv: string;
  cvTokens: Set<string>;
  /** The CV plus confirmed facts that have not been written onto it yet. */
  confirmed: string;
  confirmedTokens: Set<string>;
  titles: string[];
}

function credentialLine(c: Credential): string {
  return [c.title, c.issuer, c.credentialNumber].filter(Boolean).join(" ");
}

function languageLine(l: LanguageEntry): string {
  return [l.name, l.level].filter(Boolean).join(" ");
}

/** Confirmed items may linger in the bag; suggested ones are not evidence at all. */
function confirmedItems(items: Item[]): Item[] {
  return items.filter((i) => i.status === "confirmed");
}

function readFacts(state: BuilderState): Facts {
  const p = state.profile;
  const per = state.personal;

  // Drafts written before `roles` existed hold their experience only as flat
  // lines; read those back rather than telling the user their CV has no jobs.
  const roles = p.roles && p.roles.length ? p.roles : rolesFromProfile({ wovenLines: p.wovenLines });

  const bullets: CvBullet[] = [];
  roles.forEach((role, roleIndex) => {
    for (const b of role.bullets) {
      const text = String(b).replace(/^[-•*]\s*/, "").trim();
      if (text) bullets.push({ roleIndex, role, text, length: words(text).length });
    }
  });

  const skills = String(p.skills || "").split(/[,،;|\n]/).map((s) => s.trim()).filter(Boolean);
  const contact = `${per.email} ${per.phone} ${p.contact}`;
  const cv = [
    assembleResume(p, false),
    per.fullName, per.professionalTitle, per.city, per.country,
    per.email, per.phone, per.linkedin, per.portfolio,
  ].filter(Boolean).join("\n");
  const confirmed = [
    cv,
    ...state.credentials.filter((c) => c.status === "confirmed").map(credentialLine),
    ...state.languages.filter((l) => l.status === "confirmed").map(languageLine),
    ...confirmedItems(state.suggestions).map((i) => i.text),
  ].filter(Boolean).join("\n");

  return {
    roles,
    bullets,
    skills,
    summary: String(p.summary || ""),
    education: String(p.education || ""),
    hasEmail: /[^\s@]+@[^\s@]+\.[^\s@]+/.test(contact),
    hasPhone: /\d[\d\s()+-]{6,}/.test(contact),
    hasLinkedin: /linkedin\.com|\/in\//i.test(`${per.linkedin} ${per.portfolio} ${p.contact}`),
    cv,
    cvTokens: tokenSet(cv),
    confirmed,
    confirmedTokens: tokenSet(confirmed),
    titles: [per.professionalTitle, p.role, state.target.title, roles[0]?.title || ""].filter(Boolean),
  };
}

/* ───────────────────────── writing quality ───────────────────────── */

/**
 * Openers that spend the most valuable words on a CV saying nothing. "Responsible
 * for X" describes a job description; "Operated X to protocol" describes a person.
 * The Arabic pair matter as much: the product's own market writes duties as
 * "مسؤول عن …" by default, and no English-only rule would ever catch it.
 *
 * Arabic word boundaries are not `\b` — JavaScript's `\b` is ASCII-only, so an
 * Arabic pattern ending in `\b` matches almost nothing. Lookaheads instead.
 */
const WEAK_OPENERS: Array<{ label: string; re: RegExp }> = [
  { label: "Responsible for", re: /^\s*(?:was\s+|am\s+)?responsible\s+for(?=\s|$)/i },
  { label: "Worked on", re: /^\s*worked\s+(?:on|with|as)(?=\s|$)/i },
  { label: "Helped with", re: /^\s*helped\s+(?:with|to|in)(?=\s|$)/i },
  { label: "Duties included", re: /^\s*(?:my\s+)?(?:duties|tasks|responsibilities)\s+includ/i },
  { label: "Involved in", re: /^\s*(?:was\s+)?involved\s+in(?=\s|$)/i },
  { label: "Tasked with", re: /^\s*(?:was\s+)?tasked\s+with(?=\s|$)/i },
  { label: "مسؤول عن", re: /^\s*(?:كنت\s+)?مسؤول(?:ة|ًا|ا)?\s*عن(?=\s|$)/ },
  { label: "قمت بـ", re: /^\s*قمت\s*ب/ },
];

function weakOpener(text: string): string {
  for (const w of WEAK_OPENERS) if (w.re.test(text)) return w.label;
  return "";
}

/** A bullet longer than this is a paragraph, and a recruiter skims past it. */
const BULLET_WORD_CAP = 30;

/** Two labels naming one skill: "CT Scan" / "ct-scan", or "MRI" inside "MRI imaging". */
function sameSkill(a: string, b: string): boolean {
  const x = normalizeLabel(a), y = normalizeLabel(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const shortest = Math.min(x.split(" ").length, y.split(" ").length);
  return shortest <= 3 && (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `));
}

interface Stuffed { term: string; times: number }

/**
 * Keyword stuffing: the same term in the summary AND the skills list AND more
 * than two bullets. No applicant tracking system scores a term higher for
 * appearing five times — the ranking ones use presence, and the humans reading
 * afterwards notice the padding. So this is reported, and (see
 * `keywordAlignment`) coverage is counted as PRESENT-OR-NOT, never as a
 * frequency, so repetition has no route to raise a score.
 */
function stuffedTerms(f: Facts): Stuffed[] {
  const out: Stuffed[] = [];
  for (const skill of f.skills) {
    const inSummary = mentions(f.summary, skill);
    if (!inSummary) continue;
    const inBullets = f.bullets.filter((b) => mentions(b.text, skill)).length;
    if (inBullets > 2) out.push({ term: skill, times: 2 + inBullets });
  }
  return out;
}

function duplicateSkillPairs(f: Facts): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < f.skills.length; i++) {
    for (let j = i + 1; j < f.skills.length; j++) {
      if (sameSkill(f.skills[i], f.skills[j])) pairs.push(`"${f.skills[i]}" / "${f.skills[j]}"`);
    }
  }
  return pairs;
}

function repeatedDuties(f: Facts): string[] {
  const out: string[] = [];
  for (let i = 0; i < f.bullets.length; i++) {
    for (let j = i + 1; j < f.bullets.length; j++) {
      const a = f.bullets[i], b = f.bullets[j];
      if (a.roleIndex === b.roleIndex) continue;   // one role's own repeats are capped elsewhere
      if (saysTheSame(a.text, b.text)) out.push(`"${a.text.slice(0, 60)}"`);
    }
  }
  return dedupeLabels(out, 6);
}

/** A role is current when it says so, or when it has no end date. */
function isCurrentRole(r: Role): boolean {
  return /الآن|حالي|present|current|now/i.test(r.end) || !r.end;
}

/* ───────────────────────── dates, without a clock ───────────────────────── */

/**
 * Month names, because users type dates the way they say them. "Sep 2024" is the
 * format the product's own date fields suggest, and a parser that only accepts
 * ISO would have told every one of those users their roles have no dates.
 */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, مايو: 5, يونيو: 6,
  يوليو: 7, اغسطس: 8, سبتمبر: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

function monthFrom(s: string): number {
  for (const w of words(s)) {
    if (/^[a-z]+$/.test(w)) { const m = MONTHS[w.slice(0, 3)]; if (m) return m; }
    else if (MONTHS[w]) return MONTHS[w];
  }
  return 0;
}

/**
 * A comparable number for a partial date. `end` decides how a missing month or
 * day is filled: an expiry of "2026" means the end of 2026, so filling it with
 * January would flag a credential that is still perfectly valid.
 *
 * Returns 0 for anything unreadable — and every caller treats 0 as "we do not
 * know", never as "the beginning of time".
 */
function dateKey(raw: string, end: boolean): number {
  const s = String(raw || "").trim();
  if (!s) return 0;
  let y = 0, m = 0, d = 0;
  let hit = s.match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?$/);
  if (hit) { y = +hit[1]; m = +(hit[2] || 0); d = +(hit[3] || 0); }
  if (!y && (hit = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +hit[1]; m = +hit[2]; y = +hit[3]; }
  if (!y && (hit = s.match(/^(\d{1,2})[-/.](\d{4})$/))) { m = +hit[1]; y = +hit[2]; }
  if (!y && (hit = s.match(/(?:19|20)\d{2}/))) { y = +hit[0]; m = monthFrom(s); }
  if (!y || m > 12) return 0;
  if (!m) m = end ? 12 : 1;
  if (!d) d = end ? 31 : 1;
  return y * 10000 + m * 100 + d;
}

/** Expired as of `reference`. Unparseable dates are never called expired. */
function isExpired(expiry: string, reference: string): boolean {
  const e = dateKey(expiry, true), r = dateKey(reference, false);
  return e > 0 && r > 0 && e < r;
}

/* ───────────────────────── the checklist ───────────────────────── */

/**
 * The findings both reports share: the things that are wrong with the document
 * regardless of which job it is aimed at.
 *
 * `referenceDate` is the day the review is being run, supplied by the caller.
 * Passing nothing simply skips the expiry check — silence is the honest output
 * when we do not know what day it is.
 */
function checklist(state: BuilderState, f: Facts, referenceDate: string): Finding[] {
  const out: Finding[] = [];
  const add = (fi: Finding): void => { out.push(fi); };

  /* ── critical: the CV cannot do its job in this state ── */

  if (!f.hasEmail || !f.hasPhone) {
    const missing = [!f.hasEmail && "an email address", !f.hasPhone && "a phone number"].filter(Boolean).join(" and ");
    add({
      id: "missing-contact", severity: "critical", section: "personal",
      title: `Add ${missing}`,
      detail: "A recruiter who wants to call you has to be able to. Contact details are the one part of a CV that is never optional.",
      fixHint: "Personal details → phone and email.",
    });
  }

  const undated = f.roles.filter((r) => !dateKey(r.start, false));
  if (undated.length) {
    add({
      id: "missing-dates", severity: "critical", section: "experience",
      title: `Add start dates to ${undated.length === 1 ? "one role" : `${undated.length} roles`}`,
      detail: `${list(undated.map((r) => r.title || r.company || "an untitled role"))} — applicant tracking systems build your career timeline from these dates, and a role without them can be dropped from the parse entirely.`,
      fixHint: "Month and year is enough, e.g. \"Sep 2024\".",
    });
  }

  if (!f.roles.length) {
    add({
      id: "empty-experience", severity: "critical", section: "experience",
      title: "Add your work experience",
      detail: "Experience is the section recruiters read first. Even one role with two honest bullets changes this CV from a form into an application.",
    });
  }
  if (!f.skills.length) {
    add({
      id: "empty-skills", severity: "critical", section: "skills",
      title: "Add your skills",
      detail: "The skills section is where keyword filters look. Without it, a search for the skills you actually have will not find you.",
    });
  }
  if (!f.education.trim()) {
    add({
      id: "empty-education", severity: "critical", section: "education",
      title: "Add your education",
      detail: "Most application forms require it, and a missing education section reads as an omission rather than an absence.",
    });
  }

  // The product's central promise, checked at the last possible moment: nothing
  // unconfirmed may leave in a document.
  if (hasUnconfirmed(state)) {
    const n = state.suggestions.filter((i) => i.status === "suggested").length;
    add({
      id: "pending-suggestions", severity: "critical", section: "review",
      title: `Review ${n} pending suggestion${n === 1 ? "" : "s"} before exporting`,
      detail: "These are still suggestions, so they are not on your CV — and they will not be added on your behalf. Keep the ones that are true of you and reject the rest.",
      fixHint: "Each one can be confirmed, edited first, or rejected.",
    });
  }

  if (referenceDate) {
    for (const c of state.credentials) {
      if (c.status !== "confirmed") continue;   // a suggested credential is not a claim
      if (!isExpired(c.expiryDate, referenceDate)) continue;
      add({
        id: `expired-credential:${c.id}`, severity: "critical", section: "credentials",
        title: `${c.title} expired on ${c.expiryDate}`,
        detail: "An expired licence or certification on a live CV reads as a lapsed one, and in regulated roles it can end the application. Renew it, or move it to a dated history line.",
        fixHint: "Update the expiry date, or remove it until it is renewed.",
      });
    }
  }

  /*
   * The CV is written in a language the user did not choose for it.
   *
   * Critical, and it is the one finding here that nothing else in the product can surface: the
   * preview renders exactly what was typed, so a document written half in Arabic and half in
   * English looks perfectly correct on screen, and the score is computed over that same text. It
   * only becomes visible to the applicant when a recruiter's filter reads it as noise.
   *
   * The name and the contact line are excluded from the measurement — a name is in whatever script
   * the person's name is in, and flagging "عبدالعزيز العنزي" on an English CV would be flagging the
   * most correct thing on the page. See `authoredText` in `lib/languages.ts`.
   */
  {
    const set = languageSet(state);
    const mismatch = languageMismatch(set);
    if (mismatch) {
      const wanted = mismatch.expected === "ar" ? "Arabic" : "English";
      const wrote = mismatch.found === "ar" ? "Arabic" : mismatch.found === "en" ? "English" : "both languages";
      add({
        /*
         * Fatal when the whole document is in the other language; a strong recommendation when it
         * is split. The costs genuinely differ — an English-language employer searching an Arabic
         * CV finds nothing at all, while a split one still matches half its own keywords — and
         * severity is what the review uses to order what a person reads first.
         */
        id: `language-mismatch:${mismatch.code}`,
        severity: mismatch.code === "input-mixed" ? "recommended" : "critical",
        section: "target",
        title: mismatch.code === "input-mixed"
          ? "This CV is written in two languages"
          : `This CV is set to ${wanted} but is written in ${wrote}`,
        detail: mismatch.code === "input-mixed"
          ? `Your responsibilities and skills are written in ${wrote}. A parser indexes one document in one language; a split one matches neither search, and a human reader has to switch direction mid-page.`
          : `The document language is ${wanted}, and what you have written is ${wrote}. Whichever is right, they have to agree — an employer searching in ${wanted} will not find text written in ${wrote}.`,
        fixHint: mismatch.code === "input-mixed"
          ? "Pick the language the employer reads, and move the rest into the other version."
          : `Either change the CV language on the target step, or rewrite these lines in ${wanted}.`,
      });
    }
  }

  /* ── recommended: real improvements, not errors ── */

  const dupes = duplicateSkillPairs(f);
  if (dupes.length) {
    add({
      id: "duplicate-skills", severity: "recommended", section: "skills",
      title: "Two entries name the same skill",
      detail: `${list(dupes, 3)} read as one skill to a recruiter and to a parser, and the repeat spends a slot another real skill could use.`,
      fixHint: "Keep the spelling the job advert uses.",
    });
  }

  const repeats = repeatedDuties(f);
  if (repeats.length) {
    add({
      id: "repeated-duties", severity: "recommended", section: "experience",
      title: "The same responsibility appears under more than one role",
      detail: `${list(repeats, 2)} is written twice. Repeating a duty makes two jobs look like one; what differed between them — scale, equipment, seniority — is what a recruiter is looking for.`,
      fixHint: "Keep it on the role where it mattered most, and say what was different on the other.",
    });
  }

  const long = f.bullets.filter((b) => b.length > BULLET_WORD_CAP);
  if (long.length) {
    add({
      id: "long-bullets", severity: "recommended", section: "experience",
      title: `${long.length} bullet${long.length === 1 ? " is" : "s are"} longer than ${BULLET_WORD_CAP} words`,
      detail: `The longest runs to ${Math.max(...long.map((b) => b.length))} words. A CV is skimmed in about six seconds per role, and a bullet that takes longer than a breath to read is skipped rather than read slowly.`,
      fixHint: "One achievement per bullet; split the rest into a second line.",
    });
  }

  const weak = f.bullets.map((b) => ({ b, label: weakOpener(b.text) })).filter((x) => x.label);
  if (weak.length) {
    add({
      id: "weak-openers", severity: "recommended", section: "experience",
      title: `${weak.length} bullet${weak.length === 1 ? "" : "s"} open with a weak verb`,
      detail: `${list(dedupeLabels(weak.map((x) => `"${x.label}"`)), 3)} describes the job that existed, not what you did in it. The first two words of a bullet are the ones that get read.`,
      fixHint: "Start with the action: Operated, Led, Reduced, Trained, Built.",
    });
  }

  for (const s of stuffedTerms(f)) {
    add({
      id: `keyword-stuffing:${normalizeLabel(s.term)}`, severity: "recommended", section: "experience",
      title: `"${s.term}" is repeated ${s.times} times`,
      detail: `This term is repeated ${s.times} times — ATS does not reward repetition. Ranking systems check whether a term is present, not how often, and the human reading afterwards sees padding where evidence should be.`,
      fixHint: "Keep it in the skills list and in the one bullet where you can prove it.",
    });
  }

  f.roles.forEach((r, i) => {
    if (r.bullets.length >= 2) return;
    add({
      id: `thin-role:${i}`, severity: "recommended", section: "experience",
      title: `${r.title || r.company || "One role"} has ${r.bullets.length === 0 ? "no bullets" : "only one bullet"}`,
      detail: "A role with fewer than two lines under it looks like a placeholder. Two concrete duties are enough to make it count as experience.",
    });
  });

  /* ── optional: worth doing, costs nothing if skipped ── */

  if (!f.hasLinkedin) {
    add({
      id: "no-linkedin", severity: "optional", section: "personal",
      title: "Add your LinkedIn URL",
      detail: "Many recruiters check the profile before the CV. A missing link is a step they have to take themselves, and some do not.",
    });
  }
  if (!f.summary.trim()) {
    add({
      id: "no-summary", severity: "optional", section: "summary",
      title: "Add a short professional summary",
      detail: "Three lines at the top telling a reader who you are and what you are aiming at is the cheapest context you can give them.",
    });
  }

  const current = f.roles.find(isCurrentRole);
  const heavierPast = current
    ? f.roles.find((r) => r !== current && !isCurrentRole(r) && r.bullets.length > current.bullets.length)
    : undefined;
  if (current && heavierPast) {
    add({
      id: "past-role-heavier", severity: "optional", section: "experience",
      title: "An older role carries more detail than your current one",
      detail: `${heavierPast.title || heavierPast.company} has ${heavierPast.bullets.length} bullets against ${current.bullets.length} on ${current.title || current.company}. Recruiters read the most recent role closest, so the weight usually belongs there.`,
      fixHint: "Move a line's worth of detail forward, or trim the older role.",
    });
  }

  const rank: Record<Severity, number> = { critical: 0, recommended: 1, optional: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ───────────────────────── quality dimensions ───────────────────────── */

function completeness(state: BuilderState, f: Facts): Dimension {
  const checks: Array<[string, boolean]> = [
    ["your name", Boolean(state.personal.fullName || state.profile.name)],
    ["an email address", f.hasEmail],
    ["a phone number", f.hasPhone],
    ["a professional title", Boolean(state.personal.professionalTitle || state.profile.role)],
    ["a professional summary", Boolean(f.summary.trim())],
    ["at least one role", f.roles.length > 0],
    ["dates on every role", f.roles.length > 0 && f.roles.every((r) => dateKey(r.start, false) > 0)],
    ["a skills section", f.skills.length > 0],
    ["education", Boolean(f.education.trim())],
    ["languages", state.languages.some((l) => l.status === "confirmed" && l.level)],
  ];
  const have = checks.filter(([, ok]) => ok).length;
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  return {
    id: "completeness",
    label: "Completeness",
    score: pct(have, checks.length),
    weight: QUALITY_WEIGHTS.completeness,
    why: missing.length
      ? `${have} of ${checks.length} essentials are present. Still missing: ${list(missing, 5)}.`
      : `All ${checks.length} essentials are present — name, contact, title, summary, dated roles, skills, education and languages.`,
  };
}

function specificity(f: Facts): Dimension {
  if (!f.bullets.length) {
    return {
      id: "specificity", label: "Specificity", score: 0, weight: QUALITY_WEIGHTS.specificity,
      why: "There are no experience bullets yet, so there is nothing here to be specific about.",
    };
  }
  // Specific means: a number, a named system or acronym, or one of the user's own
  // skills. Anything else is a sentence that would fit on anyone's CV.
  const isSpecific = (b: CvBullet): boolean =>
    /\d/.test(b.text) || /[A-Z]{2,}/.test(b.text) || f.skills.some((s) => s.length > 2 && mentions(b.text, s));
  const specific = f.bullets.filter(isSpecific).length;
  const weak = f.bullets.filter((b) => weakOpener(b.text)).length;
  const base = specific / f.bullets.length;
  const penalty = 0.5 * (weak / f.bullets.length);
  return {
    id: "specificity", label: "Specificity",
    score: clamp(100 * (base - penalty)),
    weight: QUALITY_WEIGHTS.specificity,
    why: `${specific} of ${f.bullets.length} bullets name a number, a system or one of your own skills`
      + (weak ? `, and ${weak} open with a weak verb, which costs half the credit for those lines.` : ".")
      + (specific === f.bullets.length && !weak ? " Nothing was deducted here." : ""),
  };
}

function evidenceStrength(state: BuilderState, f: Facts): Dimension {
  if (!f.roles.length) {
    return {
      id: "evidence", label: "Evidence strength", score: 0, weight: QUALITY_WEIGHTS.evidence,
      why: "With no roles recorded there is no evidence on the CV yet — nothing here is a judgement of your experience, only of what the document currently shows.",
    };
  }
  const backed = f.roles.filter((r) => r.bullets.length >= 2).length;
  const roleShare = backed / f.roles.length;

  const confirmedCreds = state.credentials.filter((c) => c.status === "confirmed");
  const detailed = confirmedCreds.filter((c) => c.issuer && c.issueDate).length;
  const credShare = confirmedCreds.length ? detailed / confirmedCreds.length : 0;

  const score = clamp(100 * (0.6 * roleShare + 0.4 * credShare));
  const parts = [`${backed} of ${f.roles.length} roles carry at least two bullets`];
  if (!confirmedCreds.length) parts.push("and no licence or certification is recorded, which is 40% of this dimension");
  else parts.push(`and ${detailed} of ${confirmedCreds.length} credentials state both an issuer and an issue date`);
  return {
    id: "evidence", label: "Evidence strength", score, weight: QUALITY_WEIGHTS.evidence,
    why: `${parts.join(", ")}.`,
  };
}

function readability(f: Facts): Dimension {
  if (!f.bullets.length) {
    return {
      id: "readability", label: "Readability", score: 0, weight: QUALITY_WEIGHTS.readability,
      why: "There is no body text to read yet, so this cannot be scored — an empty CV is not a readable one.",
    };
  }
  const long = f.bullets.filter((b) => b.length > BULLET_WORD_CAP).length;
  const avg = Math.round(f.bullets.reduce((n, b) => n + b.length, 0) / f.bullets.length);
  const summaryWords = words(f.summary).length;

  let score = 100;
  const reasons: string[] = [];
  const longHit = Math.round(40 * (long / f.bullets.length));
  if (longHit) { score -= longHit; reasons.push(`${long} of ${f.bullets.length} bullets run past ${BULLET_WORD_CAP} words (−${longHit})`); }
  if (summaryWords > 90) { score -= 20; reasons.push(`the summary is ${summaryWords} words, where three or four lines is what gets read (−20)`); }
  if (avg > BULLET_WORD_CAP - 4) { score -= 15; reasons.push(`bullets average ${avg} words (−15)`); }
  else if (avg < 6) { score -= 15; reasons.push(`bullets average only ${avg} words, too short to carry an achievement (−15)`); }

  return {
    id: "readability", label: "Readability", score: clamp(score), weight: QUALITY_WEIGHTS.readability,
    why: reasons.length
      ? `${reasons.join("; ")}.`
      : `Bullets average ${avg} words and none run past ${BULLET_WORD_CAP} — nothing was deducted here.`,
  };
}

function atsStructure(f: Facts): Dimension {
  const anything = f.roles.length || f.skills.length || f.education.trim() || f.summary.trim();
  if (!anything) {
    return {
      id: "ats-structure", label: "ATS-safe structure", score: 0, weight: QUALITY_WEIGHTS.ats,
      why: "There are no sections yet, so there is no structure for a parser to read.",
    };
  }
  let score = 100;
  const reasons: string[] = [];
  const undated = f.roles.filter((r) => !dateKey(r.start, false)).length;
  if (undated) { score -= 30; reasons.push(`${undated} role${undated === 1 ? "" : "s"} without a start date, which is what a parser builds your timeline from (−30)`); }
  if (!f.skills.length) { score -= 20; reasons.push("no skills section for a keyword filter to read (−20)"); }
  if (!f.hasEmail || !f.hasPhone) { score -= 20; reasons.push("the contact block is incomplete, so a parser may not find how to reach you (−20)"); }
  // Emoji and box-drawing survive a PDF and confuse a parser; they arrive when
  // content is pasted in from a designed CV.
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|[│┃┆┇║]/u.test(f.cv)) {
    score -= 15; reasons.push("decorative characters in the text can break a parse (−15)");
  }
  if (f.skills.length === 1 && f.skills[0].length > 120) {
    score -= 10; reasons.push("skills are one long sentence rather than a separated list (−10)");
  }
  return {
    id: "ats-structure", label: "ATS-safe structure", score: clamp(score), weight: QUALITY_WEIGHTS.ats,
    why: reasons.length
      ? `${reasons.join("; ")}.`
      : "Single column, standard headings, dated roles and a readable contact block — nothing here would break a parse.",
  };
}

function languageQuality(f: Facts): Dimension {
  if (!f.bullets.length && !f.summary.trim()) {
    return {
      id: "language", label: "Language quality", score: 0, weight: QUALITY_WEIGHTS.language,
      why: "There is no written content yet to assess.",
    };
  }
  let score = 100;
  const reasons: string[] = [];
  const weak = f.bullets.filter((b) => weakOpener(b.text)).length;
  const dupes = duplicateSkillPairs(f).length;
  const repeats = repeatedDuties(f).length;
  const stuffed = stuffedTerms(f);

  if (weak) { const hit = Math.min(45, 15 * weak); score -= hit; reasons.push(`${weak} bullet${weak === 1 ? "" : "s"} open with a weak verb (−${hit})`); }
  if (dupes) { const hit = Math.min(30, 10 * dupes); score -= hit; reasons.push(`${dupes} pair${dupes === 1 ? "" : "s"} of skills say the same thing (−${hit})`); }
  if (repeats) { const hit = Math.min(30, 10 * repeats); score -= hit; reasons.push(`${repeats} responsibilit${repeats === 1 ? "y is" : "ies are"} repeated across roles (−${hit})`); }
  if (stuffed.length) {
    const hit = Math.min(20, 10 * stuffed.length);
    score -= hit;
    reasons.push(`${list(stuffed.map((s) => `"${s.term}"`), 2)} repeated across the summary, the skills list and three or more bullets (−${hit})`);
  }
  return {
    id: "language", label: "Language quality", score: clamp(score), weight: QUALITY_WEIGHTS.language,
    why: reasons.length ? `${reasons.join("; ")}.` : "Strong opening verbs, no duplicated skills and no repeated duties — nothing was deducted here.",
  };
}

function headline(dims: Dimension[]): number {
  return clamp(dims.reduce((n, d) => n + d.score * d.weight, 0));
}

/**
 * The CV judged on its own terms. This is the report a user gets when they have
 * not told us which job they are aiming at — and its labels never say "match",
 * because there is nothing here to match against.
 */
export function reviewQuality(state: BuilderState, referenceDate = ""): QualityReport {
  const f = readFacts(state);
  const dimensions = [
    completeness(state, f),
    specificity(f),
    evidenceStrength(state, f),
    readability(f),
    atsStructure(f),
    languageQuality(f),
  ];
  return {
    kind: "quality",
    score: headline(dimensions),
    dimensions,
    findings: checklist(state, f, referenceDate),
  };
}

/* ───────────────────────── match dimensions ───────────────────────── */

function coverageDimension(
  id: string, label: string, weight: number, items: string[], supported: string[],
  inEvidence: string[], emptyWhy: string, emptyScore: number,
): Dimension {
  if (!items.length) {
    return { id, label, score: emptyScore, weight, why: emptyWhy };
  }
  const onCv = items.filter((i) => supported.includes(i));
  const known = items.filter((i) => inEvidence.includes(i));
  const gaps = items.filter((i) => !supported.includes(i) && !inEvidence.includes(i));
  const why = [`${onCv.length} of ${items.length} are on your CV`];
  if (known.length) why.push(`${known.length} you have told us about but the CV does not show yet (${list(known, 2)})`);
  if (gaps.length) why.push(`${gaps.length} we have no evidence for (${list(gaps, 2)})`);
  return { id, label, score: pct(onCv.length, items.length), weight, why: `${why.join("; ")}.` };
}

/**
 * The CV against one specific advert.
 *
 * Throws without an advert on purpose. The alternative — returning a match
 * report with an empty job description — is exactly the bug this module was
 * written to remove: a number labelled "match" with nothing behind it.
 */
export function reviewMatch(state: BuilderState, jobAdText: string, referenceDate = ""): MatchReport {
  const ad = String(jobAdText || "").trim();
  if (!ad) {
    throw new Error("reviewMatch needs a job description. With no advert there is nothing to match against — call reviewQuality instead.");
  }

  const f = readFacts(state);
  const jd = parseJobAd(ad);

  /**
   * Each ask lands in exactly one of the three groups, so a requirement can never
   * be both "supported" and "unsupported" — and nothing quietly falls out of all
   * three.
   */
  const asks = mergeAsks([jd.required, jd.preferred, jd.credentials, jd.tools]);

  const supported: string[] = [];
  const missingFromCv: string[] = [];
  const unsupported: string[] = [];
  for (const ask of asks) {
    if (evidenced(f.cvTokens, ask)) supported.push(ask);
    else if (evidenced(f.confirmedTokens, ask)) missingFromCv.push(ask);
    else unsupported.push(ask);
  }
  const inEvidence = missingFromCv;

  /* required and preferred coverage */
  const requiredDim = coverageDimension(
    "required-coverage", "Required-skill coverage", MATCH_WEIGHTS.required,
    jd.required, supported, inEvidence,
    "No explicit requirements section could be found in this advert, so nothing is claimed here — paste the full posting to get this scored.",
    50,
  );
  const preferredDim = coverageDimension(
    "preferred-coverage", "Preferred-skill coverage", MATCH_WEIGHTS.preferred,
    jd.preferred, supported, inEvidence,
    "This advert lists no preferred extras, so there is nothing here to be missing.",
    100,
  );
  const credentialDim = coverageDimension(
    "credential-alignment", "Credential alignment", MATCH_WEIGHTS.credential,
    jd.credentials, supported, inEvidence,
    "This advert names no licence, certification or degree, so nothing was deducted here.",
    100,
  );

  /* relevant experience */
  const jdTokens = tokenSet([jd.title, ...jd.required, ...jd.preferred, ...jd.tools, ...jd.keywords].join(" "));
  const relevant = f.bullets.filter((b) => {
    let shared = 0;
    for (const w of new Set(contentWords(b.text))) if (jdTokens.has(w)) shared++;
    return shared >= 2;
  }).length;
  const experienceDim: Dimension = f.bullets.length ? {
    id: "relevant-experience", label: "Relevant experience", weight: MATCH_WEIGHTS.experience,
    score: pct(relevant, f.bullets.length),
    why: `${relevant} of ${f.bullets.length} experience bullets share at least two meaningful terms with this advert`
      + (relevant === f.bullets.length ? " — nothing was deducted here." : ". The rest may be true and worth keeping; they just are not what this employer is reading for."),
  } : {
    id: "relevant-experience", label: "Relevant experience", weight: MATCH_WEIGHTS.experience, score: 0,
    why: "There are no experience bullets to compare against this advert yet.",
  };

  /* title alignment */
  const titleTokens = [...new Set(contentWords(jd.title))];
  const titleDim: Dimension = titleTokens.length ? (() => {
    let best = 0, bestTitle = "";
    for (const cand of f.titles) {
      const have = tokenSet(cand);
      const hit = titleTokens.filter((w) => have.has(w)).length;
      if (hit > best) { best = hit; bestTitle = cand; }
    }
    const score = pct(best, titleTokens.length);
    return {
      id: "title-alignment", label: "Title alignment", weight: MATCH_WEIGHTS.title, score,
      why: score === 100
        ? `Your title "${bestTitle}" carries every word of the advert's "${jd.title}" — nothing was deducted here.`
        : bestTitle
          ? `Your title "${bestTitle}" shares ${best} of ${titleTokens.length} words with the advert's "${jd.title}". Screening often filters on the exact title, so the closer it truthfully is, the further you get.`
          : `No title on your CV matches the advert's "${jd.title}". A professional title at the top is the cheapest alignment there is.`,
    };
  })() : {
    id: "title-alignment", label: "Title alignment", weight: MATCH_WEIGHTS.title, score: 50,
    why: "No job title could be read out of this advert, so nothing is claimed about alignment either way.",
  };

  /**
   * Keyword alignment, counted as PRESENCE and nothing else.
   *
   * This is where "do not reward keyword stuffing" is enforced structurally: a
   * keyword is either in the CV or it is not, so writing it five more times
   * cannot move this number by a single point. The repetition is reported as a
   * finding instead.
   */
  const stuffed = stuffedTerms(f);
  const present = jd.keywords.filter((k) => f.cvTokens.has(normalizeLabel(k)) || mentions(f.cv, k));
  const absent = jd.keywords.filter((k) => !present.includes(k));
  const keywordDim: Dimension = jd.keywords.length ? {
    id: "keyword-alignment", label: "Keyword alignment", weight: MATCH_WEIGHTS.keyword,
    score: pct(present.length, jd.keywords.length),
    why: `${present.length} of the advert's ${jd.keywords.length} recurring terms appear somewhere on your CV`
      + (absent.length ? `; missing: ${list(absent, 5)}.` : " — nothing was deducted here.")
      + (stuffed.length ? " Counted once each: repeating a term does not raise this score." : ""),
  } : {
    id: "keyword-alignment", label: "Keyword alignment", weight: MATCH_WEIGHTS.keyword, score: 50,
    why: "No recurring terms could be read out of this advert, so nothing is claimed here.",
  };

  const dimensions = [requiredDim, preferredDim, experienceDim, titleDim, keywordDim, credentialDim];

  /* findings: the shared checklist, plus what this particular advert reveals */
  const findings = checklist(state, f, referenceDate);

  if (missingFromCv.length) {
    findings.push({
      id: "missing-from-cv", severity: "recommended", section: "review",
      title: `${missingFromCv.length} thing${missingFromCv.length === 1 ? "" : "s"} you have told us about ${missingFromCv.length === 1 ? "is" : "are"} not on the CV`,
      detail: `${list(missingFromCv, 4)} — this advert asks for it and your own confirmed answers already cover it, but the document does not say so. This is the cheapest score you will ever gain, because nothing new has to be true.`,
      fixHint: "Add it to the section it belongs in, in your own words.",
    });
  }

  if (unsupported.length) {
    // Deliberately informational, and deliberately not offered as something we
    // can add. There is no function in this module that writes these onto a CV.
    findings.push({
      id: "unsupported-requirements", severity: "recommended", section: "review",
      title: `${unsupported.length} requirement${unsupported.length === 1 ? "" : "s"} we found no evidence for`,
      detail: `This advert asks for ${list(unsupported, 4)}, and nothing you have confirmed supports it. We will not add it — a CV that claims what you cannot back up fails at the interview instead of at the filter, which is worse. If you do have this experience, add it yourself and it will count.`,
      fixHint: "Genuinely have it? Add it in the relevant section and re-run this review.",
    });
  }

  if (titleDim.score < 50 && jd.title) {
    findings.push({
      id: "title-mismatch", severity: "recommended", section: "personal",
      title: `Your title does not read like "${jd.title}"`,
      detail: "Screening tools and recruiters both compare titles first. If the advert's title is an honest description of what you do, use its wording.",
      fixHint: "Personal details → professional title.",
    });
  }

  const rank: Record<Severity, number> = { critical: 0, recommended: 1, optional: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    kind: "match",
    score: headline(dimensions),
    dimensions,
    findings,
    supported,
    missingFromCv,
    unsupported,
  };
}

/**
 * The entry point a UI should use: the DATA decides which report exists.
 *
 * This is rule 1 made structural rather than remembered. A caller cannot ask for
 * a match score without an advert, because the only thing that selects a match
 * report is the presence of an advert in the document itself.
 */
export function review(state: BuilderState, referenceDate = ""): QualityReport | MatchReport {
  const ad = String(state.target.jobAdText || state.profile.jobAd || "").trim();
  return ad ? reviewMatch(state, ad, referenceDate) : reviewQuality(state, referenceDate);
}
