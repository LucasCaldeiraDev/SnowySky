import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { ASSETS, EXPERIENCE, GOVERNOR, LOADER } from '../data/scenes'
import type { LoaderBus, PreloadState } from '../lib/loaderBus'

export interface ScrollVideoController {
  /** True once the video can be scrubbed. */
  isReady(): boolean
  /** Feed the smoothed experience progress (0–1), once per frame. */
  update(progress: number): void
}

/** Video elements that expose the (Chrome/Safari) frame-presentation callback. */
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
  fastSeek?: (time: number) => void
}

interface GovernorState {
  /** Moving average of what a seek costs on this browser (ms). */
  cost: number
  /** performance.now() when the in-flight seek was issued; 0 when idle. */
  pendingSince: number
  lastSeekAt: number
  samples: number
  /** Outstanding requestVideoFrameCallback handle, 0 when none. */
  frameHandle: number
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v

/** Record a completed seek and fold its latency into the running cost. */
function settle(gov: GovernorState, at: number) {
  if (gov.pendingSince === 0) return
  const latency = at - gov.pendingSince
  gov.cost += (latency - gov.cost) * GOVERNOR.sample
  gov.pendingSince = 0
  gov.samples += 1
}

interface ProbeResult {
  url: string
  size: number
  usedMobileSource: boolean
}

/** GET with a 1-byte range: validates existence + type, reads total size. */
async function probe(url: string, mobile: boolean): Promise<ProbeResult | null> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    // SPA dev servers answer missing files with index.html — verify the type.
    if (!type.startsWith('video')) return null
    let size = 0
    const contentRange = res.headers.get('content-range') // "bytes 0-0/12345"
    if (contentRange) size = Number(contentRange.split('/')[1]) || 0
    if (!size) size = Number(res.headers.get('content-length')) || 0
    void res.body?.cancel().catch(() => {})
    return { url, size, usedMobileSource: mobile }
  } catch {
    return null
  }
}

/**
 * Owns everything video-related: source selection (mobile file first when it
 * exists), the preload strategy, the seek governor and the playback unlock.
 *
 * Preload strategy — balancing fast start against instant scrubbing:
 * - reduced motion        → no video at all (poster only), done immediately;
 * - file ≤ blobMaxBytes   → fully buffered up-front (blob URL): every later
 *                           seek is instant; progress = real bytes;
 * - larger files          → native progressive streaming: the experience
 *                           starts once `minBufferSeconds` are buffered and
 *                           the browser keeps buffering in the background.
 */
