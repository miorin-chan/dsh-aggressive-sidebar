import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

/** Capture the module registration the browser module loader would receive. */
let registration
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      registration = entry
    },
  },
}
await import('../client.js')

assert.equal(registration.id, '@miorin/dsh-aggressive-sidebar')
const req = createRequire(import.meta.url)
const fakePrimitives = {
  SegmentedControl: () => null,
  StateDot: () => null,
  IconFullscreenOutlineMedium: () => null,
  IconPanelLeftOutlineMedium: () => null,
}
const plugin = registration.factory(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? fakePrimitives : req(id))

/** Let queued microtasks run. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/**
 * One session's surface store, shaped like the seat's: snapshot, subscription, and the declared action set.
 * @param sessionId - session the surface belongs to.
 * @param options - starting presentation and expansion.
 */
function surfaceStore(sessionId, { expanded = false, mode = 'push' } = {}) {
  let surface = { layout: { expanded, mode }, history: {}, minted: 0 }
  const listeners = new Set()
  const modeCalls = []

  function notify() {
    for (const listener of [...listeners]) listener()
  }
  function set(patch) {
    surface = { ...surface, layout: { ...surface.layout, ...patch } }
    notify()
  }

  const store = {
    actions: {
      setMode(id, next) {
        modeCalls.push([id, next])
        set({ mode: next })
      },
    },
    getSnapshot: () => ({ bySession: { [sessionId]: surface } }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    store,
    modeCalls,
    layout: () => surface.layout,
    open: () => set({ expanded: true }),
    close: () => set({ expanded: false }),
    switchMode: next => set({ mode: next }),
  }
}

/**
 * Build the smallest faithful Client context around the sidebar controller.
 * @param options - an already-adopted session, or a public face without the internal Map.
 */
function harness({ adopted = new Map() } = {}) {
  const disposers = []
  const ctx = {
    sidebarRight: { adopted, mounted: { getSnapshot: () => undefined } },
    inject() {}, // The focus fixture has no Plugins or settings services.
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }
  return { ctx, adopted, disposeAll() { for (const dispose of disposers.reverse()) dispose() } }
}

test('registers mode form only on plugins.bundle.config without detail-section hacks', async () => {
  const { ctx, disposeAll } = harness()
  const slots = new Map()
  const writes = []
  const form = { set: async (key, value) => { writes.push([key, value]); return true } }
  ctx.inject = (_services, apply) => apply(ctx)
  ctx.configForms = { get(id) { assert.equal(id, 'dsh-aggressive-sidebar'); return form } }
  ctx.locale = { register() {} }
  ctx.slots = {
    inject: (_name, register) => ctx.effect(register),
    register(options, render) {
      slots.set(options.name, { options, render })
      return () => slots.delete(options.name)
    },
  }

  plugin.apply(ctx)
  const standalone = slots.get('plugins.bundle.config')
  assert.ok(standalone)
  assert.equal(slots.get('plugins.detail.section'), undefined)
  const settings = standalone.options.inject()
  assert.equal(standalone.options.key, registration.id)
  assert.equal(await settings.saveMode('fullscreen'), true)
  assert.deepEqual(writes, [['mode', 'fullscreen']])
  disposeAll()
  assert.equal(slots.size, 0)

  const req = createRequire(import.meta.url)
  const stubReact = { ...req('react'), useId: () => ':mode-0:', useState: initial => [initial, () => {}] }
  const stubPlugin = registration.factory(id => {
    if (id === 'react') return stubReact
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return fakePrimitives
    return req(id)
  })
  const stubSlots = new Map()
  const stubHarness = harness()
  stubHarness.ctx.inject = (_services, apply) => apply(stubHarness.ctx)
  stubHarness.ctx.configForms = { get: () => form }
  stubHarness.ctx.locale = { register() {} }
  stubHarness.ctx.slots = {
    inject: (_name, register) => stubHarness.ctx.effect(register),
    register(options, render) {
      stubSlots.set(options.name, { options, render })
      return () => stubSlots.delete(options.name)
    },
  }
  stubPlugin.apply(stubHarness.ctx)
  const stubStandalone = stubSlots.get('plugins.bundle.config')
  assert.equal(stubStandalone.render({
    view: 'summary',
    saveMode: stubStandalone.options.inject().saveMode,
    useSidebarSettings: sel => sel({ status: 'ready', value: { mode: 'left-sidebar' }, writable: true }),
    t: String,
  }), null)
  const modeElement = stubStandalone.render({
    view: 'page',
    saveMode: stubStandalone.options.inject().saveMode,
    useSidebarSettings: sel => sel({ status: 'ready', value: { mode: 'left-sidebar' }, writable: true }),
    t: String,
  })
  assert.equal(modeElement.props.className, 'dsh-aggressive-sidebar-settings')
  const styleText = modeElement.props.children.find(child => child?.type === 'style')?.props?.children ?? ''
  assert.doesNotMatch(styleText, /plugins\.detail\.section/)
  assert.match(styleText, /@container \(max-width: 520px\)/)
  assert.match(styleText, /\[data-dsh-aggregate-member\]/)
  const serialized = JSON.stringify(modeElement, (_key, value) => typeof value === 'function' ? value.name : value)
  assert.match(serialized, /SegmentedControl/)
  stubHarness.disposeAll()
})

test('pins a collapsed surface to fullscreen before the panel is ever opened', async () => {
  const { ctx, adopted } = harness()
  const session = surfaceStore('s1')
  plugin.apply(ctx)
  adopted.set('s1', { store: session.store, unsubscribe() {} })
  await flush()

  assert.deepEqual(session.modeCalls, [['s1', 'fullscreen']])
  assert.equal(session.layout().expanded, false, 'the column stays collapsed')
})

test('opens fullscreen because the mode is already recorded', async () => {
  const { ctx, adopted } = harness()
  const session = surfaceStore('s1')
  plugin.apply(ctx)
  adopted.set('s1', { store: session.store, unsubscribe() {} })
  await flush()
  const pinned = session.modeCalls.length

  session.open()
  await flush()

  assert.equal(session.modeCalls.length, pinned, 'the open itself changes nothing')
  assert.equal(session.layout().mode, 'fullscreen')
})

test('leaves an open panel the user switched back alone, and pins again after it closes', async () => {
  const { ctx, adopted } = harness()
  const session = surfaceStore('s1')
  plugin.apply(ctx)
  adopted.set('s1', { store: session.store, unsubscribe() {} })
  await flush()

  session.open()
  session.switchMode('push')
  await flush()
  assert.deepEqual(session.modeCalls, [['s1', 'fullscreen']], 'parked in the split view while open')

  session.close()
  await flush()
  assert.deepEqual(session.modeCalls, [['s1', 'fullscreen'], ['s1', 'fullscreen']])
  assert.equal(session.layout().mode, 'fullscreen', 'the next open lands fullscreen')
})

test('leaves a panel that was already open when the store was adopted', async () => {
  const { ctx, adopted } = harness()
  const session = surfaceStore('s1', { expanded: true, mode: 'push' })
  plugin.apply(ctx)
  adopted.set('s1', { store: session.store, unsubscribe() {} })
  await flush()

  assert.deepEqual(session.modeCalls, [], 'an open panel is the user\'s own choice')

  session.close()
  await flush()
  assert.deepEqual(session.modeCalls, [['s1', 'fullscreen']], 'the next open lands fullscreen')
})

test('covers sessions adopted before the plugin loaded', async () => {
  const session = surfaceStore('s1')
  const adopted = new Map([['s1', { store: session.store, unsubscribe() {} }]])
  const { ctx } = harness({ adopted })
  plugin.apply(ctx)
  await flush()

  assert.deepEqual(session.modeCalls, [['s1', 'fullscreen']])
})

test('stops guarding a store the runtime replaced', async () => {
  const { ctx, adopted } = harness()
  const first = surfaceStore('s1')
  const second = surfaceStore('s1')
  plugin.apply(ctx)
  adopted.set('s1', { store: first.store, unsubscribe() {} })
  await flush()

  adopted.set('s1', { store: second.store, unsubscribe() {} })
  await flush()
  first.close()
  await flush()

  assert.equal(first.modeCalls.length, 1, 'the replaced store is no longer followed')
  assert.deepEqual(second.modeCalls, [['s1', 'fullscreen']])
})

test('fails safe when the public face no longer exposes the store map', async () => {
  const { ctx } = harness()
  ctx.sidebarRight = { mounted: { getSnapshot: () => undefined } }
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }
  try {
    assert.doesNotThrow(() => plugin.apply(ctx))
  } finally {
    console.warn = warn
  }
  assert.equal(warnings.length, 1, 'the break is reported once')
  assert.match(warnings[0], /dsh-aggressive-sidebar/)
})

