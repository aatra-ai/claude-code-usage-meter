import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

const NOW = Date.parse('2098-12-31T12:00:00Z')

type Limits = { kind: string; percentUsed: number; resetsAt?: string }[]

const measure = (opts: { limits?: Limits; usd?: number; ctx?: number }) => ({
  context: { window: 200_000, tokens: 50_000, percent: opts.ctx ?? 25 },
  rateLimits: opts.limits ?? [],
  cost: { usd: opts.usd ?? 0 },
  changed: ['cost' as const],
})

const fiveHour = (pct: number): Limits => [
  { kind: 'five_hour', percentUsed: pct, resetsAt: '2098-12-31T14:00:00Z' },
]

// Stands in for the engine: toasts, notifications, the clock and a store.
function engine(on: On) {
  const toasts: string[] = []
  const store = new Map<string, unknown>()
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' as const } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: NOW }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  return { toasts, store }
}

test('subscription: warns once per limit level and draws the line', async ($, on) => {
  const { toasts } = engine(on)

  await $.session.measure(measure({ limits: fiveHour(50) }))
  expect(toasts.length).toBe(0)
  await $.session.measure(measure({ limits: fiveHour(78) }))
  await $.session.measure(measure({ limits: fiveHour(80) }))
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/Approaching usage limit: 5h window at 78%, resets in 2h00m/)
  await $.session.measure(measure({ limits: fiveHour(91) }))
  expect(toasts.length).toBe(2)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /5h 91%/ }))?.text).toBe(' · 5h 91% (2h00m)')
  // With subscription limits and no daily budget, "today" stays off the line.
  expect(await ui.find({ type: 'Text', text: /today/ })).toBeUndefined()
  await ui.unmount()
})

test('API key: no limits, so the line shows today\'s spend', async ($, on) => {
  engine(on)
  await $.session.measure(measure({ usd: 0 }))
  await $.session.measure(measure({ usd: 1.25 }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /today/ }))?.text).toBe(' · today ~$1.25')
    await ui.unmount()
  }
})

test('API key: session and daily budgets warn at their levels', { options: { sessionBudgetUsd: 2, dailyBudgetUsd: 4 } }, async ($, on) => {
  const { toasts, store } = engine(on)
  // Earlier sessions today already spent $2.50.
  store.set('spend-by-day', { '2098-12-31': 2.5 })

  await $.session.measure(measure({ usd: 0 }))
  await $.session.measure(measure({ usd: 1 })) // session 50%, day 3.50 = 87.5%
  expect(toasts).toEqual(['Approaching daily budget: ~$3.50 of $4.00 today (estimate)'])

  await $.session.measure(measure({ usd: 1.6 })) // session 80%, day 4.10 = 102%
  expect(toasts.slice(1).sort()).toEqual([
    'Approaching session budget: ~$1.60 of $2.00 (estimate)',
    'Daily budget reached: ~$4.10 of $4.00 today (estimate)',
  ])
  expect(((store.get('spend-by-day') as Record<string, number>)['2098-12-31'] ?? 0).toFixed(2)).toBe('4.10')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /\/\$2\.00/ }))?.text).toBe(' · ~$1.60/$2.00')
  await ui.unmount()
})

test('custom warning levels replace the defaults', { options: { limitWarnPercent: 50, limitAlertPercent: 60 } }, async ($, on) => {
  const { toasts } = engine(on)
  await $.session.measure(measure({ limits: fiveHour(55) }))
  expect(toasts.length).toBe(1)
  await $.session.measure(measure({ limits: fiveHour(61) }))
  expect(toasts.length).toBe(2)
  await $.session.measure(measure({ limits: fiveHour(70) }))
  expect(toasts.length).toBe(2)
})
