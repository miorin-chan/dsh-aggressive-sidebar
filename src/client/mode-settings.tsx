import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  IconFullscreenOutlineMedium,
  IconPanelLeftOutlineMedium,
  SegmentedControl,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useId, useState } from 'react'
import { DEFAULT_MODE, ENTRY_ID, isOpeningMode, PACKAGE_NAME } from '../lib/opening-mode.js'
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
.dsh-aggressive-sidebar-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  container-type: inline-size;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-aggregate-member] .dsh-as-head {
  display: none;
}
.dsh-as-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.dsh-as-heading {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dsh-as-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dsh-as-row {
  display: flex;
  align-items: center;
  gap: 10px 12px;
  min-width: 0;
  padding: 12px 0;
}
.dsh-as-row:first-child {
  padding-top: 4px;
}
.dsh-as-row:last-child {
  padding-bottom: 4px;
}
.dsh-as-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  align-self: flex-start;
  margin-top: 2px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-as-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.dsh-as-title-line {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.dsh-as-title {
  font-size: 13.5px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dsh-as-desc {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  overflow-wrap: anywhere;
}
.dsh-as-control {
  display: inline-flex;
  flex: none;
  align-items: center;
  max-width: 100%;
  margin-inline-start: 4px;
}
.dsh-as-segmented {
  max-width: 100%;
}
.dsh-as-status {
  margin: 4px 0 0;
  padding: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}
.dsh-as-status[role='alert'] {
  color: var(--dsw-alias-state-error-primary);
}
@container (max-width: 520px) {
  .dsh-as-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .dsh-as-copy {
    flex: 1 1 calc(100% - 32px);
  }
  .dsh-as-control {
    width: 100%;
    box-sizing: border-box;
    margin-inline-start: 0;
    padding-inline-start: 32px;
  }
}
`

type ModeSettingProps = InjectFace<ModeSettingsInjected> & PropsLocale<typeof ENTRY_ID> & {
  readonly view?: 'summary' | 'page'
}

function ModeSetting({ useSidebarSettings, saveMode, t, view }: ModeSettingProps) {
  const { status, value, writable } = useSidebarSettings(state => state)
  const [pending, setPending] = useState<OpeningMode>()
  const [failed, setFailed] = useState(false)
  const id = useId()
  if (view === 'summary') return null

  const mode = value?.mode ?? DEFAULT_MODE
  const activeMode = pending ?? mode
  const canChoose = status === 'ready' && writable
  const busy = pending !== undefined || status === 'loading'
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

  return (
    <div className="dsh-aggressive-sidebar-settings" data-dsh-aggressive-sidebar-settings="">
      <style>{SETTINGS_CSS}</style>
      <div className="dsh-as-head">
        <h4 className="dsh-as-heading">{t('sectionTitle')}</h4>
      </div>
      <div className="dsh-as-list">
        <div className="dsh-as-row" aria-busy={busy || undefined}>
          <span className="dsh-as-icon" aria-hidden="true">
            {activeMode === 'left-sidebar'
              ? <IconPanelLeftOutlineMedium size={16} />
              : <IconFullscreenOutlineMedium size={16} />}
          </span>
          <div className="dsh-as-copy">
            <div className="dsh-as-title-line">
              <span className="dsh-as-title">{t('mode')}</span>
              {busy && <StateDot state="ongoing" size={12} />}
            </div>
            <p className="dsh-as-desc">
              {t(activeMode === 'left-sidebar' ? 'leftSidebarHint' : 'fullscreenHint')}
            </p>
          </div>
          <div className="dsh-as-control" aria-describedby={feedback === undefined ? undefined : `${id}-status`}>
            <SegmentedControl
              id={id}
              value={activeMode}
              label={t('mode')}
              disabled={!canChoose}
              className="dsh-as-segmented"
              options={[
                { value: 'left-sidebar', label: t('leftSidebar'), title: t('leftSidebarHint') },
                { value: 'fullscreen', label: t('fullscreen'), title: t('fullscreenHint') },
              ]}
              onChange={next => { void choose(next) }}
            />
          </div>
        </div>
        {feedback !== undefined && (
          <p id={`${id}-status`} className="dsh-as-status" role={failed ? 'alert' : 'status'}>
            {feedback}
          </p>
        )}
      </div>
    </div>
  )
}

// AppFrame.tsx and AppFrame.module.css (dsh-client-ui-layout 0.2.2-rc.5).
// Let the panels use the positioned grid instead of the right track as their
// containing block. The grid also accounts for Windows' sidebar clearance,
// so the fullscreen panel needs no separate width cap.
const FRAME = ':has(> [data-rightbar-col]):has(> * > [data-slot="sidebar"]):not([data-sidebar-drawer])'
const COLUMN = '> [data-rightbar-col]'
const PANEL = `${COLUMN} [data-sidebar-right-panel='fullscreen']`
const OPEN_FRAME = `${FRAME}:has(${COLUMN} [data-sidebar-right-session]:not([hidden]) [data-sidebar-right-panel='fullscreen'][data-sidebar-right-open])`
// The native fullscreen layout suppresses easing. The sidebar remains visible
// here, so let the frame's own animation move the shared edge.
const ANIMATING_FRAME = `${OPEN_FRAME}[data-rightbar-fullscreen][data-animating]:not([data-dragging], [data-rightbar-instant])`
const FRAME_TIMING = 'var(--ds-transition-duration-slow) var(--ds-ease-in-out)'
const MACOS = "html[data-platform='darwin']"
const FIRST_DOCK = "[data-dockkit-host='dock'][data-dockkit-column='0']"
const WIDE_CSS = `
  @media (min-width: 768px) {
    ${FRAME} ${COLUMN} { position: static; }
    ${FRAME} ${COLUMN} [data-sidebar-right-panel] { grid-area: 1 / 1 / 2 / -1; }
    ${FRAME} ${PANEL} {
      grid-column: 2 / -1;
      left: 0;
      width: auto !important;
      max-width: none;
    }
    ${OPEN_FRAME} > :has(> * > [data-slot='main']) { interactivity: inert; }
    ${OPEN_FRAME} > [data-side='sidebar'] {
      grid-column: 2 / -1;
      left: 0 !important;
      z-index: 41;
    }
    ${MACOS} ${OPEN_FRAME}[data-sidebar-collapsed] > [data-shell-leading] { z-index: 41; }
    ${MACOS} ${FRAME} ${PANEL} ${FIRST_DOCK} {
      --dsh-dockkit-strip-inline-start: var(--dsh-frame-leading-clearance, 10px);
    }
    @media (prefers-reduced-motion: no-preference) {
      ${ANIMATING_FRAME} { transition: grid-template-columns ${FRAME_TIMING}; }
      /* AppFrame starts drags from the target track width. */
      ${ANIMATING_FRAME} > [data-side='sidebar'] { pointer-events: none; }
      ${MACOS} ${ANIMATING_FRAME} ${PANEL} ${FIRST_DOCK} [data-dockkit-strip] {
        transition: padding-inline-start ${FRAME_TIMING};
      }
    }
  }
`

function SidebarWidth({ useSidebarSettings }: InjectFace<Pick<ModeSettingsInjected, 'hooks'>>) {
  const wide = useSidebarSettings(state => state.status === 'ready' && (state.value?.mode ?? DEFAULT_MODE) === 'left-sidebar')
  return wide ? <style>{WIDE_CSS}</style> : null
}

export function registerModeSettings(ctx: Context): void {
  const form = ctx.configForms.get<SidebarSettings>(ENTRY_ID)
  const hooks = { sidebarSettings: form }
  const settings: ModeSettingsInjected = { hooks, saveMode: mode => form.set('mode', mode) }
  ctx.effect(() => ctx.locale.register(ENTRY_ID, LABELS))
  ctx.slots.inject(CONFIG_SLOT, () => ctx.slots.register({
    name: CONFIG_SLOT, key: PACKAGE_NAME, locale: ENTRY_ID, inject: () => settings,
  }, ModeSetting))
  ctx.slots.inject(LAYOUT_SLOT, () => ctx.slots.register({
    name: LAYOUT_SLOT, id: ENTRY_ID, inject: () => ({ hooks }),
  }, SidebarWidth))
}