test('fails safe when a store lacks the presentation action', async () => {
  const { ctx, adopted } = harness()
  const store = { actions: {}, getSnapshot: () => ({ bySession: {} }), subscribe: () => () => {} }
  plugin.apply(ctx)
  assert.doesNotThrow(() => adopted.set('s1', { store, unsubscribe() {} }))
  await flush()
})

test('restores the store map and stops pinning when the plugin unloads', async () => {
  const { ctx, adopted, disposeAll } = harness()
  const nativeSet = adopted.set
  const nativeDelete = adopted.delete
  const session = surfaceStore('s1')
  plugin.apply(ctx)
  adopted.set('s1', { store: session.store, unsubscribe() {} })
  await flush()

  assert.notEqual(adopted.set, nativeSet)
  assert.notEqual(adopted.delete, nativeDelete)

  disposeAll()
  assert.equal(adopted.set, nativeSet)
  assert.equal(adopted.delete, nativeDelete)

  const after = surfaceStore('s2')
  adopted.set('s2', { store: after.store, unsubscribe() {} })
  await flush()
  assert.deepEqual(after.modeCalls, [])

  session.close()
  await flush()
  assert.equal(session.modeCalls.length, 1, 'the old guard was released')
})

/** Attribute selectors this suite's fake DOM understands. */
function matchesSimple(element, selector) {
  let rest = selector.trim()
  const nots = []
  rest = rest.replace(/:not\(([^)]*)\)/g, (_, inner) => {
    nots.push(inner.trim())
    return ''
  })
  if (rest.startsWith(':')) return false
  const attrs = []
  rest = rest.replace(/\[([^\]=]+)(?:="([^"]*)")?\]/g, (_, name, value) => {
    attrs.push([name, value])
    return ''
  })
  rest = rest.trim()
  if (rest !== '' && rest !== '*' && element.tagName !== rest.toUpperCase()) return false
  for (const [name, value] of attrs) {
    if (value === undefined) {
      if (!element.hasAttribute(name)) return false
    } else if (element.getAttribute(name) !== value) return false
  }
  for (const not of nots) if (matchesSimple(element, not)) return false
  return true
}

