import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import {
  ALTITUDE_ANCHORS,
  ALTITUDE_LABELS,
  ASSETS,
  EXPERIENCE,
  SCENES,
  SCROLL_GOVERNOR,
} from '../../data/scenes'
import type { SceneDef } from '../../data/scenes'
import type { LoaderBus, PreloadMode, PreloadState } from '../../lib/loaderBus'
import { useScrollVideo } from '../../hooks/useScrollVideo'
import { Header } from '../Header/Header'
import { SceneText } from '../SceneText/SceneText'
import { FinalCTA } from '../FinalCTA/FinalCTA'
import { ProgressIndicator } from '../ProgressIndicator/ProgressIndicator'
import './Experience.css'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const altitudeAt = (p: number): number => {
  const a = ALTITUDE_ANCHORS
  if (p <= a[0][0]) return a[0][1]
  for (let i = 0; i < a.length - 1; i++) {
    const [p0, v0] = a[i]
    const [p1, v1] = a[i + 1]
    if (p <= p1) return v0 + ((v1 - v0) * (p - p0)) / (p1 - p0)
  }
  return a[a.length - 1][1]
}

interface LineBinding {
  index: number
  setOpacity: (v: number) => void
  setY: ((v: number) => void) | null
}

interface SceneBinding {
  def: SceneDef
  root: HTMLElement
  lines: LineBinding[]
  visible: boolean
  lastBlur: number
}

interface Props {
  reduced: boolean
  bus: LoaderBus
}

