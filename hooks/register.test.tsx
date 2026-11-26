import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-meter',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

const measure = (pct: number) => ({
  context: { window: 200_000, tokens: 50_000, percent: 25 },
  rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2099-01-01T00:00:00Z' }],
  cost: { usd: 1.5 },
  changed: ['rateLimits' as const],
})

test('warns once per threshold and draws the band', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' as const } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: Date.parse('2098-12-31T22:00:00Z') }))

  await $.session.measure(measure(50))
  expect(toasts.length).toBe(0)
  await $.session.measure(measure(78))
  await $.session.measure(measure(80))
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/Approaching usage limit: 5h window at 78%/)
  await $.session.measure(measure(91))
  expect(toasts.length).toBe(2)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /91%/ }))?.text).toBe(' · 5h 91% (2h00m)')
  await ui.unmount()
})