/** Whether an element matches one of a comma-separated selector list. */
function matches(element, selector) {
  return selector.split(',').some(part => part.trim() !== '' && matchesSimple(element, part))
}

/** One fake element with the subset of DOM behavior the focus path reads. */
class FakeElement {
  constructor(tag, {
    parent, attrs = {}, rect = { width: 1000, height: 800 },
    scrollHeight = 0, clientHeight = 0, overflowY = 'visible',
  } = {}) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = undefined
    this.parent = undefined
    this.children = []
    this.attributes = new Map()
    this.dataset = {}
    this.rect = rect
    this.scrollHeight = scrollHeight
    this.clientHeight = clientHeight
    this.style = { overflowY }
    this.isConnected = true
    this.focusCalls = 0
    if (parent !== undefined) this.appendTo(parent)
    for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value)
  }

  appendTo(parent) {
    this.parent = parent
    parent.children.push(this)
    this.ownerDocument = parent.ownerDocument
  }

  setOwnerDocument(document) {
    this.ownerDocument = document
    for (const child of this.children) child.setOwnerDocument(document)
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      this.dataset[key] = String(value)
    }
  }

  removeAttribute(name) {
    this.attributes.delete(name)
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      delete this.dataset[key]
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  matches(selector) {
    return matches(this, selector)
  }

  closest(selector) {
    let node = this
    while (node !== undefined) {
      if (node.matches(selector)) return node
      node = node.parent
    }
    return null
  }

  contains(other) {
    let node = other
    while (node !== undefined) {
      if (node === this) return true
      node = node.parent
    }
    return false
  }

  querySelectorAll(selector) {
    const found = []
    const visit = node => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child)
        visit(child)
      }
    }
    visit(this)
    return found
  }

  getBoundingClientRect() {
    return { ...this.rect, left: 0, top: 0 }
  }

  getClientRects() {
    return this.rect.width > 0 && this.rect.height > 0 ? [{}] : []
  }

  focus(options) {
    if (this.ownerDocument === undefined) return
    this.focusCalls += 1
    this.lastFocusOptions = options
    this.ownerDocument.activeElement = this
  }
}