export function Experience({ reduced, bus }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<PreloadMode>('pending')
  const handleState = useCallback((s: PreloadState) => setMode(s.mode), [])
  const video = useScrollVideo(videoRef, reduced, bus, handleState)

  useLayoutEffect(() => {
    const root = rootRef.current
    const track = trackRef.current
    if (!root || !track) return

    ScrollTrigger.config({ ignoreMobileResize: true })

    // Environment-dependent motion constants (recomputed on every refresh).
    const env = { mobile: false, enterY: 44, exitY: 36, blurPx: 8 }
    const readEnv = () => {
      env.mobile = window.innerWidth <= EXPERIENCE.mobileBreakpoint
      env.enterY = env.mobile ? 26 : 44
      env.exitY = env.mobile ? 20 : 36
      env.blurPx = env.mobile || reduced ? 0 : 8
      const vh = reduced
        ? EXPERIENCE.trackVhReduced
        : env.mobile
          ? EXPERIENCE.trackVhMobile
          : EXPERIENCE.trackVhDesktop
      track.style.height = `${vh}vh`
    }
    readEnv()
    ScrollTrigger.addEventListener('refreshInit', readEnv)

    const state = {
      raw: 0,
      /** Velocity-clamped chase target — see SCROLL_GOVERNOR below. */
      target: 0,
      smooth: 0,
      altShown: -1,
      bucket: -1,
      finalActive: false,
      introDone: false,
      lastDim: -1,
    }

    let tick: ((time: number, deltaMS: number) => void) | null = null
    let unsubIntro: (() => void) | null = null
    let disposed = false

    // DEV-only ground-truth probe for the scroll governor's per-tick clamp —
    // measured from inside the real tick, immune to an external polling
    // loop's own scheduling jitter (which a black-box video.currentTime
    // sampler can't tell apart from a genuine oversized step).
    const scrollGovProbe = import.meta.env.DEV
      ? { maxStepSeen: 0, ticks: 0 }
      : null
    if (scrollGovProbe) {
      ;(
        window as unknown as { __xpScrollGovernor?: unknown }
      ).__xpScrollGovernor = {
        stats: () => ({ ...scrollGovProbe }),
        reset: () => {
          scrollGovProbe.maxStepSeen = 0
          scrollGovProbe.ticks = 0
        },
      }
    }

    const ctx = gsap.context(() => {
      const q = (sel: string) => root.querySelector<HTMLElement>(sel)
      const qa = (sel: string) =>
        Array.from(root.querySelectorAll<HTMLElement>(sel))

      // ------------------------------------------------------ bindings
      const scenes: SceneBinding[] = []
      for (const def of SCENES) {
        const sceneRoot = q(`[data-scene="${def.id}"]`)
        if (!sceneRoot) continue
        const lines = Array.from(
          sceneRoot.querySelectorAll<HTMLElement>('[data-line]'),
        ).map((el, index) => {
          const inner = el.firstElementChild as HTMLElement | null
          return {
            index,
            setOpacity: gsap.quickSetter(el, 'opacity') as (v: number) => void,
            setY: inner
              ? (gsap.quickSetter(inner, 'y', 'px') as (v: number) => void)
              : null,
          }
        })
        scenes.push({
          def,
          root: sceneRoot,
          lines,
          visible: def.variant === 'hero',
          lastBlur: 0,
        })
      }

      const heroTitle = q('[data-hero-title]')
      const altValueEls = qa('[data-alt-value]')
      const altLabelEls = qa('[data-alt-label]')
      const fillSetters = qa('[data-progress-fill]').map(
        (el) => gsap.quickSetter(el, 'scaleX') as (v: number) => void,
      )
      const dimEl = q('[data-dim]')
      const dimSet = dimEl
        ? (gsap.quickSetter(dimEl, 'opacity') as (v: number) => void)
        : null
      const fallbackEl = q('[data-fallback-pan]')
      const fallbackSet = fallbackEl
        ? (gsap.quickSetter(fallbackEl, 'yPercent') as (v: number) => void)
        : null

      // ------------------------------------------------- scene updaters
      const hideScene = (s: SceneBinding) => {
        s.root.style.visibility = 'hidden'
        s.visible = false
        if (s.lastBlur) {
          s.root.style.filter = ''
          s.lastBlur = 0
        }
        if (s.def.variant === 'final' && state.finalActive) {
          state.finalActive = false
          s.root.toggleAttribute('inert', true)
          s.root.classList.remove('is-active')
        }
      }
      const showScene = (s: SceneBinding) => {
        s.root.style.visibility = 'visible'
        s.visible = true
      }

      const updateHero = (s: SceneBinding, p: number) => {
        if (p > s.def.end - 0.005) {
          if (s.visible) hideScene(s)
          return
        }
        if (!s.visible) showScene(s)
        const drift = smoothstep(0, s.def.end, p)
        const fadeTitle = 1 - smoothstep(0.035, 0.16, p)
        const fadeSub = 1 - smoothstep(0.02, 0.105, p)
        const fadeHint = 1 - smoothstep(0.006, 0.05, p)
        for (const line of s.lines) {
          const isTitle = line.index <= 1
          const o = isTitle ? fadeTitle : line.index === 2 ? fadeSub : fadeHint
          line.setOpacity(o)
          if (!reduced && line.setY)
            line.setY(-drift * (isTitle ? 64 + line.index * 18 : 40))
        }
        // letter-spacing widens slightly as the title dissolves
        if (heroTitle && !reduced) {
          const base = env.mobile ? 0.035 : 0.06
          heroTitle.style.letterSpacing = `${(base + drift * 0.045).toFixed(4)}em`
        }
      }

      const updateScene = (s: SceneBinding, p: number) => {
        const { def } = s
        const local = (p - def.start) / (def.end - def.start)
        if (local <= 0 || local >= 1.0001) {
          if (s.visible) hideScene(s)
          return
        }
        if (!s.visible) showScene(s)

        const fadeIn = def.fadeIn ?? EXPERIENCE.fadeIn
        const fadeOut = def.fadeOut ?? EXPERIENCE.fadeOut
        const stagger = def.stagger ?? 0
        const out = fadeOut === 0 ? 1 : 1 - smoothstep(1 - fadeOut, 1, local)

        for (const line of s.lines) {
          const off = line.index * stagger
          const inn = smoothstep(off, off + fadeIn, local)
          line.setOpacity(inn * out)
          if (!reduced && line.setY)
            line.setY((1 - inn) * env.enterY - (1 - out) * env.exitY)
        }

        if (def.blur && env.blurPx) {
          const innAll = smoothstep(0, fadeIn, local)
          const b = (1 - innAll) * env.blurPx + (1 - out) * env.blurPx * 0.75
          if (Math.abs(b - s.lastBlur) > 0.06) {
            const apply = b > 0.15
            s.root.style.filter = apply ? `blur(${b.toFixed(2)}px)` : ''
            s.lastBlur = apply ? b : 0
          }
        }

        if (def.variant === 'final') {
          const active = local > 0.1
          if (active !== state.finalActive) {
            state.finalActive = active
            s.root.toggleAttribute('inert', !active)
            s.root.classList.toggle('is-active', active)
          }
        }
      }

      const updateHeader = (p: number) => {
        const shown = Math.round(altitudeAt(p) / 5) * 5
        if (shown !== state.altShown) {
          state.altShown = shown
          const text = `ALT. ${shown.toLocaleString('en-US')} M`
          for (const el of altValueEls) el.textContent = text
        }
        let bucket = ALTITUDE_LABELS.length - 1
        for (let i = 0; i < ALTITUDE_LABELS.length; i++) {
          if (p < ALTITUDE_LABELS[i].until) {
            bucket = i
            break
          }
        }
        if (bucket !== state.bucket) {
          const initial = state.bucket === -1
          state.bucket = bucket
          for (const el of altLabelEls) {
            el.textContent = ALTITUDE_LABELS[bucket].label
            if (!initial && !reduced) {
              gsap.fromTo(
                el,
                { opacity: 0, y: 5 },
                { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', overwrite: true },
              )
            }
          }
        }
      }

      const updateChrome = (p: number) => {
        for (const set of fillSetters) set(p)
        if (dimSet) {
          const dim = smoothstep(EXPERIENCE.dimStart, 1, p) * EXPERIENCE.dimMax
          if (Math.abs(dim - state.lastDim) > 0.003) {
            state.lastDim = dim
            dimSet(dim)
          }
        }
        // procedural background pan (placeholder mode only)
        if (fallbackSet && !reduced) fallbackSet(-p * 66.667)
      }

      // ------------------------------------------------------ main loop
      ScrollTrigger.create({
        trigger: track,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          state.raw = self.progress
        },
      })

      tick = (_time, deltaMS) => {
        // Scroll governor: however hard the user flings, drags the
        // scrollbar, or hits End, `target` can only chase `raw` at a bounded
        // speed — a fast, continuous catch-up instead of a jump-cut. Below
        // that speed (normal scrolling, the vast majority of the time) this
        // is a no-op and target tracks raw exactly, one-to-one.
        const duration = video.getDuration()
        const maxProgressPerSecond = duration
          ? SCROLL_GOVERNOR.maxPlaybackMultiple / duration
          : Infinity
        const dt = Math.min(deltaMS, SCROLL_GOVERNOR.maxFrameDeltaMs) / 1000
        const maxStep = maxProgressPerSecond * dt
        const rawDelta = state.raw - state.target
        const appliedStep =
          rawDelta < -maxStep ? -maxStep : rawDelta > maxStep ? maxStep : rawDelta
        state.target += appliedStep
        if (scrollGovProbe) {
          scrollGovProbe.ticks++
          const stepSec = Math.abs(appliedStep) * duration
          if (stepSec > scrollGovProbe.maxStepSeen)
            scrollGovProbe.maxStepSeen = stepSec
        }

        const k = reduced
          ? 1
          : 1 - Math.exp((-deltaMS / 1000) * EXPERIENCE.smoothing)
        state.smooth += (state.target - state.smooth) * k
        if (Math.abs(state.target - state.smooth) < 0.0004)
          state.smooth = state.target
        const p = state.smooth

        video.update(p)
        if (state.introDone) {
          for (const s of scenes) {
            if (s.def.variant === 'hero') updateHero(s, p)
            else updateScene(s, p)
          }
        }
        updateHeader(p)
        updateChrome(p)
      }
      gsap.ticker.add(tick)

      // ---------------------------------------------------------- intro
      const runIntro = () => {
        const heroTitleInner = qa('[data-scene="hero"] .hero-title .line > span')
        const heroMeta = qa('[data-scene="hero"] .hero-sub, [data-scene="hero"] .hero-hint')
        const heroOuter = qa('[data-scene="hero"] [data-line]')
        const tl = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete: () => {
            state.introDone = true
            document.documentElement.classList.remove('is-locked')
            ScrollTrigger.refresh()
          },
        })

        if (reduced) {
          tl.to('[data-video-shell]', { autoAlpha: 1, duration: 0.6 }, 0)
            .fromTo(
              heroOuter,
              { opacity: 0 },
              { opacity: 1, duration: 0.9, stagger: 0.08 },
              0.1,
            )
            .fromTo(
              ['[data-header]', '[data-chrome]'],
              { opacity: 0 },
              { opacity: 1, duration: 0.8 },
              0.4,
            )
          return
        }

        tl.to('[data-video-shell]', { autoAlpha: 1, duration: 1.5, ease: 'power2.inOut' }, 0)
          .fromTo(
            heroTitleInner,
            { yPercent: 112 },
            { yPercent: 0, duration: 1.25, stagger: 0.11 },
            0.5,
          )
          .fromTo(
            heroOuter,
            { opacity: 0 },
            { opacity: 1, duration: 0.7, stagger: 0.09 },
            0.5,
          )
          .fromTo(
            heroMeta.map((el) => el.firstElementChild),
            { y: 16 },
            { y: 0, duration: 0.9, stagger: 0.12 },
            0.85,
          )
          .fromTo('[data-header]', { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 1 }, 1.2)
          .fromTo('[data-chrome]', { opacity: 0 }, { opacity: 1, duration: 0.9 }, 1.35)
      }

      // The intro starts once the loader overlay has fully faded out
      // (which itself waits for the preload gate via the bus).
      let introStarted = false
      const maybeIntro = () => {
        if (disposed || introStarted || !bus.isHidden()) return
        introStarted = true
        if (unsubIntro) unsubIntro()
        gsap.delayedCall(0.1, runIntro)
      }
      unsubIntro = bus.subscribe(maybeIntro)
      maybeIntro()
    }, root)

    return () => {
      disposed = true
      if (tick) gsap.ticker.remove(tick)
      if (unsubIntro) unsubIntro()
      ScrollTrigger.removeEventListener('refreshInit', readEnv)
      document.documentElement.classList.remove('is-locked')
      if (scrollGovProbe)
        delete (window as unknown as { __xpScrollGovernor?: unknown })
          .__xpScrollGovernor
      ctx.revert()
    }
  }, [reduced, video, bus])

  const handleExplore = useCallback(() => {
    gsap.to(window, {
      scrollTo: { y: 'max', autoKill: true },
      duration: reduced ? 0.01 : 3,
      ease: 'power2.inOut',
    })
  }, [reduced])

  const handleRestart = useCallback(() => {
    gsap.to(window, {
      scrollTo: { y: 0, autoKill: true },
      duration: reduced ? 0.01 : 2.6,
      ease: 'power2.inOut',
    })
  }, [reduced])

  return (
    <div
      ref={rootRef}
      className={[
        'xp',
        mode === 'none' ? 'xp--novideo' : '',
        reduced ? 'xp--reduced' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Header onExplore={handleExplore} />

      <main>
        <section
          className="xp-track"
          ref={trackRef}
          aria-label="A cinematic descent — scroll to explore"
        >
          <div className="xp-stage">
            <div className="xp-fallback" aria-hidden="true">
              <div className="xp-fallback-inner" data-fallback-pan />
            </div>

            <div className="xp-video-shell" data-video-shell>
              <video
                ref={videoRef}
                className="xp-video"
                muted
                playsInline
                preload="auto"
                poster={ASSETS.poster}
                aria-hidden="true"
                tabIndex={-1}
                disablePictureInPicture
              />
            </div>

            <div className="xp-vignette" aria-hidden="true" />
            <div className="xp-grain" aria-hidden="true" />
            <div className="xp-dim" data-dim aria-hidden="true" />

            {mode === 'none' && (
              <p className="xp-badge">
                PLACEHOLDER — ADD /assets/cinematic-descent.mp4
              </p>
            )}

            <SceneText />
            <FinalCTA onRestart={handleRestart} />
            <ProgressIndicator />
          </div>
          <span className="xp-anchor-end" id="contact" aria-hidden="true" />
        </section>
      </main>
    </div>
  )
}
