/**
 * Mobile regression probe using Playwright's real WebKit engine (the same
 * engine family as iOS Safari — the one browser that actually gates
 * programmatic video seeking behind a user-gesture play()). Chromium/Android
 * doesn't need that gate at all, so this is the only local way to exercise
 * the unlock retry logic meaningfully.
 *
 * Scenario: a touch lands before the video has any data (routine on mobile
 * networks) — the fix must retry on the next gesture instead of staying
 * locked for the rest of the session.
 */
import { webkit, devices } from 'playwright'

const BASE = 'http://localhost:4180'
const iPhone = devices['iPhone 13']

const browser = await webkit.launch({ headless: true })
const context = await browser.newContext({ ...iPhone })
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

// Delay only the very first response to the video file substantially, so a
// tap fired right at page load reliably lands before readyState reaches 2 —
// exactly the race the fix targets. Later requests (progressive buffering)
// go through at full local speed.
let firstVideoRequest = true
await context.route('**/*.mp4', async (route) => {
  if (firstVideoRequest) {
    firstVideoRequest = false
    await new Promise((r) => setTimeout(r, 4000))
  }
  await route.continue()
})

await page.goto(BASE)

// Loader must be up (video is nowhere near ready yet).
const loaderVisible = await page.locator('.loader').isVisible()

// iOS scroll-lock check: while locked, body must be pinned via
// position:fixed — overflow:hidden alone doesn't stop WebKit rubber-banding.
const lockStyle = await page.evaluate(() => getComputedStyle(document.body).position)

// The impatient first tap — fires while the video almost certainly has
// readyState 0 (net-throttled). Real trusted input, not a JS-dispatched event.
await page.touchscreen.tap(200, 400)
const earlyState = await page.evaluate(() => window.__xpGovernor?.stats() ?? null)

// Let the delayed byte arrive and the loader run its course.
await page.waitForSelector('.loader', { state: 'detached', timeout: 30000 })
await page.waitForTimeout(2800) // intro settles

const unlockStyle = await page.evaluate(() => getComputedStyle(document.body).position)

// Second tap: data is ready now — this is the retry that must succeed.
await page.touchscreen.tap(200, 400)
await page.waitForTimeout(300)
const afterSecondTap = await page.evaluate(() => window.__xpGovernor?.stats() ?? null)

// Drive real scroll and confirm frames actually present (governor's
// completion signal — requestVideoFrameCallback/seeked — must fire).
const max = await page.evaluate(
  () => document.documentElement.scrollHeight - window.innerHeight,
)
for (const frac of [0.15, 0.35, 0.55, 0.75, 0.95]) {
  await page.evaluate((y) => window.scrollTo(0, y), max * frac)
  await page.waitForTimeout(220)
}
await page.waitForTimeout(1200)

const finalState = await page.evaluate(() => {
  const v = document.querySelector('video')
  return {
    currentTime: v ? +v.currentTime.toFixed(2) : null,
    duration: v ? +v.duration.toFixed(2) : null,
    scrollPct: +(
      (window.scrollY /
        (document.documentElement.scrollHeight - window.innerHeight)) *
      100
    ).toFixed(1),
    stats: window.__xpGovernor?.stats() ?? null,
    finalCtaHref: document.querySelector('.final-primary')?.getAttribute('href') ?? null,
  }
})

console.log('loaderVisibleAtLoad ', loaderVisible)
console.log('bodyPosition(locked)', lockStyle, '(expect fixed)')
console.log('earlyTap (pre-data) ', JSON.stringify(earlyState), '(expect unlocked:false)')
console.log('bodyPosition(unlock)', unlockStyle, '(expect NOT fixed)')
console.log('secondTap (post-data)', JSON.stringify(afterSecondTap), '(expect unlocked:true)')
console.log('finalState          ', JSON.stringify(finalState))
console.log('pageerrors          ', errors.length ? JSON.stringify(errors) : 'none')

const pass =
  earlyState &&
  earlyState.unlocked === false &&
  afterSecondTap &&
  afterSecondTap.unlocked === true &&
  finalState.stats?.seeks > 0 &&
  finalState.currentTime > 0 &&
  lockStyle === 'fixed' &&
  unlockStyle !== 'fixed' &&
  errors.length === 0

console.log('\nRESULT:', pass ? 'PASS' : 'FAIL')

await browser.close()
process.exit(pass ? 0 : 1)
