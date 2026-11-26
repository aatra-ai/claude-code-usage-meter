import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMeasureInput, TurnUsage } from 'claude-code'

import type { Limit, Meter } from '../types'

const meter = atom({ plugin: 'usage-meter', key: 'meter' } as const, null, {
  shape: 'meter-1',
})
const isHidden = atom({ plugin: 'usage-meter', key: 'isHidden' } as const, false)
// Highest threshold already warned about, keyed per window (and its reset).
const warned = atom({ plugin: 'usage-meter', key: 'warned' } as const, {})

// Thresholds
const LIMIT_STEPS = [75, 90, 100]
const CONTEXT_STEPS = [80, 90]
const HEAVY_TURN_TOKENS = 200_000 // tokens processed in one turn
const HEAVY_WINDOW_JUMP = 5 // percentage points of a rate-limit window in one turn
const HEAVY_TURN_USD = 2

const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  seven_day_opus: '7d opus',
  seven_day_sonnet: '7d sonnet',
  spend_limit: 'spend',
}

const label = (kind: string) => LABELS[kind] ?? kind.replace(/_/g, ' ')

const tokensOf = (u: TurnUsage) =>
  u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const untilReset = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h${String(mins % 60).padStart(2, '0')}m`
  return `${Math.round(hours / 24)}d`
}

const tone = (pct: number | undefined, warn: number, danger: number) =>
  pct === undefined ? undefined : pct >= danger ? 'red' : pct >= warn ? 'yellow' : 'green'

async function warnOnce(
  $: EngineInterface,
  key: string,
  pct: number,
  steps: number[],
  message: (step: number) => string,
): Promise<void> {
  const step = [...steps].reverse().find(s => pct >= s)
  if (step === undefined) return
  const seen = (await read($, warned))[key] ?? 0
  if (step <= seen) return
  await update($, warned, w => ({ ...w, [key]: step }))
  const text = message(step)
  $.ui.toast(text, { timeoutMs: 10_000 })
  if (step >= (steps[steps.length - 1] ?? 100)) void $.ui.notify(text)
}

async function record($: EngineInterface, e: SessionMeasureInput): Promise<void> {
  const limits: Limit[] = e.rateLimits.map(r => ({
    kind: r.kind,
    percentUsed: r.percentUsed,
    resetsAt: r.resetsAt,
  }))
  await update($, meter, m => ({
    contextPercent: e.context.percent,
    contextTokens: e.context.tokens,
    contextWindow: e.context.window,
    limits,
    costUsd: e.cost?.usd,
    lastTurnTokens: m?.lastTurnTokens ?? 0,
    sessionTokens: m?.sessionTokens ?? 0,
    turns: m?.turns ?? 0,
  }))

  const now = await $.clock.now()
  for (const l of limits) {
    const reset = untilReset(l.resetsAt, now)
    await warnOnce($, `limit:${l.kind}:${l.resetsAt ?? ''}`, l.percentUsed, LIMIT_STEPS, step =>
      step >= 100
        ? `Usage limit reached: ${label(l.kind)} window at ${l.percentUsed}%${reset ? `, resets in ${reset}` : ''}`
        : `Approaching usage limit: ${label(l.kind)} window at ${l.percentUsed}%${reset ? `, resets in ${reset}` : ''}`,
    )
  }

  if (e.context.percent !== undefined) {
    await warnOnce($, `context:${e.context.window}`, e.context.percent, CONTEXT_STEPS, () =>
      `Context window ${e.context.percent}% full; consider /compact`,
    )
  }
}


export const register: Register = on => {
  // Module-local: reset on reload, which only means one missed jump comparison.
  let limitsAtTurnStart: Record<string, number> = {}
  let costAtTurnStart = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-meter',
      description: 'Show token usage and limits in detail; "/usage-meter toggle" hides or shows the band',
    })
    const u = await $.session.usage()
    await record($, { context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: ['context'] })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await record($, e)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const m = await read($, meter)
    limitsAtTurnStart = Object.fromEntries((m?.limits ?? []).map(l => [l.kind, l.percentUsed]))
    costAtTurnStart = m?.costUsd ?? 0
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result // main thread only

    const turnTokens = e.usage ? tokensOf(e.usage) : 0
    await update($, meter, m =>
      m
        ? {
            ...m,
            lastTurnTokens: turnTokens,
            sessionTokens: m.sessionTokens + turnTokens,
            turns: m.turns + 1,
          }
        : m,
    )

    // Heavy-usage checks against the latest measurement.
    const u = await $.session.usage()
    const heavy: string[] = []
    if (turnTokens >= HEAVY_TURN_TOKENS) heavy.push(`${short(turnTokens)} tokens`)
    for (const l of u.rateLimits) {
      const before = limitsAtTurnStart[l.kind]
      if (before !== undefined && l.percentUsed - before >= HEAVY_WINDOW_JUMP) {
        heavy.push(`${label(l.kind)} +${(l.percentUsed - before).toFixed(1)} pts`)
      }
    }
    const turnUsd = (u.cost?.usd ?? 0) - costAtTurnStart
    if (turnUsd >= HEAVY_TURN_USD) heavy.push(`~$${turnUsd.toFixed(2)} est.`)
    if (heavy.length > 0) {
      $.ui.toast(`Heavy usage last turn: ${heavy.join(', ')}`, { timeoutMs: 10_000 })
    }

    return result
  })

  on('command.run', { command: 'usage-meter' }, async ($, e) => {
    if (e.args.trim() === 'toggle') {
      const hidden = await update($, isHidden, h => !h)
      return { text: hidden ? 'Usage band hidden.' : 'Usage band shown.' }
    }
    const u = await $.session.usage()
    const m = await read($, meter)
    const now = await $.clock.now()
    const lines = [
      `Context: ${u.context.percent ?? '?'}% (${short(u.context.tokens ?? 0)} / ${short(u.context.window)} tokens)`,
      ...(u.rateLimits.length === 0
        ? ['Rate limits: no reading yet (or not on a subscription)']
        : u.rateLimits.map(l => {
            const r = untilReset(l.resetsAt, now)
            return `Limit ${label(l.kind)}: ${l.percentUsed}% used${r ? `, resets in ${r}` : ''}`
          })),
      `Session tokens (main thread): ${short(m?.sessionTokens ?? 0)} over ${m?.turns ?? 0} turns; last turn ${short(m?.lastTurnTokens ?? 0)}`,
      u.cost ? `Cost: ~$${u.cost.usd.toFixed(2)} (local estimate, not a bill)` : 'Cost: not tracked',
    ]
    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null || (await read($, isHidden))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    return (
      <Box>
        <Text dimColor>ctx </Text>
        <Text color={tone(m.contextPercent, 70, 85)}>{m.contextPercent ?? '?'}%</Text>
        {m.limits.map(l => {
          const r = untilReset(l.resetsAt, now)
          return (
            <Text>
              <Text dimColor> · {label(l.kind)} </Text>
              <Text color={tone(l.percentUsed, 75, 90)}>{l.percentUsed}%</Text>
              {r ? <Text dimColor> ({r})</Text> : null}
            </Text>
          )
        })}
        <Text dimColor>
          {' · '}last {short(m.lastTurnTokens)} · session {short(m.sessionTokens)} tok
          {m.costUsd !== undefined ? ` · ~$${m.costUsd.toFixed(2)} est` : ''}
        </Text>
      </Box>
    )
  })
}
