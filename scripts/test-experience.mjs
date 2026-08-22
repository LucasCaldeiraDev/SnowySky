import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4180'
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const issues = []

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true })
    } catch {
      /* try next */
    }
  }
  issues.push('WARN: fell back to bundled chromium — H.264 video will not decode')
  return chromium.launch({ headless: true })
}

async function run(browser, width, height, tag, probes) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      issues.push(`[${tag}] console.${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => issues.push(`[${tag}] pageerror: ${e.message}`))

  await page.goto(BASE)
  await page.screenshot({ path: `${OUT}${tag}-00-loader.png` })
  await page.waitForSelector('.loader', { state: 'detached', timeout: 25000 })
  await page.waitForTimeout(2800) // intro settles
  await page.screenshot({ path: `${OUT}${tag}-01-hero.png` })

  const meta = await page.evaluate(() => {
    const v = document.querySelector('.xp-video')
    return {
      duration: v ? +v.duration.toFixed(2) : null,
      scrollable: document.documentElement.scrollHeight - innerHeight,
      alt: document.querySelector('[data-alt-value]')?.textContent,
      locked: document.documentElement.classList.contains('is-locked'),
    }
  })
  console.log(tag, 'meta', JSON.stringify(meta))

  for (let i = 0; i < probes.length; i++) {
    const p = probes[i]
    await page.evaluate(
      (f) =>
        window.scrollTo(
          0,
          (document.documentElement.scrollHeight - window.innerHeight) * f,
        ),
      p,
    )
    await page.waitForTimeout(1600) // let the lerp settle
    const st = await page.evaluate(() => {
      const v = document.querySelector('.xp-video')
      return {
        t: v ? +v.currentTime.toFixed(2) : null,
        alt: document.querySelector('[data-alt-value]')?.textContent,
        label: document.querySelector('[data-alt-label]')?.textContent,
        finalActive: !!document.querySelector('.scene--final.is-active'),
      }
    })
    console.log(tag, `p=${p}`, JSON.stringify(st))
    await page.screenshot({
      path: `${OUT}${tag}-${String(i + 2).padStart(2, '0')}-p${Math.round(p * 100)}.png`,
    })
  }
  await ctx.close()
}

const browser = await launch()
await run(browser, 1440, 900, 'desktop', [0.08, 0.33, 0.52, 0.66, 0.85, 1.0])
await run(browser, 1920, 1080, 'wide', [0.72, 1.0])
await run(browser, 390, 844, 'mobile', [0.33, 0.7, 1.0])
await browser.close()

console.log('ISSUES:', issues.length ? JSON.stringify(issues, null, 1) : 'none')