export function useScrollVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  reduced: boolean,
  bus: LoaderBus,
  onState?: (state: PreloadState) => void,
): ScrollVideoController {
  const readyRef = useRef(false)
  const durationRef = useRef(0)
  const govRef = useRef<GovernorState>({
    cost: GOVERNOR.initialCostMs,
    pendingSince: 0,
    lastSeekAt: 0,
    samples: 0,
    frameHandle: 0,
  })

  useEffect(() => {
    const video = videoRef.current as FrameCallbackVideo | null
    const gov = govRef.current
    const abort = new AbortController()
    let objectUrl: string | null = null
    let pollId: number | null = null
    let onProgressEvt: (() => void) | null = null
    let cancelled = false

    gov.cost = GOVERNOR.initialCostMs
    gov.pendingSince = 0
    gov.lastSeekAt = 0
    gov.samples = 0

    const finish = (mode: PreloadState['mode'], usedMobileSource: boolean) => {
      if (cancelled) return
      onState?.({ mode, usedMobileSource })
      bus.reportDone()
    }

    if (reduced || !video) {
      finish('poster', false)
      return () => {
        cancelled = true
      }
    }

    const onMeta = () => {
      if (Number.isFinite(video.duration)) durationRef.current = video.duration
    }
    video.addEventListener('loadedmetadata', onMeta)

    // Fallback completion signal for browsers without frame callbacks (Firefox).
    const onSeeked = () => settle(gov, performance.now())
    video.addEventListener('seeked', onSeeked)

    // Every engine seeks more reliably after the element has been played once;
    // iOS additionally refuses programmatic seeks until a gesture-driven play.
    let unlocked = false
    const unlock = () => {
      if (unlocked) return
      unlocked = true
      video
        .play()
        .then(() => video.pause())
        .catch(() => {})
    }
    window.addEventListener('pointerdown', unlock, { once: true, passive: true })
    window.addEventListener('touchstart', unlock, { once: true, passive: true })
    window.addEventListener('keydown', unlock, { once: true })

    if (import.meta.env.DEV) {
      ;(window as unknown as { __xpGovernor?: unknown }).__xpGovernor = {
        stats: () => ({
          seekCostMs: Math.round(gov.cost * 100) / 100,
          seeks: gov.samples,
          intervalMs: Math.round(
            clamp(
              gov.cost * GOVERNOR.headroom,
              GOVERNOR.minIntervalMs,
              GOVERNOR.maxIntervalMs,
            ),
          ),
          frameCallback: typeof video.requestVideoFrameCallback === 'function',
          fastSeek: typeof video.fastSeek === 'function',
        }),
      }
    }

    const startProgressive = (source: ProbeResult) => {
      video.preload = 'auto'
      video.src = source.url
      video.load()
      const startedAt = performance.now()
      const check = () => {
        if (cancelled || readyRef.current) return
        onMeta()
        const duration = durationRef.current
        // buffered range that contains the start of the video
        let bufferedEnd = 0
        const b = video.buffered
        for (let i = 0; i < b.length; i++) {
          if (b.start(i) <= 0.5) bufferedEnd = Math.max(bufferedEnd, b.end(i))
        }
        const gate = duration
          ? Math.min(LOADER.minBufferSeconds, duration)
          : LOADER.minBufferSeconds
        bus.reportProgress(Math.min(bufferedEnd / gate, 1) * 0.98)
        const gateReached =
          duration > 0 && bufferedEnd >= Math.min(gate, duration - 0.1)
        const timedOut =
          performance.now() - startedAt > LOADER.maxWaitMs &&
          video.readyState >= 2
        if (gateReached || timedOut) {
          readyRef.current = true
          if (pollId !== null) {
            clearInterval(pollId)
            pollId = null
          }
          finish('progressive', source.usedMobileSource)
        }
      }
      onProgressEvt = check
      video.addEventListener('progress', check)
      pollId = window.setInterval(check, 200)
      check()
    }

    const run = async () => {
      const wantsMobile = window.matchMedia(
        `(max-width: ${EXPERIENCE.mobileBreakpoint}px)`,
      ).matches
      const candidates = wantsMobile
        ? [
            { src: ASSETS.videoMobile, mobile: true },
            { src: ASSETS.videoDesktop, mobile: false },
          ]
        : [{ src: ASSETS.videoDesktop, mobile: false }]

      let source: ProbeResult | null = null
      for (const c of candidates) {
        source = await probe(c.src, c.mobile)
        if (source) break
      }
      if (cancelled) return
      if (!source) {
        finish('none', false)
        return
      }

      if (source.size > 0 && source.size <= LOADER.blobMaxBytes) {
        try {
          const res = await fetch(source.url, { signal: abort.signal })
          if (!res.ok || !res.body) throw new Error(`fetch ${res.status}`)
          const reader = res.body.getReader()
          const chunks: BlobPart[] = []
          let received = 0
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            received += value.length
            bus.reportProgress((received / source.size) * 0.98)
          }
          if (cancelled) return
          objectUrl = URL.createObjectURL(
            new Blob(chunks, { type: 'video/mp4' }),
          )
          video.src = objectUrl
          video.load()
          const ready = () => {
            onMeta()
            readyRef.current = true
            finish('blob', source.usedMobileSource)
          }
          if (video.readyState >= 1) ready()
          else video.addEventListener('loadedmetadata', ready, { once: true })
          return
        } catch {
          if (cancelled) return
          // network hiccup mid-download — fall back to native streaming
        }
      }

      startProgressive(source)
    }
    void run()

    return () => {
      cancelled = true
      abort.abort()
      readyRef.current = false
      durationRef.current = 0
      if (pollId !== null) clearInterval(pollId)
      if (gov.frameHandle && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(gov.frameHandle)
        gov.frameHandle = 0
      }
      if (onProgressEvt) video.removeEventListener('progress', onProgressEvt)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('seeked', onSeeked)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('keydown', unlock)
      if (import.meta.env.DEV)
        delete (window as unknown as { __xpGovernor?: unknown }).__xpGovernor
      video.removeAttribute('src')
      video.load()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [videoRef, reduced, bus, onState])

  return useMemo<ScrollVideoController>(
    () => ({
      isReady: () => readyRef.current,
      update(progress: number) {
        const video = videoRef.current as FrameCallbackVideo | null
        if (!video || !readyRef.current) return
        const duration = durationRef.current
        if (!duration) return
        // Nothing is composited while hidden — seeking would only burn decode.
        if (document.hidden) return

        const gov = govRef.current
        const now = performance.now()

        if (gov.pendingSince !== 0) {
          // A seek is still in flight; stacking another makes decoders thrash.
          if (now - gov.pendingSince < GOVERNOR.watchdogMs) return
          // Its completion signal never arrived (some engines drop it under
          // rapid seeking) — charge the full wait and reopen the gate.
          gov.cost = GOVERNOR.watchdogMs
          gov.pendingSince = 0
        }
        if (video.seeking) return

        // Issue seeks no faster than this browser has proven it can retire them.
        const interval = clamp(
          gov.cost * GOVERNOR.headroom,
          GOVERNOR.minIntervalMs,
          GOVERNOR.maxIntervalMs,
        )
        if (now - gov.lastSeekAt < interval) return

        const max = Math.max(duration - EXPERIENCE.videoEndEpsilon, 0)
        const target = clamp(progress, 0, 1) * max
        // On a slow engine, only movement worth its seek cost is worth seeking.
        const minDelta = Math.max(
          GOVERNOR.minTimeDelta,
          gov.cost * GOVERNOR.costToTimeDelta,
        )
        if (Math.abs(target - video.currentTime) < minDelta) return

        gov.pendingSince = now
        gov.lastSeekAt = now

        // Prefer the frame-presentation callback: it measures until pixels
        // actually change, which is what the viewer perceives as the seek.
        if (
          typeof video.requestVideoFrameCallback === 'function' &&
          typeof video.cancelVideoFrameCallback === 'function'
        ) {
          if (gov.frameHandle) video.cancelVideoFrameCallback(gov.frameHandle)
          gov.frameHandle = video.requestVideoFrameCallback((presentedAt) => {
            gov.frameHandle = 0
            settle(gov, presentedAt)
          })
        }

        // With an all-intra encode, fastSeek is frame-accurate and cheaper (Safari).
        if (typeof video.fastSeek === 'function') video.fastSeek(target)
        else video.currentTime = target
      },
    }),
    [videoRef],
  )
}
