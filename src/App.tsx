import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader } from './components/Loader/Loader'
import { Experience } from './components/Experience/Experience'
import { Cursor } from './components/Cursor/Cursor'
import { useReducedMotion } from './hooks/useReducedMotion'
import { createLoaderBus } from './lib/loaderBus'
import type { LoaderBus } from './lib/loaderBus'

export default function App() {
  const reduced = useReducedMotion()
  const busRef = useRef<LoaderBus | null>(null)
  if (busRef.current === null) busRef.current = createLoaderBus()
  const bus = busRef.current
  const [loaderGone, setLoaderGone] = useState(false)

  useEffect(() => {
    // The narrative only makes sense from the top.
    // (`is-locked` itself is set statically on <html> in index.html, not
    // here — a post-mount effect would leave a race window, right at first
    // paint, where touch scroll could bounce before React ever runs.)
    history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
  }, [])

  const handleGone = useCallback(() => setLoaderGone(true), [])

  return (
    <>
      {!loaderGone && <Loader bus={bus} onGone={handleGone} />}
      <Experience reduced={reduced} bus={bus} />
      <Cursor reduced={reduced} />
    </>
  )
}
