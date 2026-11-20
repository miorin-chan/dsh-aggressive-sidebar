import assert from 'node:assert/strict'
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

assert.equal(registration.id, 'dsh-sidebar-fullscreen')
const plugin = registration.factory()

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
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }
  return { ctx, adopted, disposeAll() { for (const dispose of disposers.reverse()) dispose() } }
}

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
  assert.match(warnings[0], /dsh-sidebar-fullscreen/)
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

function focusHarness(t, { compatible = true, readOnly = false, nativeFocus = false, nativeNoOp = false } = {}) {
  const session = surfaceStore('s1')
  const { ctx, disposeAll } = harness({ adopted: new Map([['s1', { store: session.store }]]) })
  const sidebar = ctx.sidebarRight
  let sessionId = 's1'
  let paneVisible = false
  let nativeCalls = 0
  let focusCalls = 0
  const document = Object.assign(new EventTarget(), {
    body: {}, activeElement: {}, hasFocus: () => true, querySelector: () => null,
    querySelectorAll: () => paneVisible ? [panel] : [],
  })
  const panel = {
    dataset: { sidebarRightSession: 's1' }, closest: () => null, querySelectorAll: () => [pane],
  }
  const pane = {
    dataset: { dockkitPane: 'pane' },
    closest: selector => selector === '[data-sidebar-right-session]' ? panel : null,
    focus(options) {
      assert.deepEqual(options, { preventScroll: true })
      focusCalls += 1
      document.activeElement = pane
    },
  }
  const frames = new Map()
  let time = 0
  let frameId = 0
  Object.assign(window, {
    document, performance: { now: () => time }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId },
    cancelAnimationFrame(id) { frames.delete(id) },
  })
  sidebar.mounted.getSnapshot = () => sessionId
  if (compatible) sidebar.focusedTarget = () => document.activeElement === pane ? { sessionId: 's1', host: 'dock' } : undefined
  const nativeToggle = function () {
    assert.equal(this, sidebar)
    nativeCalls += 1
    if (nativeNoOp) return
    if (session.layout().expanded) session.close()
    else {
      session.open()
      if (nativeFocus) document.activeElement = pane
    }
  }
  if (readOnly) Object.defineProperty(sidebar, 'toggleExpanded', { value: nativeToggle })
  else Object.setPrototypeOf(sidebar, { toggleExpanded: nativeToggle })

  plugin.apply(ctx)
  t.after(() => {
    disposeAll()
    delete window.document
  })
  return {
    sidebar, session, document, nativeToggle, disposeAll, frames,
    nativeCalls: () => nativeCalls, focusCalls: () => focusCalls,
    showPane: () => { paneVisible = true },
    switchSession: () => { sessionId = 's2' },
    frame(ms = 16) {
      time += ms
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) callback(time)
    },
    click({ isTrusted = true, matches = true } = {}) {
      const event = Object.assign(new Event('click', { cancelable: true }), { button: 0 })
      Object.defineProperties(event, {
        isTrusted: { value: isTrusted }, target: { value: { closest: () => matches ? { disabled: false } : null } },
      })
      document.dispatchEvent(event)
      return event.defaultPrevented
    },
  }
}

test('routes the header button through the native toggle and retries when its pane appears', async t => {
  const ui = focusHarness(t)
  await flush()
  assert.equal(ui.click({ matches: false }), false)
  assert.equal(ui.click({ isTrusted: false }), false)
  assert.equal(ui.click(), true)
  assert.equal(ui.nativeCalls(), 1)
  assert.deepEqual(ui.session.layout(), { expanded: true, mode: 'fullscreen' })
  ui.frame()
  assert.equal(ui.focusCalls(), 0)
  ui.showPane()
  ui.frame()
  assert.equal(ui.focusCalls(), 1)
  assert.equal(ui.frames.size, 0)
  assert.equal(ui.click(), false, 'a stale expand button does not collapse the dock')
})

test('retries the keyboard toggle, and gives up when no compatible pane appears', async t => {
  const ui = focusHarness(t)
  await flush()
  ui.sidebar.toggleExpanded()
  ui.showPane()
  ui.frame()
  assert.equal(ui.focusCalls(), 1)
  ui.sidebar.toggleExpanded()
  assert.equal(ui.frames.size, 0)
  ui.document.activeElement = ui.document.body
  ui.sidebar.toggleExpanded()
  ui.frame(501)
  assert.equal(ui.focusCalls(), 1)
  assert.equal(ui.frames.size, 0)
})

test('keeps native focus when it already landed inside the dock', t => {
  const ui = focusHarness(t, { nativeFocus: true })
  ui.sidebar.toggleExpanded()
  assert.equal(ui.nativeCalls(), 1)
  assert.equal(ui.frames.size, 0)
})

test('only follows the explicit toggle and preserves subsequent focus and session changes', t => {
  const ui = focusHarness(t)
  ui.showPane()
  ui.session.open()
  assert.equal(ui.frames.size, 0)
  ui.session.close()
  ui.sidebar.toggleExpanded()
  ui.document.activeElement = {}
  ui.frame()
  assert.equal(ui.focusCalls(), 0)
  ui.sidebar.toggleExpanded()
  ui.sidebar.toggleExpanded()
  ui.switchSession()
  ui.frame()
  assert.equal(ui.frames.size, 0)
  assert.equal(ui.focusCalls(), 0)
})

test('leaves the builtin click and toggle alone when the focus integration is incompatible', async t => {
  for (const options of [{ compatible: false }, { readOnly: true }]) {
    await t.test(JSON.stringify(options), subtest => {
      const ui = focusHarness(subtest, options)
      assert.equal(ui.sidebar.toggleExpanded, ui.nativeToggle)
      assert.equal(ui.click(), false)
      ui.sidebar.toggleExpanded()
      assert.equal(ui.nativeCalls(), 1)
      assert.equal(ui.frames.size, 0)
    })
  }
})

test('lets the original click continue if the controller does not open the dock', t => {
  const ui = focusHarness(t, { nativeNoOp: true })
  assert.equal(ui.click(), false)
  assert.equal(ui.nativeCalls(), 1)
  assert.equal(ui.frames.size, 0)
})

test('a new pointer action cancels a pending focus retry', t => {
  const ui = focusHarness(t)
  ui.sidebar.toggleExpanded()
  assert.equal(ui.frames.size, 1)
  ui.document.dispatchEvent(new Event('pointerdown'))
  assert.equal(ui.frames.size, 0)
})

test('unload removes the click handler, cancels retries and restores the inherited toggle', t => {
  const ui = focusHarness(t)
  ui.sidebar.toggleExpanded()
  assert.equal(ui.frames.size, 1)
  ui.disposeAll()
  ui.session.close()
  assert.equal(Object.hasOwn(ui.sidebar, 'toggleExpanded'), false)
  assert.equal(ui.sidebar.toggleExpanded, ui.nativeToggle)
  assert.equal(ui.click(), false)
  assert.equal(ui.frames.size, 0)
})
