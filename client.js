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
 * runtime internals — not a public API, verified against 0.2.2-rc.3:
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
 * The built-in header button only updates the store. Route its click through
 * the same controller method as the toggle shortcut. If the native focus
 * attempt misses, retry briefly while the same dock is open and input still
 * belongs to the original element or the document body.
 */

window.__ModuleLoader__.load({
  id: 'dsh-sidebar-fullscreen',
  factory() {
    const NS = 'dsh-sidebar-fullscreen'
    const FULLSCREEN = 'fullscreen'

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

        const removeGuard = sessionId => {
          const teardown = guards.get(sessionId)
          if (teardown === undefined) return
          guards.delete(sessionId)
          try {
            teardown()
          } catch (error) {
            console.error(`${NS}: releasing a session guard failed`, error)
          }
        }

        /** Install one session's guard: record fullscreen whenever the column is collapsed. */
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

          const layoutOf = () => {
            const layout = surfaceOf(store, sessionId)?.layout
            return layout !== null && typeof layout === 'object' ? layout : undefined
          }

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
          const schedule = () => {
            if (queued) return
            queued = true
            queueMicrotask(() => {
              queued = false
              pin()
            })
          }

          const unsubscribe = store.subscribe(schedule)
          guards.set(sessionId, () => { unsubscribe() })
          // A store adopted for a collapsed surface has no commit to wait for.
          if (layoutOf()?.expanded !== true) schedule()
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
          if (typeof nativeToggle !== 'function' || typeof sidebar.focusedTarget !== 'function'
            || typeof sidebar.mounted?.getSnapshot !== 'function') {
            warnOnce('focus', 'the Sidebar controller has no compatible focus methods')
            return
          }

          let frame
          const cancelFocus = () => {
            if (frame === undefined) return
            window.cancelAnimationFrame(frame)
            frame = undefined
          }
          const mounted = () => sidebar.mounted.getSnapshot()
          const layoutOf = sessionId => surfaceOf(adopted.get(sessionId)?.store, sessionId)?.layout
          const hasDockFocus = sessionId => {
            const target = sidebar.focusedTarget()
            return target?.sessionId === sessionId && target.host === 'dock'
          }

          const toggleWithFocus = function toggleExpanded() {
            cancelFocus()
            const sessionId = mounted()
            const layout = sessionId === undefined ? undefined : layoutOf(sessionId)
            const before = document.activeElement
            const result = nativeToggle.call(this)
            if (layout?.expanded !== false || mounted() !== sessionId
              || layoutOf(sessionId)?.expanded !== true || hasDockFocus(sessionId)) return result

            const store = adopted.get(sessionId)?.store
            const deadline = window.performance.now() + 500
            const retry = now => {
              frame = undefined
              const current = layoutOf(sessionId)
              const focused = document.activeElement
              if (now > deadline || mounted() !== sessionId || adopted.get(sessionId)?.store !== store
                || current?.expanded !== true || !document.hasFocus() || hasDockFocus(sessionId)
                || (focused !== before && focused !== document.body)
                || document.querySelector(':modal, [aria-modal="true"]:not([hidden])')) return

              const panel = [...document.querySelectorAll('[data-sidebar-right-session][data-sidebar-right-open]')]
                .find(element => element.dataset.sidebarRightSession === sessionId
                  && !element.closest('[hidden], [aria-hidden="true"], [inert]'))
              const panes = [...(panel?.querySelectorAll('[data-dockkit-pane]') ?? [])]
                .filter(pane => pane.closest('[data-sidebar-right-session]') === panel
                  && !pane.closest('[hidden], [aria-hidden="true"], [inert], [data-dockkit-float]'))
              const pane = panes.find(element => element.dataset.dockkitPane === current.activePaneId) ?? panes[0]
              pane?.focus({ preventScroll: true })
              if (!hasDockFocus(sessionId)) frame = window.requestAnimationFrame(retry)
            }
            frame = window.requestAnimationFrame(retry)
            return result
          }

          const previous = Object.getOwnPropertyDescriptor(sidebar, 'toggleExpanded')
          try {
            Object.defineProperty(sidebar, 'toggleExpanded', {
              configurable: previous?.configurable ?? true,
              enumerable: previous?.enumerable ?? false,
              writable: previous?.writable ?? true,
              value: toggleWithFocus,
            })
          } catch {
            warnOnce('focus', 'the Sidebar toggle cannot be wrapped')
            return
          }

          const expand = event => {
            const button = event.target?.closest?.('button[data-sidebar-right-expand]')
            if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || !button || button.disabled
              || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            const sessionId = mounted()
            if (sessionId === undefined || layoutOf(sessionId)?.expanded !== false) return
            try {
              sidebar.toggleExpanded()
            } catch (error) {
              console.warn(`${NS}: opening the Sidebar through its controller failed`, error)
            }
            if (layoutOf(sessionId)?.expanded !== true) return
            event.preventDefault()
            event.stopPropagation()
          }
          const capture = { capture: true }
          document.addEventListener('click', expand, capture)
          document.addEventListener('pointerdown', cancelFocus, capture)
          window.addEventListener('blur', cancelFocus)
          return () => {
            cancelFocus()
            document.removeEventListener('click', expand, capture)
            document.removeEventListener('pointerdown', cancelFocus, capture)
            window.removeEventListener('blur', cancelFocus)
            if (sidebar.toggleExpanded !== toggleWithFocus) return
            if (previous === undefined) delete sidebar.toggleExpanded
            else Object.defineProperty(sidebar, 'toggleExpanded', previous)
          }
        }, `${NS}: expand with focus`)

        ctx.effect(() => () => {
          for (const sessionId of [...guards.keys()]) removeGuard(sessionId)
          if (adopted.set === guardedSet) adopted.set = nativeSet
          if (adopted.delete === guardedDelete) adopted.delete = nativeDelete
        }, `${NS}: session stores`)
      },
    }
  },
})
