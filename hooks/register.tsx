import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, SessionMeasureInput, TurnUsage } from 'claude-code'

import type { Limit, Meter } from '../types'

// Change a shape tag when that value's fields change: values an older version
// stored are then read as the initial value instead.
const meter = atom({ plugin: 'usage-meter', key: 'meter' } as const, null, {
  shape: 'meter-2',
})
const isHidden = atom({ plugin: 'usage-meter', key: 'isHidden' } as const, false)
// Highest threshold already warned about, keyed per window, budget or context.
const warned = atom({ plugin: 'usage-meter', key: 'warned' } as const, {})
// The session cost last added to the daily total, so each measurement adds only the delta.
const lastCost = atom({ plugin: 'usage-meter', key: 'lastCost' } as const, null)

// Kept across sessions in $.store: estimated spend per local day.
const SPEND_KEY = 'spend-by-day'
const SPEND_DAYS_KEPT = 31

type Cfg = {
  limitWarn: number
  limitAlert: number
  contextWarn: number
  sessionBudget: number
  dailyBudget: number
  heavyTokens: number
  heavyUsd: number
}

const HEAVY_WINDOW_JUMP = 5 // percentage points of a rate-limit window in one turn

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback

function readCfg(o: PluginOptions): Cfg {
  const limitWarn = num(o.limitWarnPercent, 75)
  return {
    limitWarn,
    limitAlert: Math.max(limitWarn, num(o.limitAlertPercent, 90)),
    contextWarn: num(o.contextWarnPercent, 80),
    sessionBudget: num(o.sessionBudgetUsd, 0),
    dailyBudget: num(o.dailyBudgetUsd, 0),
    heavyTokens: num(o.heavyTurnTokens, 200_000),
    heavyUsd: num(o.heavyTurnUsd, 2),
  }
}

const steps = (...levels: number[]) => [...new Set(levels.filter(l => l > 0))].sort((a, b) => a - b)

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

const usd = (n: number) => `$${n.toFixed(2)}`

const dayOf = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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

async function readSpend($: EngineInterface): Promise<Record<string, number>> {
  const v = await $.store.get(SPEND_KEY)
  return v && typeof v === 'object' ? (v as Record<string, number>) : {}
}

async function addSpend($: EngineInterface, day: string, delta: number): Promise<number> {
  const spend = await readSpend($)
  spend[day] = (spend[day] ?? 0) + delta
  const kept = Object.keys(spend).sort().slice(-SPEND_DAYS_KEPT)
  const trimmed = Object.fromEntries(kept.map(k => [k, spend[k] ?? 0]))
  await $.store.set(SPEND_KEY, trimmed)
  return trimmed[day] ?? 0
}

async function warnOnce(
  $: EngineInterface,
  key: string,
  pct: number,
  levels: number[],
  message: (level: number) => string,
): Promise<void> {
  const level = [...levels].reverse().find(s => pct >= s)
  if (level === undefined) return
  const seen = (await read($, warned))[key] ?? 0
  if (level <= seen) return
  await update($, warned, w => ({ ...w, [key]: level }))
  const text = message(level)
  $.ui.toast(text, { timeoutMs: 10_000 })
  if (level >= 100) void $.ui.notify(text)
}

