# Sidebar Focus

Opens the DeepSeek Harness right sidebar fullscreen by default and moves keyboard focus into the active page.

DSH's right Sidebar has two presentations.
**Split** (`push`) gives the panel a column and pushes the conversation aside;
**fullscreen** covers the workspace while the wide-screen columns stay underneath.
Every fresh panel starts in split view, so opening a file,
terminal or browser always costs the conversation half the window.
This plugin records fullscreen as the default, so every open lands fullscreen.

| Moment | Before | With this plugin |
| --- | --- | --- |
| First open of a session | split view | fullscreen |
| Reopen after closing | split view | fullscreen |
| Panel's fullscreen control while open | switches to split | unchanged, switches to split |
| Collapse and reopen | split view | fullscreen again |
| Reload with the panel still open | whatever was saved | unchanged while open; fullscreen from the next open |
| Window narrower than 768 px | fullscreen (built in) | fullscreen |

## Requirements

- DeepSeek Harness 0.2.2-rc.3 or newer (the version whose right Sidebar saves a per-session presentation).
  Desktop and Web both work.

## Install

Run `pnpm install --frozen-lockfile` in a fresh checkout to install dependencies and build the plugin.
Then select this directory in **Plugins** > **Add plugin**, or install it with `install_bundle`.
The plugin appears in **Plugins** as **Sidebar Focus** / **侧栏聚焦**.

## Use

Open the Sidebar as usual — a file link, a tool row's line reference, **Files**,
**Browser**, **Terminal**, or the header's expand button.
The panel covers the workspace instead of sharing it.

While the panel is open, its fullscreen control (and `pane.fullscreen.toggle`) still switches
to the split view, and zooming/resizing behaves as before.
The choice lasts until the panel closes; the next open is fullscreen again.

Every opening moves keyboard focus into the panel: the header's expand button, the toggle shortcut,
a file link, a tool row, **Files**, **Browser**, **Terminal**, or a sidebar entry.
After the open commits, the plugin focuses the active dock pane and then the active page's own focus stop —
an embedded frame, an editor, a large content root, or the page's scroll viewer.
Focusing only the pane is not enough for a document preview, whose viewer never claims focus,
or for a page that mounts its content after the open.
A scroll viewer without a tabindex receives `tabindex="-1"` so it can take focus.

The focus attempt stops when the page takes focus, when the panel closes or changes session,
on the next pointer or key press, on window blur, or after 800 ms.
A page that already owns focus is never overridden.

## Limitations

- No public seam exists for choosing the Sidebar's presentation: `ctx.sidebarRight` navigates (open, close, split,
  float) but exposes no presentation setter, and the per-session surface store belongs to the panel seat.
  The plugin therefore reads and drives two runtime internals rather than a published API —
  the controller's adopted-store map `ctx.sidebarRight.adopted` and the store's declared `setMode('fullscreen')` action,
  the same change the panel control makes, so history, persistence and undo treat it like a user switch.
  A future DSH release that renames or reshapes those internals disables the plugin safely:
  the Sidebar behaves exactly as shipped, and one console warning names the missing piece.
- An open panel is never changed, including one restored by a reload: the plugin only records fullscreen
  while the column is collapsed.
- The presentation is saved per session in `localStorage` (`dsh.sidebar-right.v1.<sessionId>`).
  Pins recorded while the plugin was enabled stay in that saved layout,
  so after disabling the plugin each session opens fullscreen until you switch it back once with the panel control,
  close it, and let DSH save the split choice.
- Below 768 px the Sidebar is fullscreen on its own; the plugin changes nothing visible there.
- Floating panels are untouched: they have no fullscreen presentation.
- Focus falls back to the dock pane when the active page exposes no clear content stop.
  DSH publishes no page-focus API, so a page layout that moves or renames these markers falls back to pane focus.
  The `tabindex="-1"` and `data-dsh-sidebar-fullscreen-focus` marker added to a focused scroll viewer are removed
  on unload.

## Unload

Disable the bundle in **Plugins**.
The plugin restores the controller's store map, removes its click and focus listeners,
cancels any pending focus retry, and removes the tabindex markers it added.
Layouts already saved as fullscreen retain that setting.

## Tests

`node --test` runs the guard against a fake controller, fake stores, and a fake page: pinning a collapsed surface,
opening without a second change, respecting a switch back while open, re-pinning after close,
adopting an already-open panel, replacing a store, failing safe without the internal map or action,
focusing a content root on a plain open, focusing a scroll viewer and restoring its tabindex on unload,
preferring an editor or embedded frame, falling back to the pane, keeping page-owned focus,
cancelling on pointer/key/close, ignoring a background session, routing the header button through the native toggle,
and restoring everything on unload.
