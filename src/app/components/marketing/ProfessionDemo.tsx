"use client";

/**
 * "Try it — no signup." Five real occupation packs, switched with no page reload and no model
 * call — the whole point being that this is what the product already knows BEFORE any AI runs.
 *
 * Reads `allRolePacks()` and picks five real, existing packs by slug rather than hand-typing
 * duties/credentials here — the same reason the old worked-example section read `findRolePack`
 * instead of writing its own copy: a landing page that shows facts the product does not actually
 * offer is a promise broken the moment someone tries it. Editing a pack edits this section too.
 *
 * ── one category at a time, not everything at once ──
 *
 * The previous version showed two skill groups AND certificates AND five responsibilities
 * simultaneously — up to 15+ chips and lines on screen for one profession, the "too many visible
 * chips at once" complaint. A second tab row switches between the pack's own categories (its first
 * two `groups`, then responsibilities, then credentials) so only ONE is visible at a time, each
 * capped (six chips / three responsibilities) with a real "show more" rather than a fixed slice —
 * nothing is hidden forever, it just isn't all on screen at once.
 */

import { useState } from "react";
import { allRolePacks, type RolePack } from "@/app/lib/rolePacks";

/* The five the redesign brief named — "Software Developer" is the pack's real title (there is no
   "Software Engineer" pack, and relabeling data this section promises to be reading live from
   would make its own claim false). Teacher replaced Sales Manager per the same brief. */
const CURATED_SLUGS = ["radiology-technologist", "software-developer", "teacher", "accountant", "registered-nurse"];

const T = {
  en: {
    certs: "Certificates it will ask about",
    duties: "Typical responsibilities",
    note: "None of this is on a CV yet — every item is a suggestion until it's tapped. Nothing here called a model; this is what the product already knows.",
    showMore: (n: number) => `Show ${n} more`,
    showLess: "Show less",
  },
  ar: {
    certs: "الشهادات التي سيسألك عنها",
    duties: "المهام المعتادة",
    note: "لا شيء من هذا في سيرة بعد — كل عنصر اقتراح حتى تنقره. لا شيء هنا استدعى نموذجاً؛ هذا ما يعرفه المنتج مسبقاً.",
    showMore: (n: number) => `عرض ${n} إضافية`,
    showLess: "عرض أقل",
  },
};

type Category = { label: string; kind: "chips" | "duties"; items: string[] };

export default function ProfessionDemo({ lang }: { lang: "ar" | "en" }) {
  const packs = allRolePacks().filter((p) => CURATED_SLUGS.includes(p.slug))
    .sort((a, b) => CURATED_SLUGS.indexOf(a.slug) - CURATED_SLUGS.indexOf(b.slug));
  const [active, setActive] = useState(0);
  const [cat, setCat] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const t = T[lang];
  const pack: RolePack | undefined = packs[active];
  if (!pack) return null;

  const categories: Category[] = [
    ...pack.groups.slice(0, 2).map((g) => ({ label: g.label[lang], kind: "chips" as const, items: g.items.map((it) => it[lang]) })),
    { label: t.duties, kind: "duties" as const, items: pack.duties.map((d) => d[lang]) },
    { label: t.certs, kind: "chips" as const, items: pack.credentials.map((c) => c.title[lang]) },
  ];
  const current = categories[cat] ?? categories[0];
  const cap = current.kind === "duties" ? 3 : 6;
  const visible = expanded ? current.items : current.items.slice(0, cap);
  const hiddenCount = current.items.length - cap;

  function selectProfession(i: number) {
    setActive(i);
    setCat(0);
    setExpanded(false);
  }
  function selectCategory(i: number) {
    setCat(i);
    setExpanded(false);
  }

  return (
    <div className="demo-shell">
      <div className="demo-tabs" role="tablist">
        {packs.map((p, i) => (
          <button
            key={p.slug}
            role="tab"
            aria-selected={i === active}
            onClick={() => selectProfession(i)}
            className={`demo-tab${i === active ? " active" : ""}`}
          >
            {p.title[lang]}
          </button>
        ))}
      </div>
      <div className="demo-cats" role="tablist" key={pack.slug}>
        {categories.map((c, i) => (
          <button
            key={c.label}
            role="tab"
            aria-selected={i === cat}
            onClick={() => selectCategory(i)}
            className={`demo-cat${i === cat ? " active" : ""}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="demo-body-single" key={`${pack.slug}-${cat}`}>
        {current.kind === "duties" ? (
          <ul className="duty-list t-stagger t-materialize">
            {visible.map((d) => <li key={d}>{d}</li>)}
          </ul>
        ) : (
          <div className="chip-list t-stagger t-materialize">
            {visible.map((it) => <span key={it} className="pill">{it}</span>)}
          </div>
        )}
        {hiddenCount > 0 && (
          <button className="demo-show-more" onClick={() => setExpanded((e) => !e)}>
            {expanded ? t.showLess : t.showMore(hiddenCount)}
          </button>
        )}
      </div>
      <div className="demo-note">{t.note}</div>
    </div>
  );
}
