import { expect, test } from 'claude-code/testing'

import { applyPlan, fraction, location, openFolderArgv } from '../hooks/register'

const BAND = (isWorking: boolean) =>
  ({
    plugin: 'session-bar',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking,
      maxRows: 10,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 9 },
    },
  }) as const

test('location shows the last three folders under home', () => {
  expect(location('C:\\Users\\me\\Claude\\Projects\\app')).toBe('Claude / Projects / app')
  expect(location('C:\\Users\\me\\OneDrive\\Personal\\Documents\\Work\\Reports')).toBe(
    '… / Documents / Work / Reports',
  )
  expect(location('C:\\Users\\me\\AppData\\Local\\x\\scratch-workspaces\\a\\b')).toBe('No folder')
  expect(location('/home/me/code/app')).toBe('code / app')
})

test('plan updates move the progress share', () => {
  let s = applyPlan(null, { items: [{ status: 'in_progress' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }] })
  expect(fraction(s!)).toBe(0.125)
  s = applyPlan(s, { advance: true })
  expect(s).toEqual(['completed', 'in_progress', 'pending', 'pending'])
  s = applyPlan(s, { done: [2], start: 4 })
  expect(s).toEqual(['completed', 'completed', 'pending', 'in_progress'])
})

test('mid-turn the band shows the folder, the plan count and an animated bar', async ($, on) => {
  on('session.cwd', () => ({ value: 'C:\\Users\\me\\Claude\\Projects\\app' }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    items: [
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'pending' },
    ],
  })

  const ui = await $.ui.mount({ ...BAND(true), surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'open-folder' }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^1\/3$/ }))?.text).toBe('1/3')
  const bar = await ui.find({ type: 'Svg' })
  expect(bar?.type ?? 'missing svg').toBe('Svg')
  await ui.unmount()

  const term = await $.ui.mount({ ...BAND(true), surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /▰/ }))?.text ?? 'missing bar').toMatch(/^▰+▱+$/)
  await term.unmount()
})

test('idle, the band shows only the folder', async ($, on) => {
  on('session.cwd', () => ({ value: 'C:\\Users\\me\\Claude\\Projects\\app' }))

  const revealed: unknown[] = []
  on('fs.list', () => ({
    value: [
      { name: 'notes.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false },
      { name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    ],
  }))
  on('mcp.call', (_, e) => {
    revealed.push([e.server, e.tool, e.args])
    return { value: { content: [], isError: false } }
  })

  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  await ui.press({ key: 'open-folder' })
  expect(revealed).toEqual([
    ['ccd_host', 'reveal_path', { path: 'C:\\Users\\me\\Claude\\Projects\\app\\src' }],
  ])
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  await ui.unmount()
})

test('without the app reveal, it falls back to Explorer', async ($, on) => {
  on('session.cwd', () => ({ value: 'C:\\Users\\me\\x' }))
  on('fs.list', () => ({ value: [] }))
  on('mcp.call', () => {
    throw new Error('no such server')
  })
  const ran: string[][] = []
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 1, stdout: '', stderr: '' } }
  })

  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  await ui.press({ key: 'open-folder' })
  expect(ran).toEqual([['C:\\Windows\\explorer.exe', 'C:\\Users\\me\\x']])
  await ui.unmount()
})

test('the folder command fits the system', () => {
  expect(openFolderArgv('C:/Users/me/x')).toEqual(['C:\\Windows\\explorer.exe','C:\\Users\\me\\x'])
  expect(openFolderArgv('/home/me/x')).toEqual(['xdg-open', '/home/me/x'])
})
