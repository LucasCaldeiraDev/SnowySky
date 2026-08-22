import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import './Cursor.css'

interface Props {
  reduced: boolean
}

/**
 * Discreet custom cursor: an instant dot and a trailing hairline ring.
 * Pointer-fine devices only; with reduced motion the ring stops trailing.
 */
export function Cursor({ reduced }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const ringRef = useRef<HTMLSpanElement>(null)
  const [enabled] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: fine)').matches,
  )

  useEffect(() => {
    const root = rootRef.current
    const dot = dotRef.current
    const ring = ringRef.current
    if (!enabled || !root || !dot || !ring) return

    document.documentElement.classList.add('has-cursor')

    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const trail = { x: pos.x, y: pos.y }
    let seen = false

    const setDotX = gsap.quickSetter(dot, 'x', 'px') as (v: number) => void
    const setDotY = gsap.quickSetter(dot, 'y', 'px') as (v: number) => void
    const setRingX = gsap.quickSetter(ring, 'x', 'px') as (v: number) => void
    const setRingY = gsap.quickSetter(ring, 'y', 'px') as (v: number) => void

    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX
      pos.y = e.clientY
      if (!seen) {
        seen = true
        trail.x = pos.x
        trail.y = pos.y
        gsap.to(root, { autoAlpha: 1, duration: 0.35, overwrite: true })
      }
    }

    const tick = (_t: number, deltaMS: number) => {
      const k = reduced ? 1 : 1 - Math.exp((-deltaMS / 1000) * 11)
      trail.x += (pos.x - trail.x) * k
      trail.y += (pos.y - trail.y) * k
      setDotX(pos.x)
      setDotY(pos.y)
      setRingX(trail.x)
      setRingY(trail.y)
    }
    gsap.ticker.add(tick)

    const isInteractive = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('a, button, [data-hover]') !== null

    const onOver = (e: PointerEvent) => {
      root.classList.toggle('is-hover', isInteractive(e.target))
    }
    const onDown = () => root.classList.add('is-down')
    const onUp = () => root.classList.remove('is-down')
    const onLeave = () => {
      seen = false
      gsap.to(root, { autoAlpha: 0, duration: 0.3, overwrite: true })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerover', onOver, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    return () => {
      document.documentElement.classList.remove('has-cursor')
      gsap.ticker.remove(tick)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerover', onOver)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [enabled, reduced])

  if (!enabled) return null

  return (
    <div className="cursor" ref={rootRef} aria-hidden="true">
      <span className="cursor-ring" ref={ringRef}>
        <i />
      </span>
      <span className="cursor-dot" ref={dotRef}>
        <i />
      </span>
    </div>
  )
}