async function record($: EngineInterface, cfg: Cfg, e: SessionMeasureInput): Promise<void> {
  const now = await $.clock.now()
  const today = dayOf(now)

  // Add this session's new spend to today's total, kept across sessions.
  let todayUsd = (await readSpend($))[today] ?? 0
  if (e.cost) {
    const before = await read($, lastCost)
    const delta = before === null ? 0 : e.cost.usd - before
    await update($, lastCost, () => e.cost?.usd ?? 0)
    if (delta > 0) todayUsd = await addSpend($, today, delta)
  }

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
    todayUsd,
    lastTurnTokens: m?.lastTurnTokens ?? 0,
    sessionTokens: m?.sessionTokens ?? 0,
    agentTokens: m?.agentTokens ?? 0,
    turns: m?.turns ?? 0,
  }))

  const limitLevels = steps(cfg.limitWarn, cfg.limitAlert, 100)
  for (const l of limits) {
    const reset = untilReset(l.resetsAt, now)
    const tail = `${label(l.kind)} window at ${l.percentUsed}%${reset ? `, resets in ${reset}` : ''}`
    await warnOnce($, `limit:${l.kind}:${l.resetsAt ?? ''}`, l.percentUsed, limitLevels, level =>
      level >= 100 ? `Usage limit reached: ${tail}` : `Approaching usage limit: ${tail}`,
    )
  }

  const budgetLevels = steps(cfg.limitWarn, cfg.limitAlert, 100)
  if (cfg.sessionBudget > 0 && e.cost) {
    const spent = e.cost.usd
    await warnOnce($, 'budget:session', (spent / cfg.sessionBudget) * 100, budgetLevels, level =>
      `${level >= 100 ? 'Session budget reached' : 'Approaching session budget'}: ~${usd(spent)} of ${usd(cfg.sessionBudget)} (estimate)`,
    )
  }
  if (cfg.dailyBudget > 0) {
    await warnOnce($, `budget:day:${today}`, (todayUsd / cfg.dailyBudget) * 100, budgetLevels, level =>
      `${level >= 100 ? 'Daily budget reached' : 'Approaching daily budget'}: ~${usd(todayUsd)} of ${usd(cfg.dailyBudget)} today (estimate)`,
    )
  }

  if (e.context.percent !== undefined) {
    const pct = e.context.percent
    await warnOnce($, `context:${e.context.window}`, pct, steps(cfg.contextWarn, Math.max(cfg.contextWarn, 90)), () =>
      `Context window ${pct}% full; consider /compact`,
    )
  }
}

