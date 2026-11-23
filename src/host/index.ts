import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
// Bundled from @deepseek-ai/schemastery 3.19.0, src/index.ts (object, union, const).
import z from '@deepseek-ai/schemastery'
import { DEFAULT_MODE, OPENING_MODES } from '../lib/opening-mode.js'

export const Config = z.object({
  mode: z.union(OPENING_MODES.map(mode => z.const(mode))).default(DEFAULT_MODE).volatile(),
})

export function apply(ctx: Context): void {
  ctx.inject(['settings'], (scope) => {
    scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber))
  })
}
