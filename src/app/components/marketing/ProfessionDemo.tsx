"use client";

/**
 * "Try it — no signup." Five real occupation packs, switched with no page reload and no model
 * call — the whole point being that this is what the product already knows BEFORE any AI runs.
 *
 * Reads `allRolePacks()` and picks five real, existing packs by slug rather than hand-typing
 * duties/credentials here — the same reason the old worked-example section read `findRolePack`
 * instead of writing its own copy: a landing page that shows facts the product does not actually
 * offer is a promise broken the moment someone tries it. Editing a pack edits this section too.
 */

import { useState } from "react";
import { allRolePacks, type RolePack } from "@/app/lib/rolePacks";

const CURATED_SLUGS = ["radiology-technologist", "software-developer", "accountant", "registered-nurse", "sales-manager"];

const T = {
  en: { certs: "Certificates it will ask about", duties: "Typical responsibilities", note: "None of this is on a CV yet — every item is a suggestion until it's tapped. Nothing here called a model; this is what the product already knows." },
  ar: { certs: "الشهادات التي سيسألك عنها", duties: "المهام المعتادة", note: "لا شيء من هذا في سيرة بعد — كل عنصر اقتراح حتى تنقره. لا شيء هنا استدعى نموذجاً؛ هذا ما يعرفه المنتج مسبقاً." },
};

export default function ProfessionDemo({ lang }: { lang: "ar" | "en" }) {
  const packs = allRolePacks().filter((p) => CURATED_SLUGS.includes(p.slug))
    .sort((a, b) => CURATED_SLUGS.indexOf(a.slug) - CURATED_SLUGS.indexOf(b.slug));
  const [active, setActive] = useState(0);
  const t = T[lang];
  const pack: RolePack | undefined = packs[active];
  if (!pack) return null;

  return (
    <div className="demo-shell">
      <div className="demo-tabs" role="tablist">
        {packs.map((p, i) => (
          <button
            key={p.slug}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`demo-tab${i === active ? " active" : ""}`}
          >
            {p.title[lang]}
          </button>
        ))}
      </div>
      <div className="demo-body" key={pack.slug}>
        <div className="demo-col">
          {pack.groups.slice(0, 2).map((g) => (
            <div key={g.label.en} style={{ marginBottom: 22 }}>
              <div className="k">{g.label[lang]}</div>
              <div className="chip-list">
                {g.items.slice(0, 6).map((it) => <span key={it.en} className="chip">{it[lang]}</span>)}
              </div>
            </div>
          ))}
          <div className="k">{t.certs}</div>
          <div className="chip-list">
            {pack.credentials.slice(0, 4).map((c) => <span key={c.title.en} className="chip">{c.title[lang]}</span>)}
          </div>
        </div>
        <div className="demo-col">
          <div className="k">{t.duties}</div>
          <ul className="duty-list">
            {pack.duties.slice(0, 5).map((d) => <li key={d.en}>{d[lang]}</li>)}
          </ul>
        </div>
        <div className="demo-note">{t.note}</div>
      </div>
    </div>
  );
}
