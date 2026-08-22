export type PreloadMode = 'pending' | 'blob' | 'progressive' | 'poster' | 'none'

export interface PreloadState {
  mode: PreloadMode
  usedMobileSource: boolean
}

/**
 * Tiny mutable event bus connecting the video preloader (useScrollVideo),
 * the Loader overlay and the Experience intro. No React state involved —
 * progress updates never re-render anything.
 */
export function createLoaderBus() {
  let progress = 0
  let done = false
  let hidden = false
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const fn of listeners) fn()
  }
  return {
    getProgress: () => progress,
    isDone: () => done,
    isHidden: () => hidden,
    /** Preload progress 0–1 (monotonic). */
    reportProgress(p: number) {
      progress = Math.min(1, Math.max(progress, p))
      emit()
    },
    /** The experience may start (enough video is ready — or there is none). */
    reportDone() {
      if (done) return
      done = true
      progress = 1
      emit()
    },
    /** The loader overlay finished fading out. */
    reportHidden() {
      if (hidden) return
      hidden = true
      emit()
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

export type LoaderBus = ReturnType<typeof createLoaderBus>
