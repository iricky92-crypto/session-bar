import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { StepStatus } from '../types'

const ORANGE = '#D97757'
const TRACK = '#D97757'

const steps = atom({ plugin: 'session-bar', key: 'steps' } as const, null)

/** "C:\Users\me\Claude\Projects\my-app\src" -> "Projects / my-app / src". */
export function location(cwd: string): string {
  if (/scratch-workspaces/i.test(cwd)) {
    return 'No folder'
  }

  const home = cwd.match(/^([A-Za-z]:[\\/]Users[\\/][^\\/]+|\/(?:home|Users)\/[^/]+)/)
  const rest = home ? cwd.slice(home[0].length) : cwd
  const parts = rest.split(/[\\/]+/).filter(Boolean)

  if (parts.length === 0) {
    return home ? '~' : cwd
  }

  const shown = parts.slice(-3).join(' / ')

  return parts.length > 3 ? `… / ${shown}` : shown
}

/** The command that shows a folder in the system's file manager. */
export function openFolderArgv(cwd: string): string[] {
  if (/^[A-Za-z]:[\\/]/.test(cwd)) {
    return ['C:\\Windows\\explorer.exe', cwd.replace(/\//g, '\\')]
  }

  return [cwd.startsWith('/Users/') ? 'open' : 'xdg-open', cwd]
}

/** Inside `dir`: the item to select so the file manager opens `dir` itself. */
export function revealTarget(dir: string, names: { name: string; kind: string }[]): string {
  const first = [...names].sort(
    (a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name),
  )[0]

  if (!first) {
    return dir
  }

  const sep = dir.includes('\\') ? '\\' : '/'

  return dir.replace(/[\\/]+$/, '') + sep + first.name
}

/**
 * Opens the session's folder through the desktop app's own reveal (a process
 * the mod starts has no window to show on Windows), else the system command.
 */
async function openFolder($: EngineInterface, cwd: string): Promise<void> {
  try {
    const entries = await $.fs.list(cwd).catch(() => [])
    const result = await $.mcp.call('ccd_host', 'reveal_path', { path: revealTarget(cwd, entries) })

    if (!result.isError) {
      return
    }

    const why = result.content.map(c => ('text' in c ? String(c.text) : '')).join(' ')
    $.ui.toast(`The app wouldn't reveal the folder: ${why.slice(0, 200)}`)
  } catch (err) {
    $.ui.toast(`App reveal unavailable (${String(err).slice(0, 120)}); trying Explorer`)
    await $.process.run(openFolderArgv(cwd)).catch(() => undefined)
  }
}

/** Applies one update_plan / TodoWrite call to the step list. */
export function applyPlan(
  current: StepStatus[] | null,
  args: Record<string, unknown>,
): StepStatus[] | null {
  const items = (args.items ?? args.todos) as { status?: string }[] | undefined

  if (Array.isArray(items)) {
    return items.map(i =>
      i.status === 'completed' || i.status === 'in_progress' ? i.status : 'pending',
    )
  }

  if (current === null) {
    return null
  }

  const next = [...current]

  if (args.advance === true) {
    const at = next.indexOf('in_progress')

    if (at >= 0) {
      next[at] = 'completed'
    }

    const pending = next.indexOf('pending', at >= 0 ? at : 0)

    if (pending >= 0) {
      next[pending] = 'in_progress'
    }
  }

  for (const n of (args.done as number[] | undefined) ?? []) {
    if (n >= 1 && n <= next.length) {
      next[n - 1] = 'completed'
    }
  }

  const start = args.start as number | undefined

  if (typeof start === 'number' && start >= 1 && start <= next.length) {
    for (let i = 0; i < next.length; i++) {
      if (next[i] === 'in_progress') {
        next[i] = 'pending'
      }
    }

    next[start - 1] = 'in_progress'
  }

  return next
}

/** Share of the plan done; a running step counts half. */
export function fraction(list: StepStatus[]): number {
  if (list.length === 0) {
    return 0
  }

  const score = list.reduce(
    (sum, s) => sum + (s === 'completed' ? 1 : s === 'in_progress' ? 0.5 : 0),
    0,
  )

  return Math.min(1, score / list.length)
}

/** The bar: a faint track, the filled share, and a light sweeping across it. */
export function barSvg(share: number | null): string {
  const w = 480
  const hgt = 4
  const filled = share === null ? w : Math.max(6, Math.round(w * share))
  const fillOpacity = share === null ? 0.35 : 1

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">
<defs>
<linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
<stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
<stop offset="0.5" stop-color="#ffffff" stop-opacity="0.75"/>
<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<clipPath id="c"><rect x="0" y="0" width="${filled}" height="${hgt}" rx="2"/></clipPath>
</defs>
<rect x="0" y="0" width="${w}" height="${hgt}" rx="2" fill="${TRACK}" fill-opacity="0.15"/>
<rect x="0" y="0" width="${filled}" height="${hgt}" rx="2" fill="${ORANGE}" fill-opacity="${fillOpacity}"/>
<g clip-path="url(#c)">
<rect x="-160" y="0" width="160" height="${hgt}" fill="url(#g)">
<animate attributeName="x" from="-160" to="${w}" dur="1.6s" repeatCount="indefinite"/>
</rect>
</g>
</svg>`
}

/** Terminal fallback: ▰▰▰▱▱▱ */
function barText(share: number | null, cells: number): string {
  if (share === null) {
    return '▰'.repeat(cells)
  }

  const on = Math.round(cells * share)

  return '▰'.repeat(on) + '▱'.repeat(cells - on)
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    try {
      await update($, steps, () => null)
    } catch {
      // The bar is cosmetic: never hold up a prompt.
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    try {
      if (e.agentId === undefined) {
        const args = e as unknown as Record<string, unknown>

        if (e.tool === 'mcp__ccd_turn__update_plan' || e.tool === 'TodoWrite') {
          await update($, steps, s => applyPlan(s, args))
        } else if (e.tool === 'mcp__ccd_turn__wrap_up') {
          await update($, steps, s => (s === null ? s : s.map(() => 'completed' as const)))
        }
      }
    } catch {
      // The bar is cosmetic: never hold up a tool call.
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const cwd = await $.session.cwd()
    const where = location(cwd)
    const list = await read($, steps)
    const working = e.props.isWorking
    const share = list && list.length > 0 ? fraction(list) : null
    const done = list ? list.filter(s => s === 'completed').length : 0
    const label =
      list && list.length > 0 ? `${done}/${list.length}` : working ? 'working' : ''

    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined

    return (
      <Box flexDirection="column" gap={0}>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text color={ORANGE} bold>
            ✻
          </Text>
          <Button
            key="open-folder"
            label={where}
            onPress={() => {
              void openFolder($, cwd)
            }}
          />
          {working && label !== '' ? (
            <Text color={ORANGE} tabular>
              {label}
            </Text>
          ) : null}
        </Box>
        {working
          ? Svg
            ? (
                <Svg
                  source={barSvg(share)}
                  alt={share === null ? 'Turn in progress' : `Turn ${Math.round(share * 100)}% through its plan`}
                  width={480}
                  height={4}
                  isInteractive
                />
              )
            : (
                <Text color={ORANGE}>{barText(share, Math.max(10, Math.min(40, e.props.bodyColumns - 4)))}</Text>
              )
          : null}
      </Box>
    )
  })
}
