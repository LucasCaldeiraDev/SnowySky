import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { ASSETS, EXPERIENCE, LOADER } from '../data/scenes'
import type { LoaderBus, PreloadState } from '../lib/loaderBus'

export interface ScrollVideoController {
  /** True once the video can be scrubbed. */
  isReady(): boolean
  /** Feed the smoothed experience progress (0–1), once per frame. */
  update(progress: number): void
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
 * exists), the preload strategy, seek throttling and the iOS unlock.
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

  useEffect(() => {
    const video = videoRef.current
    const abort = new AbortController()
    let objectUrl: string | null = null
    let pollId: number | null = null
    let onProgressEvt: (() => void) | null = null
    let cancelled = false

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

    // iOS/Safari quirk: one muted play()+pause() on the first touch
    // makes programmatic seeking reliable.
    const unlock = () => {
      video
        .play()
        .then(() => video.pause())
        .catch(() => {})
    }
    window.addEventListener('touchstart', unlock, { once: true, passive: true })

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
      if (onProgressEvt) video.removeEventListener('progress', onProgressEvt)
      video.removeEventListener('loadedmetadata', onMeta)
      window.removeEventListener('touchstart', unlock)
      video.removeAttribute('src')
      video.load()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [videoRef, reduced, bus, onState])

  return useMemo<ScrollVideoController>(
    () => ({
      isReady: () => readyRef.current,
      update(progress: number) {
        const video = videoRef.current
        if (!video || !readyRef.current) return
        const duration = durationRef.current
        if (!duration) return
        // A seek is still in flight — queuing another makes decoders stutter.
        if (video.seeking) return
        const max = Math.max(duration - EXPERIENCE.videoEndEpsilon, 0)
        const target = Math.min(Math.max(progress, 0), 1) * max
        if (Math.abs(target - video.currentTime) < EXPERIENCE.minTimeDelta)
          return
        const fastSeek = (
          video as HTMLVideoElement & { fastSeek?: (time: number) => void }
        ).fastSeek
        // With an all-intra encode, fastSeek is frame-accurate and cheaper (Safari).
        if (typeof fastSeek === 'function') fastSeek.call(video, target)
        else video.currentTime = target
      },
    }),
    [videoRef],
  )
}