/**
 * Build the smallest faithful page around a session surface.
 * @param options - which page content to mount and whether the panel starts open.
 */
function pageFixture({ open = false, root = false, scroll = false, editor = false, embedded = false } = {}) {
  const document = new EventTarget()
  const elements = []
  document.body = new FakeElement('body')
  document.documentElement = new FakeElement('html')
  document.body.ownerDocument = document
  document.documentElement.ownerDocument = document
  document.activeElement = document.body
  document.hasFocus = () => true
  document.defaultView = { getComputedStyle: element => element.style }

  const make = (tag, options = {}) => {
    const element = new FakeElement(tag, options)
    element.setOwnerDocument(document)
    elements.push(element)
    return element
  }
  const panel = make('div', {
    attrs: { 'data-sidebar-right-session': 's1', 'data-sidebar-right-open': '' },
    rect: { width: 1000, height: 800 },
  })
  const pane = make('section', {
    parent: panel,
    attrs: { 'data-dockkit-pane': 'pane', 'data-dockkit-pane-active': '', tabindex: '-1' },
    rect: { width: 1000, height: 780 },
  })
  const section = make('section', {
    parent: pane, attrs: { 'data-dockkit-content': 'tab1' }, rect: { width: 1000, height: 760 },
  })
  const page = { document, panel, pane, section, elements }
  if (root) {
    page.root = make('div', {
      parent: section, attrs: { tabindex: '-1' }, rect: { width: 1000, height: 700 },
    })
  }
  if (scroll) {
    page.scroll = make('div', {
      parent: section, rect: { width: 1000, height: 700 }, scrollHeight: 3000, clientHeight: 700,
      overflowY: 'auto',
    })
  }
  if (editor) {
    page.editor = make('textarea', {
      parent: section, rect: { width: 600, height: 40 },
    })
  }
  if (embedded) {
    page.embedded = make('iframe', {
      parent: section, rect: { width: 1000, height: 700 },
    })
  }

  let session
  document.querySelector = selector => elements.find(element => matches(element, selector)) ?? null
  document.querySelectorAll = selector => {
    if (selector === '[data-sidebar-right-session][data-sidebar-right-open]') {
      return session !== undefined && session.layout().expanded ? [panel] : []
    }
    return elements.filter(element => matches(element, selector))
  }

  return {
    page,
    bind(current) { session = current },
    open() { panel.setAttribute('data-sidebar-right-open', '') },
    close() { panel.removeAttribute('data-sidebar-right-open') },
  }
}

