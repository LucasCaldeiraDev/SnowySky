/**
 * Stresses the scroll-video seek governor and reports what it measured.
 *
 * Drives a continuous rAF-paced scroll (like a real trackpad flick), then
 * reads the governor's own stats plus how far the painted frame drifted from
 * the scroll position. Run against a dev server on :4180.
 *
 *   node scripts/governor-probe.mjs            # this machine, full speed
 *   node scripts/governor-probe.mjs --cpu 6    # emulate a 6× slower device
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:4180'
const cpuArg = process.argv.indexOf('--cpu')
const CPU_THROTTLE = cpuArg === -1 ? 1 : Number(process.argv[cpuArg + 1]) || 1

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

const browser = await launch()
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 900 } })
).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(BASE)
await page.waitForSelector('.loader', { state: 'detached', timeout: 40000 })
await page.waitForTimeout(2800)

if (CPU_THROTTLE > 1) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
}

// Continuous downward scroll over ~4s, one step per animation frame.
const sweep = await page.evaluate(async () => {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const video = document.querySelector('video')
  const started = performance.now()
  const drift = []
  await new Promise((resolve) => {
    const step = () => {
      const t = (performance.now() - started) / 4000
      if (t >= 1) return resolve()
      window.scrollTo(0, max * t)
      if (video?.duration)
        drift.push(Math.abs(video.currentTime / video.duration - t))
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  drift.sort((a, b) => a - b)
  return {
    frames: drift.length,
    medianDriftPct: +(drift[drift.length >> 1] * 100).toFixed(2),
    worstDriftPct: +(drift[drift.length - 1] * 100).toFixed(2),
  }
})

// Let the lerp settle, then check the video landed where the scroll is.
await page.waitForTimeout(1500)
const settled = await page.evaluate(() => {
  const v = document.querySelector('video')
  const max = document.documentElement.scrollHeight - window.innerHeight
  return {
    scrollPct: +((window.scrollY / max) * 100).toFixed(2),
    videoPct: +((v.currentTime / v.duration) * 100).toFixed(2),
  }
})

const stats = await page.evaluate(() => window.__xpGovernor?.stats() ?? null)

console.log('governor  ', JSON.stringify(stats))
console.log('sweep     ', JSON.stringify(sweep))
console.log('settled   ', JSON.stringify(settled))
console.log('pageerrors', errors.length ? JSON.stringify(errors) : 'none')

await browser.close()
