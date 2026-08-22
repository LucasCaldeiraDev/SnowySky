import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { LOADER } from '../../data/scenes'
import type { LoaderBus } from '../../lib/loaderBus'
import './Loader.css'

interface Props {
  bus: LoaderBus
  /** Called after the overlay has fully faded out. */
  onGone(): void
}

/**
 * Purely presentational: renders the loading line and follows the bus.
 * The actual preloading lives in useScrollVideo (Experience side).
 */
export function Loader({ bus, onGone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const t0 = performance.now()
    const progress = { value: 0 }
    const applyFill = () => {
      if (fillRef.current)
        fillRef.current.style.transform = `scaleX(${progress.value})`
    }
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      unsub()
      const settle = Math.max(
        0.45,
        (LOADER.minDisplayMs - (performance.now() - t0)) / 1000,
      )
      gsap
        .timeline()
        .to(progress, {
          value: 1,
          duration: settle,
          ease: 'power2.inOut',
          overwrite: true,
          onUpdate: applyFill,
        })
        .to(rootRef.current, {
          autoAlpha: 0,
          duration: 0.85,
          ease: 'power2.inOut',
          delay: 0.2,
        })
        .add(() => {
          bus.reportHidden()
          onGone()
        })
    }

    const sync = () => {
      if (bus.isDone()) {
        finish()
        return
      }
      gsap.to(progress, {
        value: bus.getProgress() * 0.96,
        duration: 0.5,
        ease: 'power1.out',
        overwrite: true,
        onUpdate: applyFill,
      })
    }
    const unsub = bus.subscribe(sync)
    sync()

    return () => {
      unsub()
    }
  }, [bus, onGone])

  return (
    <div className="loader" ref={rootRef} role="status" aria-live="polite">
      <svg className="loader-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 17 L11 6.5 L15 12 L18.2 8.2 L20 17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
        />
      </svg>
      <div className="loader-title">IMMERSIVE</div>
      <div className="loader-sub">LOADING EXPERIENCE</div>
      <span className="loader-line">
        <span className="loader-fill" ref={fillRef} />
      </span>
      <span className="sr-only">Loading the immersive experience</span>
    </div>
  )
}
