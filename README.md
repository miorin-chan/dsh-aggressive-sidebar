# Larger sidebar

Expand the DeepSeek Harness right sidebar and move keyboard focus into the active page.

In **Plugins → Larger sidebar → Opening mode**, choose how it opens:

- **Fullscreen** covers the workspace.
  This is the default.
- **Expand to the left sidebar** covers the conversation area up to the left sidebar.
  The left sidebar stays usable.

DSH saves this preference in the active profile.
Below 768 px, the right sidebar uses its built-in fullscreen layout.

## Requirements

- DeepSeek Harness 0.2.2-rc.5 or newer.
  Desktop and Web both work.

## Install

Run `pnpm install --frozen-lockfile` in a fresh checkout to install dependencies and build the plugin.
Then select this directory in **Plugins** > **Add plugin**, or install it with `install_bundle`.
The plugin appears in **Plugins** as **Larger sidebar** / **更大侧边栏**.

## Use

Open the right sidebar from a file link, a tool row's line reference, **Files**,
**Browser**, **Terminal**, or the header's expand button.
While the panel is open, its presentation button or `pane.fullscreen.toggle` switches to split view.
Closing and reopening the sidebar applies the mode saved on the plugin's detail page.

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
- The plugin records the native fullscreen presentation while the column is collapsed.
  The opening mode sets the width of that presentation, including when a fullscreen panel is restored on reload.
  The width follows the visible left sidebar, including the icon rail in Web.
- The presentation is saved per session in `localStorage` (`dsh.sidebar-right.v1.<sessionId>`).
  Pins recorded while the plugin was enabled stay in that saved layout,
  so after disabling the plugin each session opens fullscreen until you switch it back once with the panel control,
  close it, and let DSH save the split choice.
- Floating panels are untouched: they have no fullscreen presentation.
- Focus falls back to the dock pane when the active page exposes no clear content stop.
  DSH publishes no page-focus API, so a page layout that moves or renames these markers falls back to pane focus.
  The `tabindex="-1"` and `data-dsh-sidebar-fullscreen-focus` marker added to a focused scroll viewer are removed
  on unload.

## Unload

Disable the bundle in **Plugins**.
The plugin removes its settings control and layout stylesheet, restores the controller's store map,
removes its click and focus listeners, cancels pending focus, and removes the tabindex markers it added.
Layouts already saved as fullscreen retain that setting.

## Tests

`node --test` runs the guard against a fake controller, fake stores, and a fake page: pinning a collapsed surface,
opening without a second change, respecting a switch back while open, re-pinning after close,
adopting an already-open panel, replacing a store, failing safe without the internal map or action,
focusing a content root on a plain open, focusing a scroll viewer and restoring its tabindex on unload,
preferring an editor or embedded frame, falling back to the pane, keeping page-owned focus,
cancelling on pointer/key/close, ignoring a background session, routing the header button through the native toggle,
and restoring everything on unload.
