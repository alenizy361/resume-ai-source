"use client";

/**
 * Scene 8 — pricing, calm and honest. Black and white, one accent line, two columns:
 * Free (what the product genuinely gives for nothing, watermark restriction stated
 * plainly) and the real 35-SAR plan — name, price, access window and features read from
 * `plans.ts`, the single source the checkout itself charges from, so this scene cannot
 * show one number while the card is billed another. One primary CTA: the real checkout.
 * The 90-day pack exists and is one link away, not a competing shout.
 */

import Link from "next/link";
import CheckoutButton from "../CheckoutButton";
import { PLANS, formatPrice } from "@/app/lib/plans";
import { LANDING_COPY } from "./copy";
import { useScene } from "./useScene";

export default function PricingScene({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].pricing;
  const ar = lang === "ar";
  const plan = PLANS.single;
  const { ref, on } = useScene<HTMLElement>();

  return (
    <section ref={ref} className="cine-scene cine-scene--below" data-on={on ? "" : undefined} aria-labelledby="price-h">
      <p className="cine-kicker cine-rise">{t.kicker}</p>
      <h2 id="price-h" className="cine-h2 cine-rise">{t.h2}</h2>

      <div className="cine-price-grid">
        <div className="cine-price cine-rise">
          <div className="cine-price-name">{t.freeName}</div>
          {/* A bare "0" is not a price — it is a digit with no currency and no unit, sitting in the
              slot where the card beside it says "SAR 35". The word is what a free tier actually
              costs, and it needs no unit at all. */}
          <div className="cine-price-amount">{t.freeAmount}</div>
          <ul className="cine-price-list">
            {t.freeLines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>

        <div className="cine-price cine-price--pro cine-rise">
          <div className="cine-price-name">{ar ? plan.nameAr : plan.name}</div>
          <div className="cine-price-amount">{formatPrice(plan.id, lang)}</div>
          <p className="cine-price-sub">{ar ? plan.accessLabelAr : plan.accessLabel} · {t.paidNote}</p>
          <ul className="cine-price-list">
            {(ar ? plan.featuresAr : plan.features).map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div style={{ marginTop: 20 }}>
            <CheckoutButton ar={ar} plan={plan.id} label={t.cta} variant="accent" />
          </div>
        </div>
      </div>

      <Link href={ar ? "/ar/pricing" : "/pricing"} className="cine-price-all">{t.all}</Link>
    </section>
  );
}