/** Run the plugin against a fake page and one adopted surface. */
function focusHarness(t, {
  open = false, mounted = 's1', toggle = true, ...content
} = {}) {
  const session = surfaceStore('s1', { expanded: open, mode: 'fullscreen' })
  const fixture = pageFixture({ open, ...content })
  fixture.bind(session)
  if (open) fixture.open()
  const adopted = new Map([['s1', { store: session.store, unsubscribe() {} }]])
  const disposers = []
  let time = 0
  const frames = new Map()
  let frameId = 0
  let nativeCalls = 0
  const previousWindow = globalThis.window
  const page = fixture.page
  const requestAnimationFrame = callback => {
    frameId += 1
    frames.set(frameId, callback)
    return frameId
  }
  globalThis.window = {
    document: page.document,
    performance: { now: () => time },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame,
    cancelAnimationFrame(id) { frames.delete(id) },
  }
  const sidebar = {
    adopted,
    mounted: { getSnapshot: () => mounted },
  }
  if (toggle) {
    sidebar.toggleExpanded = () => {
      nativeCalls += 1
      session.open()
      fixture.open()
    }
  }
  const ctx = {
    sidebarRight: sidebar,
    inject() {}, // The focus fixture has no Plugins or settings services.
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }
  plugin.apply(ctx)
  t.after(() => {
    for (const dispose of disposers.reverse()) dispose()
    globalThis.window = previousWindow
  })
  return {
    ...fixture, session, sidebar, adopted, frames,
    nativeCalls: () => nativeCalls,
    runFrame(ms = 16) {
      time += ms
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) callback(time)
    },
    disposeAll() {
      for (const dispose of disposers.reverse()) dispose()
    },
    button() {
      return page.elements.find(element => element.hasAttribute('data-sidebar-right-expand'))
    },
  }
}

test('focuses a page content root when the column opens, without the toggle path', async t => {
  const ui = focusHarness(t, { root: true })
  await flush()
  assert.equal(ui.frames.size, 0, 'a restored-open surface never claims focus')
  ui.session.open()
  ui.open()
  assert.equal(ui.frames.size, 1, 'the store transition starts the page focus')
  ui.runFrame()
  assert.equal(ui.page.document.activeElement, ui.page.root)
  assert.deepEqual(ui.page.root.lastFocusOptions, { preventScroll: true })
  assert.equal(ui.frames.size, 0, 'content focus ends the retry')
  assert.equal(ui.nativeCalls(), 0, 'a plain open needs no toggle')
})

test('gives a scroll viewer a focus stop and takes it back on unload', async t => {
  const ui = focusHarness(t, { scroll: true })
  await flush()
  ui.session.open()
  ui.open()
  ui.runFrame()
  assert.equal(ui.page.document.activeElement, ui.page.scroll)
  assert.equal(ui.page.scroll.getAttribute('tabindex'), '-1')
  assert.equal(ui.page.scroll.hasAttribute('data-dsh-aggressive-sidebar-focus'), true)
  ui.disposeAll()
  assert.equal(ui.page.scroll.hasAttribute('tabindex'), false)
  assert.equal(ui.page.scroll.hasAttribute('data-dsh-aggressive-sidebar-focus'), false)
})

test('prefers an editor or embedded frame over a scroll container', async t => {
  for (const [option, element] of [['editor', 'editor'], ['embedded', 'embedded']]) {
    await t.test(option, async subtest => {
      const ui = focusHarness(subtest, { scroll: true, [option]: true })
      await flush()
      ui.session.open()
      ui.open()
      ui.runFrame()
      assert.equal(ui.page.document.activeElement, ui.page[element])
    })
  }
})

