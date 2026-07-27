"use client";

/**
 * Owns the hero's step timer and feeds the SAME step into both the orb (`orbState`) and
 * `CareerProfileScene` (its content) — the reason this exists as its own component rather than
 * `CareerProfileScene` managing its own timer the way `DemoWalkthrough` does: the orb and the card
 * are siblings in the JSX (the orb sits in its own positioned wrapper for the starfield/particles),
 * and `Landing.tsx` is a server component that cannot hold the step state itself. One client
 * component wrapping both is the smallest change that lets the orb visibly react to "what the
 * product is doing" — `OrbCore`'s state machine, built in the previous pass, had no real caller
 * until this one.
 */

import { useEffect, useState } from "react";
import BrandOrb from "../BrandOrb";
import CareerProfileScene, { stepToOrbState, type SceneStep } from "./CareerProfileScene";

const STEP_MS = 3400;

export default function HeroExperience({ lang }: { lang: "ar" | "en" }) {
  const [step, setStep] = useState<SceneStep>(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setStep((s) => ((s + 1) % 4) as SceneStep);
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="relative flex items-center justify-center h-[190px] sm:h-[240px] lg:h-[400px]" aria-hidden>
        <div className="hero-particles"><i /><i /><i /></div>
        <BrandOrb
          variant="hero"
          size={440}
          orbState={stepToOrbState(step)}
          style={{ maxWidth: "clamp(140px,40vw,440px)", maxHeight: "clamp(140px,40vw,440px)" }}
        />
      </div>
      <CareerProfileScene lang={lang} step={step} />
    </>
  );
}
