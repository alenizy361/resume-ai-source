"use client";

/**
 * Device-local user data (v1 of the account system): scan history, saved
 * resumes, and a mini job-application tracker — all in localStorage.
 *
 * Deliberately local-first: it matches the privacy pledge ("your resume is
 * never stored on our servers") and needs no signup. The data model mirrors
 * the planned Upstash schema (u:<email>:scans / :resumes / :jobs) so a later
 * server sync is a transport swap, not a redesign.
 *
 * ── every function takes an owner, and that is not optional ──
 *
 * These three lists were keyed on nothing: `ra_saved_resumes`, `ra_scan_history`, `ra_jobs`. On a
 * shared browser the second account read the first account's saved CVs — full text, ten of them —
 * their complete ATS analyses, and the list of companies they had applied to with their private notes.
 * The comment above says the schema "mirrors the planned Upstash schema `u:<email>:…`", and that is
 * exactly what was missing: the `u:<email>` half.
 *
 * `SavedResume.userId` existed and made this look handled. It never was — the field was written and
 * never read, so nothing filtered on it. A record that knows whose it is, in a store that does not,
 * is worse than neither, because it reads like protection.
 *
 * The owner comes from `useOwner()`, which returns `""` until the server has said who the session
 * belongs to. Every read here returns empty for `""` rather than falling back — see `readPersonal`.
 */

import { readPersonalJson, writePersonalList } from "./personalStore.ts";

export interface ScanEntry {
  id: string;
  ts: number;
  score: number;
  mode: "general" | "target";
  jobTitle: string; // first line of the JD, or "General review"
  lang: "en" | "ar";
  result: unknown; // the full OptimizeResult, for one-click restore
}

export interface SavedResume {
  id: string;
  ts: number;
  title: string;
  source: "built" | "optimized";
  text: string;

  /*
   * What this CV was, and what it was worth, at the moment it was saved.
   *
   * The list used to show a title and a date, which answers neither question a person actually has
   * in front of four saved CVs: which one is finished, and which one scored better. Everything here
   * is a MEASUREMENT TAKEN THEN — not a live value — because the text is stored beside it and
   * cannot change afterwards. A number that describes this exact text is safe to show forever.
   *
   * All optional: records written before this existed are still perfectly good records, and a list
   * that hid them to keep its columns tidy would be losing the user's work to a layout.
   */
  /** "new" | "upload" | "saved" — how the CV started, which `source` only half answers. */
  sourceType?: string;
  /** "draft" | "ready" | "exported". `ready` means the review found nothing critical. */
  status?: string;
  /** 0-100, the product's own quality score for this text. */
  qualityScore?: number;
  /** 0-100, only when a job advert was pasted — there is no match score without something to match. */
  matchScore?: number;
  /** 0-100, how much of the CV was filled in. */
  completion?: number;
  /** The document's language, which is not necessarily the interface's. */
  lang?: "ar" | "en";
  /** Present only when someone was signed in; the privacy pledge keeps the CV local either way. */
  userId?: string;
}

export type JobStatus = "saved" | "applied" | "interview" | "offer" | "rejected";
export interface JobEntry {
  id: string;
  ts: number;
  company: string;
  title: string;
  url: string;
  status: JobStatus;
  note: string;
  /**
   * Which saved resume this application used, if the user picked one — a snapshot pair
   * (`SavedResume.id` + its title AT THE TIME), not a live reference. The saved resume it points to
   * can be edited or deleted afterwards without corrupting this record; the title just stops being
   * guaranteed current. Optional: applications tracked before this existed, or added without
   * picking one, are still complete records.
   */
  resumeId?: string;
  resumeTitle?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// ── Scan history (cap 10) ──
export function addScan(owner: string, e: Omit<ScanEntry, "id" | "ts">) {
  const list = getScans(owner);
  list.unshift({ ...e, id: uid(), ts: Date.now() });
  writePersonalList(owner, "ra_scan_history", list, 10);
}
export const getScans = (owner: string): ScanEntry[] =>
  readPersonalJson<ScanEntry[]>(owner, "ra_scan_history", []);
export function removeScan(owner: string, id: string) {
  writePersonalList(owner, "ra_scan_history", getScans(owner).filter((s) => s.id !== id), 10);
}

// ── Saved resumes (cap 10) ──
export function saveResume(owner: string, e: Omit<SavedResume, "id" | "ts">) {
  const list = getResumes(owner);
  // Replace an identical-text duplicate instead of stacking copies.
  const filtered = list.filter((r) => r.text !== e.text);
  filtered.unshift({ ...e, id: uid(), ts: Date.now() });
  writePersonalList(owner, "ra_saved_resumes", filtered, 10);
}
export const getResumes = (owner: string): SavedResume[] =>
  readPersonalJson<SavedResume[]>(owner, "ra_saved_resumes", []);
export function removeResume(owner: string, id: string) {
  writePersonalList(owner, "ra_saved_resumes", getResumes(owner).filter((r) => r.id !== id), 10);
}

// ── Job tracker (cap 50) ──
export function addJob(owner: string, e: Omit<JobEntry, "id" | "ts">) {
  const list = getJobs(owner);
  list.unshift({ ...e, id: uid(), ts: Date.now() });
  writePersonalList(owner, "ra_jobs", list, 50);
}
export const getJobs = (owner: string): JobEntry[] =>
  readPersonalJson<JobEntry[]>(owner, "ra_jobs", []);
export function updateJob(owner: string, id: string, patch: Partial<JobEntry>) {
  writePersonalList(owner, "ra_jobs", getJobs(owner).map((j) => (j.id === id ? { ...j, ...patch } : j)), 50);
}
export function removeJob(owner: string, id: string) {
  writePersonalList(owner, "ra_jobs", getJobs(owner).filter((j) => j.id !== id), 50);
}
