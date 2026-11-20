# dsh-sidebar-fullscreen

Makes DeepSeek Harness's right Sidebar open fullscreen by default.

DSH's right Sidebar has two presentations. **Split** (`push`) gives the panel a column and pushes the conversation aside; **fullscreen** covers the workspace while the wide-screen columns stay underneath. Every fresh panel starts in split view, so opening a file, terminal or browser always costs the conversation half the window. This plugin records fullscreen as the default, so every open lands fullscreen.

| Moment | Before | With this plugin |
| --- | --- | --- |
| First open of a session | split view | fullscreen |
| Reopen after closing | split view | fullscreen |
| Panel's fullscreen control while open | switches to split | unchanged, switches to split |
| Collapse and reopen | split view | fullscreen again |
| Reload with the panel still open | whatever was saved | unchanged while open; fullscreen from the next open |
| Window narrower than 768 px | fullscreen (built in) | fullscreen |

## Requirements

- DeepSeek Harness 0.2.2-rc.3 or newer (the version whose right Sidebar saves a per-session presentation). Desktop and Web both work.

## Install

Install this directory as a local bundle: **Plugins** > **Add plugin**, or let the agent run `install_bundle` on this directory. The plugin appears in **Plugins** as **Sidebar opens fullscreen** / **侧栏默认全屏**.

## Use

Open the Sidebar as usual — a file link, a tool row's line reference, **Files**, **Browser**, **Terminal**, or the header's expand button. The panel covers the workspace instead of sharing it.

While the panel is open, its fullscreen control (and `pane.fullscreen.toggle`) still switches to the split view, and zooming/resizing behaves as before. The choice lasts until the panel closes; the next open is fullscreen again.

Clicking the conversation header's expand button or pressing the sidebar toggle shortcut uses DSH's native expand-and-focus path. If the first focus attempt misses the dock, the plugin retries for up to 500 ms after opening. Changing sessions, collapsing the sidebar, or moving focus to another control stops the retry.

## Limitations

- No public seam exists for choosing the Sidebar's presentation: `ctx.sidebarRight` navigates (open, close, split, float) but exposes no presentation setter, and the per-session surface store belongs to the panel seat. The plugin therefore reads and drives two runtime internals rather than a published API — the controller's adopted-store map `ctx.sidebarRight.adopted` and the store's declared `setMode('fullscreen')` action, the same change the panel control makes, so history, persistence and undo treat it like a user switch. A future DSH release that renames or reshapes those internals disables the plugin safely: the Sidebar behaves exactly as shipped, and one console warning names the missing piece.
- An open panel is never changed, including one restored by a reload: the plugin only records fullscreen while the column is collapsed.
- The presentation is saved per session in `localStorage` (`dsh.sidebar-right.v1.<sessionId>`). Pins recorded while the plugin was enabled stay in that saved layout, so after disabling the plugin each session opens fullscreen until you switch it back once with the panel control, close it, and let DSH save the split choice.
- Below 768 px the Sidebar is fullscreen on its own; the plugin changes nothing visible there.
- Floating panels are untouched: they have no fullscreen presentation.

## Unload

Disable the bundle in **Plugins**. The plugin restores the controller's store map and toggle method, removes its listeners, and cancels any pending focus retry. Layouts already saved as fullscreen retain that setting.

## Tests

`node --test` runs the guard against a fake controller and fake stores: pinning a collapsed surface, opening without a second change, respecting a switch back while open, re-pinning after close, adopting an already-open panel, replacing a store, failing safe without the internal map or action, and restoring everything on unload.
