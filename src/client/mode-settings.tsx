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
import { KnobRow, KnobsPanel, knobsFeedbackKey, knobsFeedbackTone, useKnobSave } from '@miorin/dsh-plugin-knobs-ui'
import { useId } from 'react'
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

type ModeSettingProps = InjectFace<ModeSettingsInjected> & PropsLocale<typeof ENTRY_ID> & {
  readonly view?: 'summary' | 'page'
}

function ModeSetting({ useSidebarSettings, saveMode, t, view }: ModeSettingProps) {
  const { status, value, writable } = useSidebarSettings(state => state)
  const save = useKnobSave(saveMode)
  const id = useId()
  if (view === 'summary') return null

  const mode = value?.mode ?? DEFAULT_MODE
  const activeMode = save.pending ?? mode
  const canChoose = status === 'ready' && writable
  const busy = save.pending !== undefined || status === 'loading'
  const feedback = knobsFeedbackKey({ status, writable, saving: save.pending !== undefined, failed: save.failed })

  function choose(next: string): void {
    if (!canChoose || !isOpeningMode(next) || next === mode) return
    void save.commit(next)
  }

  return (
    <KnobsPanel
      scope={PACKAGE_NAME}
      heading={t('sectionTitle')}
      className="dsh-aggressive-sidebar-settings"
      data-dsh-aggressive-sidebar-settings=""
    >
      <KnobRow
        aria-busy={busy || undefined}
        wrap="wide"
        icon={activeMode === 'left-sidebar'
          ? <IconPanelLeftOutlineMedium size={16} />
          : <IconFullscreenOutlineMedium size={16} />}
        title={t('mode')}
        indicator={busy && <StateDot state="ongoing" size={12} />}
        description={t(activeMode === 'left-sidebar' ? 'leftSidebarHint' : 'fullscreenHint')}
        feedback={feedback === undefined ? undefined : { id: `${id}-status`, text: t(feedback), tone: knobsFeedbackTone(feedback) }}
        control={
          <SegmentedControl
            id={id}
            value={activeMode}
            label={t('mode')}
            disabled={!canChoose}
            options={[
              { value: 'left-sidebar', label: t('leftSidebar'), title: t('leftSidebarHint') },
              { value: 'fullscreen', label: t('fullscreen'), title: t('fullscreenHint') },
            ]}
            onChange={choose}
          />
        }
      />
    </KnobsPanel>
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
