import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Page } from '../../../tools/dsh-web-drive/lib/page.mts'

const panel = '[data-sidebar-right-session]:not([hidden]) [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]'
const mode = 'select[name="dsh-sidebar-opening-mode"]'

interface Edges {
  sidebarRight: number
  panelLeft: number
  panelRight: number
  frameRight: number
  handleCenter?: number
}

const hittable = (finder: string) => `(() => {
  const element = ${finder}
  if (!element) return false
  const { x, y, width, height } = element.getBoundingClientRect()
  return element.contains(document.elementFromPoint(x + width / 2, y + height / 2))
})()`

async function click(page: Page, finder: string): Promise<void> {
  await page.waitFor(`Boolean(${finder})`)
  await page.eval(`(${finder})?.scrollIntoView({ block: 'nearest' })`)
  await page.waitFor(hittable(finder))
  assert.equal(typeof await page.click(finder), 'object')
}

async function toggleAndMeasure(page: Page, toggle: string, motion: boolean): Promise<void> {
  await page.waitFor(hittable(toggle))
  // Start before the input so even a one-frame snap has both endpoints in the trace.
  const trace = page.eval(`new Promise(resolve => {
    const panel = document.querySelector(${JSON.stringify(panel)})
    const frame = panel.closest('[data-rightbar-col]').parentElement
    const sidebar = frame.querySelector(':scope > :has(> [data-slot="sidebar"])')
    const measure = () => {
      const handle = frame.querySelector(':scope > [data-side="sidebar"]')?.getBoundingClientRect()
      return {
        sidebarRight: sidebar.getBoundingClientRect().right,
        panelLeft: panel.getBoundingClientRect().left,
        panelRight: panel.getBoundingClientRect().right,
        frameRight: frame.getBoundingClientRect().right,
        handleCenter: handle && (handle.left + handle.right) / 2,
      }
    }
    const samples = [measure()]
    const deadline = performance.now() + 750
    function sample(now) {
      samples.push(measure())
      if (now < deadline) requestAnimationFrame(sample)
      else resolve(samples)
    }
    requestAnimationFrame(sample)
  })`)
  assert.equal(typeof await page.click(toggle), 'object')
  const frames = await trace as Edges[]
  const from = frames[0].sidebarRight
  const to = frames.at(-1)!.sidebarRight
  assert.ok(Math.abs(from - to) > 100, 'the sidebar finishes toggling')
  assert.ok(frames.every(({ sidebarRight, panelLeft, panelRight, frameRight }) =>
    Math.abs(sidebarRight - panelLeft) < 1 && Math.abs(panelRight - frameRight) < 1),
  'the panel fills the area beside the visible sidebar throughout the toggle')
  assert.ok(frames.every(({ sidebarRight, handleCenter }) =>
    handleCenter === undefined || Math.abs(sidebarRight - handleCenter) < 1),
  'the resize handle stays on the visible edge')
  const hasIntermediateWidth = frames.some(({ sidebarRight }) =>
    sidebarRight > Math.min(from, to) + 1 && sidebarRight < Math.max(from, to) - 1)
  assert.equal(hasIntermediateWidth, motion, motion ? 'the edge should slide' : 'reduced motion should snap the edge')
}

test('the right panel follows the animated left sidebar edge', { timeout: 60_000 }, async t => {
  const url = process.env.DSH_SIDEBAR_TEST_URL
  if (!url) return t.skip('Set DSH_SIDEBAR_TEST_URL to a disposable English DSH Web profile')
  const { open, byLabel, bySel, byText } = await import('../../../tools/dsh-web-drive/lib/page.mts')
  const page = await open(url, { viewport: { width: 1440, height: 900 } })
  try {
    const plugins = byLabel('Plugins')
    const preview = hittable(byText('Continue'))
    const onboarding = `document.body.innerText.includes('Get started')`
    await page.waitFor(`${preview} || ${onboarding} || ${hittable(plugins)}`)
    if (await page.eval(preview)) await click(page, byText('Continue'))
    await page.waitFor(`${onboarding} || ${hittable(plugins)}`)
    if (await page.eval(onboarding)) await page.key('Escape')
    await click(page, plugins)
    await click(page, byLabel('View Larger sidebar'))
    await page.waitFor(`Boolean(document.querySelector('${mode}:enabled'))`)
    await page.eval(`(() => {
      const select = document.querySelector('${mode}')
      select.value = 'left-sidebar'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await page.waitFor(`document.querySelector('${mode}:enabled:not([aria-disabled])')?.value === 'left-sidebar'`)
    await click(page, byLabel('New session'))
    await click(page, bySel('[data-sidebar-right-expand]'))
    await page.waitFor(`Boolean(document.querySelector(${JSON.stringify(panel)})?.closest('[data-rightbar-fullscreen]:not([data-animating])'))`)

    const toggle = bySel('[data-sidebar-toggle]')
    await page.session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await toggleAndMeasure(page, toggle, true)
    await toggleAndMeasure(page, toggle, true)

    const start = await page.center(bySel('[data-side="sidebar"]'))
    assert.ok(start)
    const end = { x: start.x + 48, y: start.y }
    await page.session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1 })
    await page.session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 })
    await page.waitFor(`document.querySelector('[data-rightbar-fullscreen][data-dragging]') !== null
      && Math.abs(document.querySelector(${JSON.stringify(panel)}).getBoundingClientRect().left - ${end.x}) < 1`)
    await page.session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', clickCount: 1 })

    await page.session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await toggleAndMeasure(page, toggle, false)
    assert.deepEqual(page.errors().exceptions, [])
  } finally {
    await page.close()
  }
})
