/**
 * Browser half of `dsh-sidebar-fullscreen`.
 *
 * DSH's right Sidebar (`ui-sidebar-right`) draws one panel per session in one of
 * two presentations: `push` — the panel takes a column and the conversation
 * makes room — or `fullscreen`, which covers the workspace while the wide-screen
 * columns stay underneath. Every fresh surface records `push`; the user switches
 * with the panel's fullscreen control or `pane.fullscreen.toggle`.
 *
 * This module makes `fullscreen` the recorded default, so every open lands
 * fullscreen. It never touches a panel that is already open: the mode is pinned
 * while the column is collapsed, and the user's own choice while it is open
 * stands until they close it. Because the mode is already recorded when the open
 * commits, the panel renders fullscreen from the first frame — there is no
 * correction after the open.
 *
 * Harness exposes navigation on `ctx.sidebarRight` (open, close, split, float)
 * but no presentation setter, and the per-session surface store belongs to the
 * panel seat. This module therefore reads and drives two of the controller's
 * runtime internals — not a public API, verified against 0.2.2-rc.5:
 *
 * - `ctx.sidebarRight.adopted` — the Map of each session's adopted surface store
 *   (`{ store, unsubscribe }`), which the controller itself reads for every
 *   navigation command. Patching the instance's `set`/`delete` observes each
 *   store exactly when the runtime mints it.
 * - `store.actions.setMode(sessionId, 'fullscreen')` — the store's own declared
 *   action, the same one the panel control runs. The change is recorded in the
 *   layout history and persisted like a user's own switch.
 *
 * Every access is fail-safe: a shape this release no longer exposes leaves the
 * sidebar exactly as DSH shipped it, and warns once so an upgrade break is
 * visible in the console. The patch is removed on unload.
 *
 * A commit from the store is the owner's; a follow-up action inside that
 * notification would be an action inside an action, so the pin waits for a
 * microtask, which still runs before the next paint.
 *
 * Focus follows every opening, not just the shortcut: the guard watches the
 * store's `expanded` transition from false to true, which covers the header
 * button, the toggle shortcut, a file link, a tool row, and a sidebar entry.
 * After the commit it focuses the active dock pane and then the active page's
 * own content stop (an embedded frame, an editor, a large content root, or the
 * page's scroll container). Focusing only the pane is not enough for a
 * document preview, whose viewer never claims focus, and for pages that load
 * after the open. The retry stops when the page has taken focus, when the panel
 * closes or changes session, on the next pointer or key press, on window blur,
 * or after a short deadline.
 *
 * The header button only updates the store in DSH; this module routes its click
 * through the controller's native toggle so DSH's own expand-and-focus path is
 * used too. The page-content stop is still this module's addition.
 */

