"use client";

/**
 * The AUTHENTICATED application's navigation — the marketing site ends at the door.
 *
 * Public pages sell; this strip operates. Dashboard · Career Profile · Resumes ·
 * Applications · Interview · Settings — every link lands on a surface that actually exists
 * today (the account page's own sections carry ids for the anchored ones; nothing here
 * invents a screen). The live Orb sits at its start: the same assistant the landing story
 * introduced, resident in the product, so the two surfaces read as one system.
 *
 * Horizontal, scrollable when narrow (its own axis only — the document stays the page's
 * one scroll owner vertically).
 */

import Link from "next/link";
import BrandOrb from "../brand-orb/BrandOrb";
import type { OrbState } from "../brand-orb/orbStates";

const T = {
  en: { dash: "Dashboard", profile: "Career Profile", resumes: "Resumes", apps: "Applications", interview: "Interview", settings: "Settings" },
  ar: { dash: "اللوحة", profile: "الملف المهني", resumes: "السير", apps: "التقديمات", interview: "المقابلة", settings: "الإعدادات" },
};

export default function AppNavigation({ lang, active, orbState = "idle" }: {
  lang: "ar" | "en";
  active?: "dash" | "profile" | "resumes" | "apps" | "interview" | "settings";
  orbState?: OrbState;
}) {
  const ar = lang === "ar";
  const t = T[lang];
  const account = ar ? "/ar/account" : "/account";
  const items = [
    { id: "dash", href: account, label: t.dash },
    { id: "profile", href: ar ? "/ar/builder" : "/builder", label: t.profile },
    { id: "resumes", href: `${account}#resumes`, label: t.resumes },
    { id: "apps", href: `${account}#applications`, label: t.apps },
    { id: "interview", href: ar ? "/interview?lang=ar" : "/interview", label: t.interview },
    { id: "settings", href: `${account}#settings`, label: t.settings },
  ] as const;

  return (
    <nav
      aria-label={ar ? "تنقّل التطبيق" : "Application navigation"}
      className="flex items-center gap-1 overflow-x-auto"
      style={{ padding: "10px 4px", borderBottom: "1px solid var(--line)", marginBottom: 20 }}
    >
      <span style={{ flexShrink: 0, marginInlineEnd: 8 }}>
        <BrandOrb size={26} state={orbState} lang={lang} />
      </span>
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          aria-current={active === i.id ? "page" : undefined}
          className="t-tap"
          style={{
            flexShrink: 0, fontSize: 14, fontWeight: 700, padding: "8px 14px", borderRadius: 10,
            color: active === i.id ? "var(--fg)" : "var(--muted)",
            background: active === i.id ? "rgba(139, 92, 246, 0.12)" : "transparent",
          }}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
