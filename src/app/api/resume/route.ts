/**
 * The editable CV document, over HTTP.
 *
 * ── how this differs from `/api/resumes`, which already exists ──
 *
 * `/api/resumes` (plural) keeps a flat `{ title, text }` snapshot for the "my saved CVs" list. It is
 * a rendered copy: you can read it, download it, publish it — you cannot resume editing from it,
 * because the structure the builder edits is not in it. Nothing in the builder ever wrote to it.
 *
 * This route (singular) carries `BuilderState` itself, addressed by (account, resumeId) and
 * versioned. Both stay. They answer different questions and the plural one is what the account
 * screen and the exports already read.
 *
 * ── the contract, and the one clause that matters ──
 *
 *   GET  /api/resume                     → { ok, configured, signedIn, resumes[] }
 *   GET  /api/resume?id=<resumeId>       → { ok, configured, signedIn, resume | null }
 *   PUT  /api/resume                     → save. Body carries `baseRevision`.
 *   POST /api/resume  { from, to }       → duplicate `from` into a new id `to`
 *   DELETE /api/resume?id=<resumeId>     → remove
 *
 * A PUT states the revision it is based on. If the stored revision has moved on, the save is
 * REFUSED with **409** and the winning record attached — not merged, not overwritten. Two tabs, or a
 * phone and a laptop, is the ordinary case rather than the exotic one, and last-write-wins there
 * means the device that has been asleep quietly deletes an hour of work done on the other.
 *
 * ── why every response says `configured` ──
 *
 * Server persistence needs a Redis, and this product's Redis is optional (`redisEnv.ts`). Where it
 * is absent the honest answer is not an error — the builder works perfectly off its browser draft,
 * as it always has. So the flag is part of the success shape, and the client renders "saved to your
 * account" or "saved on this device" from a fact rather than from an assumption.
 *
 * ── and why anonymous callers get 200 and not 401 ──
 *
 * Most visitors are anonymous and that is the intended path, not a failure. `signedIn: false` with
 * an empty list is the true answer to "what does my account hold" for someone without one. A 401
 * would put an error in the console of the ordinary case, which is how real errors stop being read.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/app/lib/session";
import { privateJsonHeaders } from "@/app/lib/privateCache";
import {
  deleteServerResume, duplicateServerResume, listServerResumes, readServerResume,
  resumeServerConfigured, saveServerResume, MAX_DOC_BYTES,
} from "@/app/lib/resumeServer";
import type { BuilderState } from "@/app/lib/builderDoc";

export const maxDuration = 20;

const caller = (req: NextRequest): string | null =>
  readSession(req.cookies.get(SESSION_COOKIE)?.value, Date.now());

/** Every response carries these two, so a client never has to infer either. */
const base = (email: string | null) => ({ configured: resumeServerConfigured(), signedIn: Boolean(email) });

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: privateJsonHeaders() });

export async function GET(req: NextRequest) {
  const email = caller(req);
  const b = base(email);
  if (!email || !b.configured) {
    return json({ ok: true, ...b, resumes: [], resume: null });
  }
  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) return json({ ok: true, ...b, resume: await readServerResume(email, id) });
    return json({ ok: true, ...b, resumes: await listServerResumes(email) });
  } catch {
    /* A storage failure must not look like "you have no CVs" — the client's fallback is the browser
       draft, and it needs to know this answer was not authoritative. */
    return json({ ok: false, ...b, resumes: [], resume: null, error: "store-unavailable" }, 503);
  }
}

export async function PUT(req: NextRequest) {
  const email = caller(req);
  const b = base(email);
  if (!b.configured) return json({ ok: false, ...b, reason: "unconfigured" });
  if (!email) return json({ ok: false, ...b, reason: "signed-out" });

  let body: {
    resumeId?: string; lang?: string; state?: BuilderState; baseRevision?: number; title?: string;
  };
  try { body = await req.json(); } catch { return json({ ok: false, ...b, reason: "invalid" }, 400); }

  const resumeId = String(body.resumeId || "");
  const lang = body.lang === "ar" ? "ar" : "en";
  if (!resumeId || !body.state) return json({ ok: false, ...b, reason: "invalid" }, 400);

  try {
    const res = await saveServerResume({
      email, resumeId, lang, state: body.state,
      baseRevision: Number.isFinite(body.baseRevision) ? Number(body.baseRevision) : 0,
      title: String(body.title || ""),
    });
    if (res.ok) return json({ ok: true, ...b, revision: res.revision, summary: res.summary });
    /*
     * 409 for a conflict — the one status a client must branch on, because the correct response is
     * to show the user the newer version rather than to retry. Everything else is 400: the request
     * as sent cannot succeed, and retrying it unchanged will fail the same way.
     */
    if (res.reason === "conflict") {
      return json({ ok: false, ...b, reason: "conflict", current: res.current }, 409);
    }
    return json({ ok: false, ...b, reason: res.reason, limit: MAX_DOC_BYTES }, 400);
  } catch {
    return json({ ok: false, ...b, reason: "store-unavailable" }, 503);
  }
}

/** Duplicate. The source is read and never written — see `duplicateServerResume`. */
export async function POST(req: NextRequest) {
  const email = caller(req);
  const b = base(email);
  if (!b.configured) return json({ ok: false, ...b, reason: "unconfigured" });
  if (!email) return json({ ok: false, ...b, reason: "signed-out" });

  let body: { from?: string; to?: string; title?: string };
  try { body = await req.json(); } catch { return json({ ok: false, ...b, reason: "invalid" }, 400); }
  const from = String(body.from || ""), to = String(body.to || "");
  if (!from || !to || from === to) return json({ ok: false, ...b, reason: "invalid" }, 400);

  try {
    const res = await duplicateServerResume({ email, sourceId: from, newId: to, title: String(body.title || "") });
    if (res.ok) return json({ ok: true, ...b, resumeId: to, revision: res.revision, summary: res.summary });
    return json({ ok: false, ...b, reason: res.reason === "conflict" ? "exists" : res.reason }, 400);
  } catch {
    return json({ ok: false, ...b, reason: "store-unavailable" }, 503);
  }
}

export async function DELETE(req: NextRequest) {
  const email = caller(req);
  const b = base(email);
  if (!b.configured) return json({ ok: false, ...b, reason: "unconfigured" });
  if (!email) return json({ ok: false, ...b, reason: "signed-out" });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return json({ ok: false, ...b, reason: "invalid" }, 400);
  try {
    return json({ ok: await deleteServerResume(email, id), ...b });
  } catch {
    return json({ ok: false, ...b, reason: "store-unavailable" }, 503);
  }
}
