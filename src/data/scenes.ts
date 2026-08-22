/**
 * Single source of truth for the whole experience:
 * scene timing, copy, altitude readout and motion constants.
 * Tweak the numbers here — nothing is hard-coded inside components.
 */

export type SceneVariant =
  | 'hero'
  | 'statement'
  | 'statement-xl'
  | 'marker'
  | 'reveal'
  | 'meta'
  | 'final'

export interface SceneDef {
  id: string
  /** Experience progress (0–1) where the scene enters / leaves. */
  start: number
  end: number
  variant: SceneVariant
  /** Fraction of the scene band used to ramp in / out. */
  fadeIn?: number
  fadeOut?: number
  /** Per-line delay, as a fraction of the band (progressive reveals). */
  stagger?: number
  /** Progressive blur on entry/exit (desktop only). */
  blur?: boolean
  label?: string
  lines?: string[]
  sub?: string
}

export const SCENES: SceneDef[] = [
  // SCENE 01 — above the clouds
  {
    id: 'hero',
    start: 0,
    end: 0.2,
    variant: 'hero',
    lines: ['BEYOND', 'THE ORDINARY'],
    sub: 'An immersive digital journey.',
    label: 'SCROLL TO EXPLORE',
  },
  // SCENE 02 — entering the clouds
  {
    id: 'watched',
    start: 0.25,
    end: 0.42,
    variant: 'statement',
    blur: true,
    stagger: 0.06,
    lines: ["SOME EXPERIENCES", "AREN'T MEANT", 'TO BE WATCHED.'],
  },
  // SCENE 03 — the valley appears
  {
    id: 'felt',
    start: 0.43,
    end: 0.6,
    variant: 'statement-xl',
    blur: true,
    stagger: 0.07,
    lines: ["THEY'RE MEANT", 'TO BE FELT.'],
  },
  // SCENE 04 — the house, first as a coordinate…
  {
    id: 'alt-marker',
    start: 0.61,
    end: 0.7,
    variant: 'marker',
    label: '1,240 M',
  },
  // …then as an idea
  {
    id: 'beyond-ui',
    start: 0.66,
    end: 0.78,
    variant: 'reveal',
    stagger: 0.09,
    lines: ['A PLACE', 'BEYOND', 'THE INTERFACE.'],
  },
  // SCENE 05 — approach, almost silent
  {
    id: 'meta',
    start: 0.79,
    end: 0.905,
    variant: 'meta',
    stagger: 0.05,
    label: 'DIGITAL EXPERIENCE',
    sub: '01 / 01',
  },
  // SCENE 06 — arrival / portfolio message
  {
    id: 'final',
    start: 0.92,
    end: 1,
    variant: 'final',
    fadeOut: 0,
    stagger: 0.05,
    lines: ['IMMERSIVE', 'WEB EXPERIENCES'],
    sub: 'Digital experiences where\ntechnology, motion and storytelling meet.',
  },
]

export const FINAL_CTA = {
  primaryLabel: 'START A PROJECT',
  primaryHref:
    'mailto:fluxorahub.crm@gmail.com?subject=New%20project%20%E2%80%94%20Immersive%20Web%20Experience',
  secondaryLabel: 'VIEW EXPERIENCE AGAIN',
  footer: '© 2026 — AN EXPERIMENT IN SCROLL-DRIVEN CINEMATOGRAPHY',
}

/** Altitude readout — piecewise-linear through the spec anchors. */
export const ALTITUDE_ANCHORS: Array<[progress: number, meters: number]> = [
  [0, 3840],
  [0.2, 2675],
  [0.4, 1800],
  [0.6, 1240],
  [0.8, 1180],
  [1, 1180],
]

export const ALTITUDE_LABELS: Array<{ until: number; label: string }> = [
  { until: 0.2, label: 'THE PEAKS' },
  { until: 0.4, label: 'THE CLOUDS' },
  { until: 0.6, label: 'THE VALLEY' },
  { until: 0.8, label: 'THE APPROACH' },
  { until: 1.01, label: 'THE HOUSE' },
]

export const EXPERIENCE = {
  /** Pinned scroll length (vh) per mode. */
  trackVhDesktop: 650,
  trackVhMobile: 520,
  trackVhReduced: 420,
  mobileBreakpoint: 768,

  /** Exponential smoothing applied to scroll progress (higher = snappier). */
  smoothing: 5.5,
  /** Keep away from the very last frame to avoid the 'ended' state. */
  videoEndEpsilon: 0.05,

  /** Default scene ramps (fraction of each scene band). */
  fadeIn: 0.24,
  fadeOut: 0.2,

  /** Final darkening overlay. */
  dimStart: 0.9,
  dimMax: 0.55,
}

/**
 * Seek governor — closes the cross-browser gap.
 *
 * Browsers disagree wildly about what a `currentTime` seek costs: Chrome and
 * Safari land one on an all-intra file in a few milliseconds, Firefox can take
 * tens of milliseconds and quietly queues the overflow until the decoder
 * stutters. Rather than guessing a fixed rate, the governor measures how long
 * this browser actually takes to present a seeked frame and issues seeks only
 * as fast as it can retire them.
 */
export const GOVERNOR = {
  /** Assumed seek cost before the first measurement lands (ms). */
  initialCostMs: 24,
  /** Weight of each new latency sample in the moving average. */
  sample: 0.25,
  /** Floor/ceiling for the interval between seeks (ms). */
  minIntervalMs: 16,
  maxIntervalMs: 260,
  /** Safety factor over the measured cost. */
  headroom: 1.15,
  /** A seek still pending after this is assumed lost (ms). */
  watchdogMs: 900,
  /** Never seek for movement smaller than this (s). */
  minTimeDelta: 1 / 60,
  /** Expensive seeks demand a coarser threshold: seconds gained per ms of cost. */
  costToTimeDelta: 1 / 900,
}

export const LOADER = {
  /**
   * Files at or below this size are fully buffered up-front (blob URL) —
   * guaranteed instant seeks anywhere in the timeline.
   */
  blobMaxBytes: 40_000_000,
  /**
   * Larger files stream natively instead; the experience starts once this
   * many seconds are buffered and the download continues in the background.
   */
  minBufferSeconds: 8,
  /** Safety valve: start anyway after this long, if playable data exists. */
  maxWaitMs: 12_000,
  /** Loader overlay is shown for at least this long (premium pacing). */
  minDisplayMs: 1600,
}

export const ASSETS = {
  videoDesktop: '/assets/cinematic-descent.mp4',
  /** Optional; the loader falls back to the desktop file when missing. */
  videoMobile: '/assets/cinematic-descent-mobile.mp4',
  poster: '/assets/poster.jpg',
}
