export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Meter = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
  costUsd?: number
  todayUsd: number
  lastTurnTokens: number
  sessionTokens: number
  agentTokens: number
  turns: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      meter: Shaped<Meter | null>
      isHidden: boolean
      warned: Record<string, number>
      lastCost: number | null
    }
  }
}