window.__ModuleLoader__.load({
  id: 'dsh-sidebar-fullscreen',
  factory() {
    const NS = 'dsh-sidebar-fullscreen'
    const FULLSCREEN = 'fullscreen'
    /** How long an opening may take to produce a focusable page. */
    const FOCUS_WINDOW_MS = 800

    /** One session's surface out of a store snapshot, or `undefined`. */
    const surfaceOf = (store, sessionId) => {
      if (typeof store?.getSnapshot !== 'function') return undefined
      const state = store.getSnapshot()
      if (state === null || typeof state !== 'object') return undefined
      const bySession = state.bySession
      if (bySession === null || typeof bySession !== 'object') return undefined
      return bySession[sessionId]
    }

    return {
      inject: ['sidebarRight'],
      apply(ctx) {
        const warned = new Set()
        const warnOnce = (key, message) => {
          if (warned.has(key)) return
          warned.add(key)
          console.warn(`${NS}: ${message}`)
        }

        const sidebar = ctx.sidebarRight
        const adopted = sidebar === null || typeof sidebar !== 'object' ? undefined : sidebar.adopted
        if (!(adopted instanceof Map)) {
          warnOnce('adopted', 'ctx.sidebarRight.adopted is not a Map; the Sidebar presentation is unchanged')
          return
        }

        /** sessionId → teardown of the guard installed on that session's store. */
        const guards = new Map()
        /** Scroll containers that received a tabindex only for this plugin's focus. */
        const addedTabIndex = new Set()
        /** Pending page-focus retry, if opening is still settling. */
        let focusFrame
        let focusDeadline = 0
        let focusSessionId
        let focusOrigin

        const layoutFor = sessionId => surfaceOf(adopted.get(sessionId)?.store, sessionId)?.layout

        const isShown = element => {
          if (element === null || element === undefined || element.isConnected === false) return false
          if (element.closest?.('[hidden], [aria-hidden="true"], [inert]') !== null) return false
          if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false
          const view = element.ownerDocument?.defaultView
          if (view !== null && view !== undefined && typeof view.getComputedStyle === 'function') {
            const style = view.getComputedStyle(element)
            if (style.visibility === 'hidden' || style.display === 'none') return false
          }
          return true
        }

        const areaOf = element => {
          const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : undefined
          if (rect === undefined) return 0
          return Math.max(0, rect.width) * Math.max(0, rect.height)
        }

        /** The visible on-screen panel of one Session. */
        const panelOf = (document, sessionId) => [...document.querySelectorAll(
          '[data-sidebar-right-session][data-sidebar-right-open]')]
          .find(element => element.dataset?.sidebarRightSession === sessionId && isShown(element))

        /** The active dock pane under a panel, preferring the layout's active pane. */
        const paneOf = (panel, activePaneId) => {
          const panes = [...panel.querySelectorAll('[data-dockkit-pane]')]
            .filter(pane => pane.closest('[data-sidebar-right-session]') === panel
              && pane.closest('[data-dockkit-float]') === null && isShown(pane))
          return panes.find(pane => pane.dataset.dockkitPane === activePaneId)
            ?? panes.find(pane => pane.hasAttribute('data-dockkit-pane-active'))
            ?? panes[0]
        }

        /** The active tab cell, or a single-pane host that is its own content section. */
        const contentSection = pane => {
          if (pane.hasAttribute('data-dockkit-content') && isShown(pane)) return pane
          return [...pane.querySelectorAll('[data-dockkit-content]')]
            .find(section => section.closest('[data-dockkit-pane]') === pane && isShown(section)) ?? pane
        }

        const insideChrome = element => element.closest(
          '[data-dockkit-strip], [data-dockkit-tab], [data-dockkit-divider]') !== null

        const shownWithin = (section, selector) => [...section.querySelectorAll(selector)]
          .filter(element => element !== section && isShown(element) && !insideChrome(element))

        /**
         * The active page's keyboard focus stop, in priority order: an embedded
         * frame or editor, a large tabindex=-1 content root, then a large scroll
         * container. A scroll container without a tabindex receives one so the
         * viewer can take focus; `addedTabIndex` records it for unload.
         */
        const contentTarget = (section) => {
          const embedded = shownWithin(section, 'iframe, webview').find(element => areaOf(element) > 0)
          if (embedded !== undefined) return embedded
          const editor = shownWithin(section, 'textarea, [contenteditable]:not([contenteditable="false"])')
            .find(element => areaOf(element) >= 0)
          if (editor !== undefined) return editor

          const sectionArea = areaOf(section)
          const roots = shownWithin(section, '[tabindex="-1"]')
            .filter(element => !element.matches(
              'button, a, input, select, textarea, iframe, [role="tab"], [role="button"]'))
            .filter(element => areaOf(element) >= sectionArea * 0.25)
            .sort((left, right) => areaOf(right) - areaOf(left))
          if (roots[0] !== undefined) return roots[0]
          if (sectionArea <= 0) return undefined

          const scrollers = shownWithin(section, 'div, pre, section, main, article, table').slice(0, 1200)
            .filter(element => {
              const view = element.ownerDocument?.defaultView
              const style = view?.getComputedStyle?.(element)
              return style !== undefined
                && (style.overflowY === 'auto' || style.overflowY === 'scroll')
                && element.scrollHeight > element.clientHeight + 1
                && areaOf(element) >= sectionArea * 0.25
            })
            .sort((left, right) => areaOf(right) - areaOf(left))
          const scroller = scrollers[0]
          if (scroller === undefined) return undefined
          if (!scroller.hasAttribute('tabindex')) {
            scroller.setAttribute('tabindex', '-1')
            scroller.setAttribute('data-dsh-sidebar-fullscreen-focus', '')
            addedTabIndex.add(scroller)
          }
          return scroller
        }

        const cancelFocus = () => {
          if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame)
          focusFrame = undefined
          focusSessionId = undefined
          focusOrigin = undefined
        }

        const stopFocus = () => {
          cancelFocus()
        }

        /**
         * Focus the session's active page. Returns true once a page stop holds
         * focus, false while only the pane is focused or nothing is rendered yet.
         */
        const focusPage = sessionId => {
          const document = window.document
          if (document === undefined) return false
          const panel = panelOf(document, sessionId)
          if (panel === undefined) return false
          const layout = layoutFor(sessionId)
          if (layout?.expanded !== true) return false
          const pane = paneOf(panel, layout.activePaneId)
          if (pane === undefined) return false

          const active = document.activeElement
          const hasPageFocus = active !== null && active !== undefined && panel.contains(active)
            && !active.hasAttribute?.('data-dockkit-pane')
            && !active.hasAttribute?.('data-dockkit-content')
            && active.closest?.('[data-dockkit-strip]') === null
            && active.closest?.('[data-dockkit-pane]') !== null
          if (hasPageFocus) return true

          const section = contentSection(pane)
          const target = contentTarget(section) ?? pane
          if (target !== active) {
            try {
              target.focus({ preventScroll: true })
            } catch (error) {
              console.error(`${NS}: focusing the opened Sidebar page failed`, error)
              return false
            }
          }
          const focused = document.activeElement
          if (focused === null || focused === undefined || !panel.contains(focused)) return false
          // A page stop is inside the pane; the pane or its tab host alone is not.
          return focused !== pane && focused !== section
        }

        const retryFocus = now => {
          focusFrame = undefined
          if (focusSessionId === undefined) return
          const document = window.document
          if (document === undefined) return stopFocus()
          if (typeof document.hasFocus === 'function' && !document.hasFocus()) return stopFocus()
          const active = document.activeElement
          const panel = panelOf(document, focusSessionId)
          if (panel === undefined) {
            if (now >= focusDeadline) return stopFocus()
            focusFrame = window.requestAnimationFrame(retryFocus)
            return
          }
          if (active !== null && active !== undefined && active !== document.body
            && active !== document.documentElement && active !== focusOrigin && !panel.contains(active)) {
            return stopFocus()
          }
          if (document.querySelector(':modal, [aria-modal="true"]:not([hidden])')) return stopFocus()
          if (focusPage(focusSessionId)) return stopFocus()
          if (now >= focusDeadline) return stopFocus()
          focusFrame = window.requestAnimationFrame(retryFocus)
        }

        const startFocus = sessionId => {
          const document = window.document
          if (document === undefined) return
          const mounted = typeof sidebar.mounted?.getSnapshot === 'function' ? sidebar.mounted.getSnapshot() : undefined
          if (mounted !== undefined && mounted !== sessionId) return
          cancelFocus()
          focusSessionId = sessionId
          focusOrigin = document.activeElement
          const now = window.performance?.now?.() ?? Date.now()
          focusDeadline = now + FOCUS_WINDOW_MS
          focusFrame = window.requestAnimationFrame(retryFocus)
        }

        const removeGuard = sessionId => {
          const teardown = guards.get(sessionId)
          if (teardown === undefined) return
          guards.delete(sessionId)
          if (focusSessionId === sessionId) cancelFocus()
          try {
            teardown()
          } catch (error) {
            console.error(`${NS}: releasing a session guard failed`, error)
          }
        }

        /** Install one session's guard: pin fullscreen while closed, focus the page when it opens. */
        const guardStore = (sessionId, store) => {
          removeGuard(sessionId)
          if (store === null || typeof store !== 'object') return
          if (typeof store.getSnapshot !== 'function' || typeof store.subscribe !== 'function') {
            warnOnce('store', 'an adopted session store has no snapshot or subscription; that session is unchanged')
            return
          }
          const actions = store.actions
          if (actions === null || typeof actions !== 'object' || typeof actions.setMode !== 'function') {
            warnOnce('setMode', 'an adopted session store has no setMode action; that session is unchanged')
            return
          }

          const layoutOf = () => layoutFor(sessionId)

          /** Record fullscreen when this surface is collapsed and still split. */
          const pin = () => {
            const layout = layoutOf()
            if (layout === undefined || layout.mode === FULLSCREEN) return
            // An open panel is the user's own choice: never fight the exit control.
            if (layout.expanded === true) return
            try {
              actions.setMode(sessionId, FULLSCREEN)
            } catch (error) {
              console.error(`${NS}: recording the fullscreen presentation failed`, error)
            }
          }

          let queued = false
          const schedulePin = () => {
            if (queued) return
            queued = true
            queueMicrotask(() => {
              queued = false
              pin()
            })
          }

          let lastExpanded = layoutOf()?.expanded
          const onCommit = () => {
            const layout = layoutOf()
            if (layout === undefined) return
            const opened = lastExpanded === false && layout.expanded === true
            lastExpanded = layout.expanded
            if (layout.expanded !== true) {
              if (focusSessionId === sessionId) cancelFocus()
              schedulePin()
            }
            if (opened) startFocus(sessionId)
          }

          const unsubscribe = store.subscribe(onCommit)
          guards.set(sessionId, () => { unsubscribe() })
          // A store adopted for a collapsed surface has no commit to wait for.
          if (lastExpanded !== true) schedulePin()
        }

        const nativeSet = adopted.set
        const nativeDelete = adopted.delete
        const guardedSet = function set(sessionId, adoption) {
          const result = nativeSet.call(this, sessionId, adoption)
          try {
            guardStore(sessionId, adoption === null || typeof adoption !== 'object' ? undefined : adoption.store)
          } catch (error) {
            console.error(`${NS}: guarding an adopted session store failed`, error)
          }
          return result
        }
        const guardedDelete = function remove(sessionId) {
          removeGuard(sessionId)
          return nativeDelete.call(this, sessionId)
        }

        for (const [sessionId, adoption] of adopted) {
          guardStore(sessionId, adoption === null || typeof adoption !== 'object' ? undefined : adoption.store)
        }
        adopted.set = guardedSet
        adopted.delete = guardedDelete

        ctx.effect(() => {
          const document = window.document
          if (document === undefined) return
          const nativeToggle = sidebar.toggleExpanded
          if (typeof nativeToggle !== 'function' || typeof sidebar.mounted?.getSnapshot !== 'function') {
            warnOnce('focus', 'the Sidebar controller has no compatible toggle methods')
            return
          }

          const expand = event => {
            const button = event.target?.closest?.('button[data-sidebar-right-expand]')
            if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || !button || button.disabled
              || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            const sessionId = sidebar.mounted.getSnapshot()
            if (sessionId === undefined || layoutFor(sessionId)?.expanded !== false) return
            try {
              sidebar.toggleExpanded()
            } catch (error) {
              console.warn(`${NS}: opening the Sidebar through its controller failed`, error)
            }
            if (layoutFor(sessionId)?.expanded !== true) return
            event.preventDefault()
            event.stopPropagation()
          }
          const capture = { capture: true }
          document.addEventListener('click', expand, capture)
          return () => document.removeEventListener('click', expand, capture)
        }, `${NS}: expand through the controller`)

        ctx.effect(() => {
          const document = window.document
          if (document === undefined) return
          const cancel = () => cancelFocus()
          document.addEventListener('pointerdown', cancel, true)
          document.addEventListener('keydown', cancel, true)
          window.addEventListener('blur', cancel)
          return () => {
            document.removeEventListener('pointerdown', cancel, true)
            document.removeEventListener('keydown', cancel, true)
            window.removeEventListener('blur', cancel)
            cancelFocus()
          }
        }, `${NS}: cancel pending page focus`)

        ctx.effect(() => () => {
          cancelFocus()
          for (const element of addedTabIndex) {
            if (element.getAttribute('tabindex') === '-1' && element.hasAttribute('data-dsh-sidebar-fullscreen-focus')) {
              element.removeAttribute('tabindex')
              element.removeAttribute('data-dsh-sidebar-fullscreen-focus')
            }
          }
          addedTabIndex.clear()
          for (const sessionId of [...guards.keys()]) removeGuard(sessionId)
          if (adopted.set === guardedSet) adopted.set = nativeSet
          if (adopted.delete === guardedDelete) adopted.delete = nativeDelete
        }, `${NS}: session stores and page focus`)
      },
    }
  },
})
