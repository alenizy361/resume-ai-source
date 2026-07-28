/**
 * The Orb's states, and what each one means physically.
 *
 * The Orb is the assistant, not decoration — its internal energy IS the system status. Each
 * state maps to a small set of continuous parameters the engine interpolates between, so a
 * state change is a smooth shift in behaviour, never a cut and never a spinner:
 *
 *   breathHz   how fast the whole body breathes (scale oscillation)
 *   breathAmp  how deeply it breathes
 *   energy     how alive the internal plasma is (filament alpha + drift speed)
 *   nebula     how saturated/bright the internal purple galaxy is
 *   particles  0..1 share of the particle budget that is lit
 *   scan       an internal analysis band sweeping the core (analyzing only)
 *   dim        overall luminance multiplier (sleeping/dormant sit low)
 *
 * One-shot accents (a single green ring for success, amber for warning) are events, not
 * states — `OrbEngine.pulse()` — because "finished" is a moment and a state that loops a
 * success ping forever would read as a notification the user cannot dismiss.
 */

export type OrbState =
  | "dormant"
  | "awakening"
  | "idle"
  | "thinking"
  | "analyzing"
  | "listening"
  | "suggestion"
  | "success"
  | "warning"
  | "sleeping";

export interface OrbParams {
  breathHz: number;
  breathAmp: number;
  energy: number;
  nebula: number;
  particles: number;
  scan: number;
  dim: number;
}

export const ORB_STATES: Record<OrbState, OrbParams> = {
  /** Barely alive — a point of potential. The intro starts here. */
  dormant: { breathHz: 0.05, breathAmp: 0.004, energy: 0.06, nebula: 0.18, particles: 0.05, scan: 0, dim: 0.4 },
  /** Intelligence waking up: deeper breath, nebula blooming. Driven brighter over time by the intro. */
  awakening: { breathHz: 0.14, breathAmp: 0.03, energy: 0.5, nebula: 0.85, particles: 0.6, scan: 0, dim: 0.95 },
  /** The resting assistant. Slow breathing, quiet interior. */
  idle: { breathHz: 0.11, breathAmp: 0.016, energy: 0.25, nebula: 0.55, particles: 0.35, scan: 0, dim: 0.9 },
  /** Working on an answer: the interior speeds up before anything is shown. */
  thinking: { breathHz: 0.22, breathAmp: 0.02, energy: 0.7, nebula: 0.75, particles: 0.7, scan: 0, dim: 1 },
  /** Reading a document: everything thinking has, plus a scanning band through the core. */
  analyzing: { breathHz: 0.24, breathAmp: 0.02, energy: 0.9, nebula: 0.8, particles: 0.85, scan: 1, dim: 1 },
  /** Attending to the user (interview): calm body, receptive surface ripple. */
  listening: { breathHz: 0.16, breathAmp: 0.024, energy: 0.4, nebula: 0.65, particles: 0.45, scan: 0, dim: 1 },
  /** Has something to offer: a touch brighter than idle, leaning forward (translation is the host's job). */
  suggestion: { breathHz: 0.18, breathAmp: 0.026, energy: 0.55, nebula: 0.8, particles: 0.6, scan: 0, dim: 1 },
  /** A held "all good" — the one-shot green ring is fired separately via pulse(). */
  success: { breathHz: 0.1, breathAmp: 0.014, energy: 0.35, nebula: 0.6, particles: 0.4, scan: 0, dim: 1 },
  /** A held caution — amber pulse fired separately; the body itself only warms slightly. */
  warning: { breathHz: 0.2, breathAmp: 0.02, energy: 0.5, nebula: 0.5, particles: 0.4, scan: 0, dim: 1 },
  /** Off-hours. Dimmer and slower than dormant is small. */
  sleeping: { breathHz: 0.05, breathAmp: 0.01, energy: 0.08, nebula: 0.3, particles: 0.1, scan: 0, dim: 0.55 },
};

/** The identity palette — obsidian body, purple nebula, electric-blue energy, cyan sparks. */
export const ORB_PALETTE = {
  body0: "#05060a",
  body1: "#0b0d16",
  nebulaA: "#7c3aed",
  nebulaB: "#4c1d95",
  energy: "#3b82f6",
  spark: "#67e8f9",
  rim: "#93c5fd",
  success: "var(--ok)",
  warning: "var(--warn)",
};
