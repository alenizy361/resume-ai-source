"use client";
import { useState } from "react";
import { useOwner } from "./useOwner";
import { readPersonalJson, writePersonal } from "@/app/lib/personalStore";

/** Publishes the given resume text to a public /r/{slug} link and shows it
 *  with a copy button. Published links (slug + unpublish token) are persisted
 *  to localStorage so the user can still see/unpublish them later from
 *  /account — previously leaving the page lost the token forever. */
export default function PublishLink({ text, name, role, ar = false }: { text: string; name?: string; role?: string; ar?: boolean }) {
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const t = ar
    ? {
        cta: "🔗 أنشئ رابطاً عاماً لسيرتك",
        publishing: "جارٍ النشر…",
        yourLink: "رابط سيرتك العام",
        copy: "نسخ الرابط",
        copied: "نُسخ",
        share: "شاركه مع جهات التوظيف أو على لينكدإن — بدون ملف PDF.",
        unpublish: "إلغاء النشر",
        removing: "جارٍ الحذف…",
        failed: "تعذّر النشر.",
      }
    : {
        cta: "🔗 Get a shareable link",
        publishing: "Publishing…",
        yourLink: "Your public resume link",
        copy: "Copy link",
        copied: "Copied",
        share: "Share this with recruiters or on LinkedIn — no PDF needed.",
        unpublish: "Unpublish this link",
        removing: "Removing…",
        failed: "Could not publish.",
      };

  /*
   * ── the publish list is owner-scoped, and this one is a capability, not just data ──
   *
   * Each entry carries the UNPUBLISH TOKEN: whoever holds it can take that CV off the public web.
   * Stored under a key with no owner, the next account on a shared browser inherited both the list of
   * someone else's live CVs and the power to pull them down. That is the sharpest of the seven stores
   * this scoping fixed, and it looked like the mildest.
   */
  const owner = useOwner();

  function remember(entry: { slug: string; url: string; token: string }) {
    if (!owner) return;
    const list = readPersonalJson<Array<Record<string, unknown>>>(owner, "ra_published", []);
    list.unshift({ ...entry, created: new Date().toISOString() });
    writePersonal(owner, "ra_published", JSON.stringify(list.slice(0, 20)));
  }

  function forget(s: string) {
    if (!owner) return;
    const list = readPersonalJson<{ slug: string }[]>(owner, "ra_published", []).filter((e) => e.slug !== s);
    writePersonal(owner, "ra_published", JSON.stringify(list));
  }

  async function publish() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, name, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.failed);
      const full = `${window.location.origin}${data.url}`;
      setUrl(full);
      setSlug(data.slug || "");
      setToken(data.unpublishToken || "");
      if (data.slug && data.unpublishToken) remember({ slug: data.slug, url: full, token: data.unpublishToken });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setLoading(false);
    }
  }

  async function unpublish() {
    if (!slug || !token) return;
    setLoading(true);
    try {
      await fetch(`/api/publish?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`, { method: "DELETE" });
      forget(slug);
      setUrl("");
      setSlug("");
      setToken("");
    } catch {
      setError(t.failed);
    } finally {
      setLoading(false);
    }
  }

  if (url) {
    return (
      <div className="card mt-6 p-5" style={{ borderColor: "rgba(139,92,246,0.4)" }}>
        <div className="mb-2 font-mono text-xs tracking-wider" style={{ color: "var(--faint)", textTransform: ar ? "none" : "uppercase" }}>{t.yourLink}</div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr" className="flex-1 truncate text-sm text-accent">{url}</a>
          <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "#ffffff" }}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{t.share}</p>
        {token && (
          <button onClick={unpublish} disabled={loading} className="mt-2 text-xs disabled:opacity-50" style={{ color: "var(--faint)" }}>
            {loading ? t.removing : t.unpublish}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 text-center">
      <button onClick={publish} disabled={loading} className="btn-ghost px-6 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ color: "var(--fg)" }}>
        {loading ? t.publishing : t.cta}
      </button>
      {error && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