export const register: Register = (on, options) => {
  const cfg = readCfg(options)
  // Module-local: reset on reload, which only means one missed jump comparison.
  let limitsAtTurnStart: Record<string, number> = {}
  let costAtTurnStart = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-meter',
      description: 'Show token usage, limits and spend in detail; "/usage-meter toggle" hides or shows the line',
    })
    const u = await $.session.usage()
    // Spend before this point (a resumed session's earlier runs) is not added to today.
    await update($, lastCost, () => u.cost?.usd ?? 0)
    await record($, cfg, { context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: ['context'] })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await record($, cfg, e)
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
    const turnTokens = e.usage ? tokensOf(e.usage) : 0

    if (e.agentId) {
      // A subagent's turn: count its tokens, but leave "last turn" to the main thread.
      if (turnTokens > 0) {
        await update($, meter, m => (m ? { ...m, agentTokens: m.agentTokens + turnTokens } : m))
      }
      return result
    }

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
    if (cfg.heavyTokens > 0 && turnTokens >= cfg.heavyTokens) heavy.push(`${short(turnTokens)} tokens`)
    for (const l of u.rateLimits) {
      const before = limitsAtTurnStart[l.kind]
      if (before !== undefined && l.percentUsed - before >= HEAVY_WINDOW_JUMP) {
        heavy.push(`${label(l.kind)} +${(l.percentUsed - before).toFixed(1)} pts`)
      }
    }
    const turnUsd = (u.cost?.usd ?? 0) - costAtTurnStart
    if (cfg.heavyUsd > 0 && turnUsd >= cfg.heavyUsd) heavy.push(`~${usd(turnUsd)} est.`)
    if (heavy.length > 0) {
      $.ui.toast(`Heavy usage last turn: ${heavy.join(', ')}`, { timeoutMs: 10_000 })
    }

    return result
  })

  on('command.run', { command: 'usage-meter' }, async ($, e) => {
    if (e.args.trim() === 'toggle') {
      const hidden = await update($, isHidden, h => !h)
      return { text: hidden ? 'Usage line hidden.' : 'Usage line shown.' }
    }
    const u = await $.session.usage()
    const m = await read($, meter)
    const now = await $.clock.now()
    const spend = await readSpend($)
    const week = Object.keys(spend)
      .sort()
      .slice(-7)
      .map(day => `${day} ~${usd(spend[day] ?? 0)}`)
    const lines = [
      u.context.percent === undefined
        ? `Context: not measured yet (fills in after the first reply; window ${short(u.context.window)} tokens)`
        : `Context: ${u.context.percent}% (${short(u.context.tokens ?? 0)} / ${short(u.context.window)} tokens)`,
      ...(u.rateLimits.length === 0
        ? ['Rate limits: none reported (API key or cloud provider billing, or no reading yet)']
        : u.rateLimits.map(l => {
            const r = untilReset(l.resetsAt, now)
            return `Limit ${label(l.kind)}: ${l.percentUsed}% used${r ? `, resets in ${r}` : ''}`
          })),
      `Tokens: main thread ${short(m?.sessionTokens ?? 0)} over ${m?.turns ?? 0} turns (last ${short(m?.lastTurnTokens ?? 0)}), subagents ${short(m?.agentTokens ?? 0)}`,
      u.cost
        ? `Session cost: ~${usd(u.cost.usd)}${cfg.sessionBudget > 0 ? ` of ${usd(cfg.sessionBudget)} budget` : ''}`
        : 'Session cost: not tracked',
      `Today: ~${usd(spend[dayOf(now)] ?? 0)}${cfg.dailyBudget > 0 ? ` of ${usd(cfg.dailyBudget)} budget` : ''}`,
      ...(week.length > 1 ? [`Last ${week.length} days: ${week.join(' · ')}`] : []),
      'Costs are Claude Code\'s local estimates at list price, not a bill.',
    ]
    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null || (await read($, isHidden))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const total = m.sessionTokens + m.agentTokens
    // Without subscription limits (API key, cloud provider), spend is the number to watch.
    const showToday = m.limits.length === 0 || cfg.dailyBudget > 0

    return (
      <Box>
        <Text dimColor>ctx </Text>
        {/* Absent until the first reply of a fresh or just-compacted window. */}
        {m.contextPercent === undefined ? (
          <Text dimColor>–</Text>
        ) : (
          <Text color={tone(m.contextPercent, 70, 85)}>{m.contextPercent}%</Text>
        )}
        {m.limits.map(l => {
          const r = untilReset(l.resetsAt, now)
          return (
            <Text>
              <Text dimColor> · {label(l.kind)} </Text>
              <Text color={tone(l.percentUsed, cfg.limitWarn, cfg.limitAlert)}>{l.percentUsed}%</Text>
              {r ? <Text dimColor> ({r})</Text> : null}
            </Text>
          )
        })}
        <Text dimColor>
          {' · '}last {short(m.lastTurnTokens)} · session {short(total)} tok
        </Text>
        {m.costUsd !== undefined ? (
          <Text>
            <Text dimColor> · </Text>
            <Text
              color={
                cfg.sessionBudget > 0
                  ? tone((m.costUsd / cfg.sessionBudget) * 100, cfg.limitWarn, cfg.limitAlert)
                  : undefined
              }
              dimColor={cfg.sessionBudget <= 0}
            >
              ~{usd(m.costUsd)}
              {cfg.sessionBudget > 0 ? `/${usd(cfg.sessionBudget)}` : ''}
            </Text>
          </Text>
        ) : null}
        {showToday ? (
          <Text>
            <Text dimColor> · today </Text>
            <Text
              color={
                cfg.dailyBudget > 0
                  ? tone((m.todayUsd / cfg.dailyBudget) * 100, cfg.limitWarn, cfg.limitAlert)
                  : undefined
              }
              dimColor={cfg.dailyBudget <= 0}
            >
              ~{usd(m.todayUsd)}
              {cfg.dailyBudget > 0 ? `/${usd(cfg.dailyBudget)}` : ''}
            </Text>
          </Text>
        ) : null}
        <Text dimColor> est</Text>
      </Box>
    )
  })
}
