import { useState } from 'react'

/**
 * Read once at mount — the whole experience graph (track height, scrub,
 * intro) is built from this flag, so live toggling would require a rebuild.
 * A page reload after changing the OS setting picks it up.
 */
export function useReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  return reduced
}
