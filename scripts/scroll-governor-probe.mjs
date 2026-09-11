/**
 * Proves the SCROLL_GOVERNOR speed clamp: however violently the user moves
 * the scrollbar (an instant jump, like End/Home or dragging the OS
 * scrollbar thumb to the end), the video must never jump — it should sweep
 * at a bounded max speed instead. Measures the actual per-frame video-time
 * deltas during the catch-up and the total time to settle.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:4180'

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true })
    } catch {
      /* try next */
    }
  }
  throw new Error('needs system Chrome or Edge (bundled Chromium lacks H.264)')
}

/**
 * Instantly jump scroll to `frac` of the track, then sample video.currentTime
 * every animation frame for `ms` (for the settle-time measurement, which
 * doesn't need tick-perfect precision), while separately reading the
 * ground-truth max-step-per-tick from `__xpScrollGovernor` — instrumentation
 * living INSIDE the real gsap.ticker callback, immune to this polling loop's
 * own scheduling jitter under headless Chrome (which could otherwise miss a
 * tick and misreport two real ticks as one oversized jump).
 */
async function jumpAndTrace(page, frac, ms) {
  await page.evaluate(() => window.__xpScrollGovernor?.reset())
  const result = await page.evaluate(
    async ([frac, ms]) => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, max * frac) // instant, one-shot — like End/Home/scrollbar drag
      const v = document.querySelector('video')
      const trace = []
      const t0 = performance.now()
      await new Promise((resolve) => {
        const step = () => {
          trace.push({ t: performance.now() - t0, ct: v.currentTime })
          if (performance.now() - t0 >= ms) return resolve()
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
      const finalCt = trace[trace.length - 1].ct
      const targetCt = frac * v.duration
      // first time it gets within 2% of the target (i.e. effectively settled)
      const settleIdx = trace.findIndex((s) => Math.abs(s.ct - targetCt) < v.duration * 0.02)
      return {
        duration: v.duration,
        finalCt: +finalCt.toFixed(2),
        targetCt: +targetCt.toFixed(2),
        settleMs: settleIdx === -1 ? null : Math.round(trace[settleIdx].t),
        samples: trace.length,
      }
    },
    [frac, ms],
  )
  const groundTruth = await page.evaluate(() => window.__xpScrollGovernor?.stats())
  return {
    ...result,
    maxStepDeltaSec: +groundTruth.maxStepSeen.toFixed(3),
    ticksObserved: groundTruth.ticks,
  }
}

const browser = await launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(BASE)
await page.waitForSelector('.loader', { state: 'detached', timeout: 30000 })
await page.waitForTimeout(2800) // intro settles

console.log('--- instant jump 0% -> 100% (like pressing End) ---')
const toEnd = await jumpAndTrace(page, 1.0, 2500)
console.log(JSON.stringify(toEnd, null, 1))

console.log('--- instant jump back 100% -> 0% (like pressing Home) ---')
const toHome = await jumpAndTrace(page, 0.0, 2500)
console.log(JSON.stringify(toHome, null, 1))

console.log('--- instant jump 10% -> 60% (mid-scrollbar drag) ---')
const midJump = await jumpAndTrace(page, 0.1, 100)
await page.waitForTimeout(50)
const midJump2 = await jumpAndTrace(page, 0.6, 1500)
console.log(JSON.stringify(midJump2, null, 1))

console.log('pageerrors', errors.length ? JSON.stringify(errors) : 'none')

// Two duration-independent invariants, kept in sync with scenes.ts by hand
// (this script asserts OBSERVED behavior; scenes.ts stays the source of
// truth for the actual values):
//   - can't sweep the full timeline faster than duration / maxPlaybackMultiple
//   - a single tick can't jump more than maxPlaybackMultiple * maxFrameDeltaMs
const MAX_PLAYBACK_MULTIPLE = 30
const MAX_FRAME_DELTA_MS = 48
const theoreticalFloorMs = (toEnd.duration / MAX_PLAYBACK_MULTIPLE) * 1000
const worstCaseStepSec = MAX_PLAYBACK_MULTIPLE * (MAX_FRAME_DELTA_MS / 1000)
// maxStepDeltaSec is now measured INSIDE the real tick (ground truth, not
// polled from outside), so it should satisfy this inequality exactly — only
// float rounding needs headroom, not scheduling jitter.
const slack = 1.02

const pass =
  toEnd.settleMs !== null &&
  toEnd.settleMs >= theoreticalFloorMs * 0.85 &&
  toHome.settleMs !== null &&
  toHome.settleMs >= theoreticalFloorMs * 0.85 &&
  toEnd.maxStepDeltaSec <= worstCaseStepSec * slack &&
  toHome.maxStepDeltaSec <= worstCaseStepSec * slack &&
  midJump2.maxStepDeltaSec <= worstCaseStepSec * slack &&
  errors.length === 0

console.log(`\ntheoretical floor ~${Math.round(theoreticalFloorMs)}ms (duration/${MAX_PLAYBACK_MULTIPLE})`)
console.log(`worst-case single-tick step ~${worstCaseStepSec.toFixed(2)}s (×${slack} slack = ${(worstCaseStepSec * slack).toFixed(2)}s)`)
console.log('RESULT:', pass ? 'PASS' : 'FAIL')

await browser.close()
process.exit(pass ? 0 : 1)