test('falls back to the dock pane when the page has no content stop', async t => {
  const ui = focusHarness(t)
  await flush()
  ui.session.open()
  ui.open()
  ui.runFrame()
  assert.equal(ui.page.document.activeElement, ui.page.pane)
  assert.equal(ui.page.pane.focusCalls, 1)
  assert.equal(ui.frames.size, 1, 'the retry waits for a page that may still mount')
  ui.runFrame(801)
  assert.equal(ui.frames.size, 0)
  assert.equal(ui.page.pane.focusCalls, 1, 'the focused pane is not refocused every frame')
})

test('keeps focus a page already owns', async t => {
  const ui = focusHarness(t, { root: true })
  await flush()
  ui.session.open()
  ui.open()
  ui.page.document.activeElement = ui.page.root
  ui.runFrame()
  assert.equal(ui.page.document.activeElement, ui.page.root)
  assert.equal(ui.page.pane.focusCalls, 0)
  assert.equal(ui.page.root.focusCalls, 0)
  assert.equal(ui.frames.size, 0)
})

test('cancels a pending focus on the next pointer or key press', async t => {
  for (const type of ['pointerdown', 'keydown']) {
    await t.test(type, async subtest => {
      const ui = focusHarness(subtest, { root: true })
      await flush()
      ui.session.open()
      ui.open()
      assert.equal(ui.frames.size, 1)
      ui.page.document.dispatchEvent(new Event(type))
      assert.equal(ui.frames.size, 0)
      assert.equal(ui.page.document.activeElement, ui.page.document.body)
    })
  }
})

test('cancels a pending focus when the column closes', async t => {
  const ui = focusHarness(t, { root: true })
  await flush()
  ui.session.open()
  ui.open()
  assert.equal(ui.frames.size, 1)
  ui.session.close()
  ui.close()
  await flush()
  assert.equal(ui.frames.size, 0)
  assert.equal(ui.page.document.activeElement, ui.page.document.body)
})

test('ignores an open in a background session', async t => {
  const ui = focusHarness(t, { mounted: 's1', root: true })
  await flush()
  const background = surfaceStore('s2')
  ui.adopted.set('s2', { store: background.store, unsubscribe() {} })
  await flush()
  assert.equal(ui.frames.size, 0)
})

test('routes the header button through the native toggle and then focuses the page', async t => {
  const ui = focusHarness(t, { root: true })
  const button = new FakeElement('button', { attrs: { 'data-sidebar-right-expand': '' } })
  button.ownerDocument = ui.page.document
  // Register the button in the fake document so the capture handler can read it.
  ui.page.elements.push(button)
  await flush()
  const event = new Event('click', { cancelable: true })
  Object.defineProperties(event, {
    isTrusted: { value: true }, button: { value: 0 }, target: { value: button },
  })
  ui.page.document.dispatchEvent(event)
  assert.equal(ui.nativeCalls(), 1)
  assert.equal(event.defaultPrevented, true)
  ui.runFrame()
  assert.equal(ui.page.document.activeElement, ui.page.root)
})

test('leaves the builtin click alone when the controller has no toggle', async t => {
  const ui = focusHarness(t, { toggle: false })
  const button = new FakeElement('button', { attrs: { 'data-sidebar-right-expand': '' } })
  button.ownerDocument = ui.page.document
  ui.page.elements.push(button)
  await flush()
  const event = new Event('click', { cancelable: true })
  Object.defineProperties(event, {
    isTrusted: { value: true }, button: { value: 0 }, target: { value: button },
  })
  ui.page.document.dispatchEvent(event)
  assert.equal(event.defaultPrevented, false)
  assert.equal(ui.page.document.activeElement, ui.page.document.body)
})

test('unload cancels a pending page focus', async t => {
  const ui = focusHarness(t, { root: true })
  await flush()
  ui.session.open()
  ui.open()
  assert.equal(ui.frames.size, 1)
  ui.disposeAll()
  assert.equal(ui.frames.size, 0)
  ui.runFrame()
  assert.equal(ui.page.document.activeElement, ui.page.document.body)
})
