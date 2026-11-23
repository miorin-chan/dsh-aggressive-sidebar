import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useId, useState } from 'react'
import { DEFAULT_MODE, ENTRY_ID, isOpeningMode, OPENING_MODES, PACKAGE_NAME } from '../lib/opening-mode.js'
import type { OpeningMode, SidebarSettings } from '../lib/opening-mode.js'
import { LABELS, type LabelKey } from './labels.js'

const CONFIG_SLOT = 'plugins.bundle.config'
const LAYOUT_SLOT = 'shell.overlay'

interface ModeSettingsInjected {
  readonly hooks: { readonly sidebarSettings: ConfigForm<SidebarSettings> }
  readonly saveMode: (mode: OpeningMode) => Promise<boolean>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [ENTRY_ID]: LabelKey
  }
}

const SETTINGS_CSS = `
  .dsh-larger-sidebar-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 16px;
    color: var(--dsw-alias-label-primary);
  }
  .dsh-larger-sidebar-mode select {
    max-inline-size: 100%;
    min-block-size: 32px;
    padding-inline: 8px;
    border: 1px solid var(--dsw-alias-border-l3);
    border-radius: var(--dsw-radius-sm);
    background: var(--dsw-alias-bg-layer-1);
    color: inherit;
    font: inherit;
  }
  .dsh-larger-sidebar-mode select:focus-visible {
    outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
    outline-offset: 2px;
  }
  .dsh-larger-sidebar-status {
    margin: 6px 0 0;
    color: var(--dsw-alias-label-secondary);
  }
  .dsh-larger-sidebar-status[role='alert'] { color: var(--dsw-alias-state-error-primary); }
`

const MODE_LABEL = { fullscreen: 'fullscreen', 'left-sidebar': 'leftSidebar' } as const

type ModeSettingProps = InjectFace<ModeSettingsInjected> & PropsLocale<typeof ENTRY_ID> & PluginConfigViewProps

function ModeSetting({ useSidebarSettings, saveMode, t }: ModeSettingProps) {
  const { status, value, writable } = useSidebarSettings(state => state)
  const [pending, setPending] = useState<OpeningMode>()
  const [failed, setFailed] = useState(false)
  const id = useId()
  const mode = value?.mode ?? DEFAULT_MODE
  const canChoose = status === 'ready' && writable
  const feedback = pending !== undefined ? t('saving')
    : failed ? t('saveFailed')
    : status === 'loading' ? t('loading')
    : status === 'unavailable' ? t('unavailable')
    : !writable ? t('readOnly')
    : undefined

  async function choose(next: string): Promise<void> {
    if (!canChoose || pending !== undefined || !isOpeningMode(next) || next === mode) return
    setPending(next)
    setFailed(false)
    try {
      setFailed(!await saveMode(next))
    } catch {
      setFailed(true)
    } finally {
      setPending(undefined)
    }
  }

  return <>
    <style>{SETTINGS_CSS}</style>
    <div className="dsh-larger-sidebar-mode" aria-busy={pending !== undefined || undefined}>
      <label htmlFor={id}>{t('mode')}</label>
      <select id={id} name="dsh-sidebar-opening-mode" value={pending ?? mode} disabled={!canChoose}
        aria-disabled={pending !== undefined || undefined}
        aria-describedby={feedback === undefined ? undefined : `${id}-status`}
        onChange={event => { void choose(event.currentTarget.value) }}>
        {OPENING_MODES.map(option => <option key={option} value={option}>{t(MODE_LABEL[option])}</option>)}
      </select>
    </div>
    {feedback !== undefined && <p id={`${id}-status`} className="dsh-larger-sidebar-status" role={failed ? 'alert' : 'status'}>
      {feedback}
    </p>}
  </>
}

// AppFrame.tsx and AppFrame.module.css (dsh-client-ui-layout 0.2.2-rc.5).
// Let the panels use the positioned grid instead of the right track as their
// containing block. Both keep the same right edge and the first row's height.
const FRAME = ':has(> [data-rightbar-col]):has(> * > [data-slot="sidebar"]):not([data-sidebar-drawer])'
const COLUMN = '> [data-rightbar-col]'
const PANEL = `${COLUMN} [data-sidebar-right-panel='fullscreen']`
const OPEN_FRAME = `${FRAME}:has(${COLUMN} [data-sidebar-right-session]:not([hidden]) [data-sidebar-right-panel='fullscreen'][data-sidebar-right-open])`
const WIDE_CSS = `
  @media (min-width: 768px) {
    ${FRAME} ${COLUMN} { position: static; }
    ${FRAME} ${COLUMN} [data-sidebar-right-panel] { grid-area: 1 / 1 / 2 / -1; }
    ${FRAME} ${PANEL} {
      grid-column: 2 / -1;
      left: 0;
      width: auto !important;
    }
    ${OPEN_FRAME} > :has(> * > [data-slot='main']) { interactivity: inert; }
    ${OPEN_FRAME} > [data-side='sidebar'],
    html[data-platform='darwin'] ${OPEN_FRAME}[data-sidebar-collapsed] > [data-shell-leading] { z-index: 41; }
    html[data-platform='darwin'] ${FRAME} ${PANEL} [data-dockkit-host='dock'][data-dockkit-column='0'] {
      --dsh-dockkit-strip-inline-start: var(--dsh-frame-leading-clearance, 10px);
    }
  }
`

function SidebarWidth({ useSidebarSettings }: InjectFace<Pick<ModeSettingsInjected, 'hooks'>>) {
  const wide = useSidebarSettings(state => state.status === 'ready' && state.value?.mode === 'left-sidebar')
  return wide ? <style>{WIDE_CSS}</style> : null
}

export function registerModeSettings(ctx: Context): void {
  const form = ctx.configForms.get<SidebarSettings>(ENTRY_ID)
  const hooks = { sidebarSettings: form }
  ctx.effect(() => ctx.locale.register(ENTRY_ID, LABELS))
  ctx.slots.inject(CONFIG_SLOT, () => ctx.slots.register({
    name: CONFIG_SLOT, key: PACKAGE_NAME, locale: ENTRY_ID,
    inject: (): ModeSettingsInjected => ({ hooks, saveMode: mode => form.set('mode', mode) }),
  }, ModeSetting))
  ctx.slots.inject(LAYOUT_SLOT, () => ctx.slots.register({
    name: LAYOUT_SLOT, id: ENTRY_ID, inject: () => ({ hooks }),
  }, SidebarWidth))
}
