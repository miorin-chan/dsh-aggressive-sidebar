export const ENTRY_ID = 'dsh-sidebar-fullscreen'
export const PACKAGE_NAME = '@miorin/dsh-sidebar-fullscreen'

export const OPENING_MODES = ['fullscreen', 'left-sidebar'] as const
export type OpeningMode = typeof OPENING_MODES[number]
export const DEFAULT_MODE: OpeningMode = 'fullscreen'

export interface SidebarSettings {
  readonly mode: OpeningMode
}

export function isOpeningMode(value: unknown): value is OpeningMode {
  return OPENING_MODES.some(mode => mode === value)
}
