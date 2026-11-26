# How it works

## The line

A single line sits above your Claude Code prompt and updates as you work:

```
ctx 42% · 5h 31% (2h14m) · 7d 79% (2d) · last 84k · session 1.2M tok · ~$3.10 est
```

| Part | Meaning |
|---|---|
| `ctx 42%` | How full the context window is |
| `5h 31% (2h14m)` | Your 5-hour usage window, and the time until it resets |
| `7d 79% (2d)` | Your weekly usage window, and the time until it resets |
| `last 84k` | Tokens used by the last turn |
| `session 1.2M tok` | Tokens used in this session so far |
| `~$3.10 est` | Claude Code's own cost estimate (not a bill; on a subscription you are not charged this) |

Numbers turn **yellow**, then **red** as they climb: limits at 75% and 90%, context at 70% and 85%.

## Warnings

You get a short pop-up (toast) when:

- **You're nearing a limit:** at 75% and 90% of the 5-hour or weekly window. At 100% you also get a desktop notification. Each level warns once per window, so it never nags.
- **Context is filling up:** at 80% and 90%, with a nudge to run `/compact`.
- **A turn was heavy:** it used 200k+ tokens, pushed a limit window up 5+ points, or cost an estimated $2+.

## Commands

| Command | What it does |
|---|---|
| `/usage-meter` | Prints a detailed breakdown: context, each limit window with reset time, tokens and cost |
| `/usage-meter toggle` | Hides or shows the line |

## Under the hood

Claude Code already tracks your usage for its own `/cost` command and status line. This mod reads those same figures and shows them where you can see them.

1. **Claude Code pushes the figures.** After each turn, and whenever a limit window moves by a whole point, Claude Code raises a `session.measure` event with the context fill, the rate-limit windows from the last API response, and the cost estimate. The mod doesn't poll or make requests of its own.
2. **The mod checks thresholds.** It compares each figure with its warning levels and remembers the highest level it has already warned about for each window, so every warning fires once. A new window (after a reset) starts fresh.
3. **Each turn is tallied.** When a turn completes, the mod adds up that turn's tokens (input, output, cache reads and cache writes) and compares the limit windows and cost with where they were when you sent the prompt. A big jump counts as heavy usage.
4. **The line is redrawn.** The values are kept in Claude Code's session state, so the line redraws only when a number changes.

The code is about 200 lines of TypeScript in [`hooks/register.tsx`](../hooks/register.tsx). The warning levels are constants at the top of that file.

## No additional cost or tokens

- The mod **makes no model calls**. It never asks Claude anything, so it adds **zero tokens** to your usage and **nothing** to your bill or limits.
- Reading the usage figures is free: they come from Claude Code's own local bookkeeping, the same numbers `/cost` shows.
- **Nothing leaves your machine.** The mod has no network access and sends no telemetry.

## Notes

- The 5-hour and weekly windows appear only on a Claude subscription (Pro or Max), after the first response of a session reports them. With API-key billing you see context, tokens and cost.
- Token counts cover the main conversation, not subagents.
- Cache reads are included in token counts, so `last` can look large. They are cheap and weigh lightly against limits.
- The cost figure is Claude Code's local estimate at list prices, not your actual bill.

## Other ways to install

From a shell:

```
claude plugin install usage-meter --marketplace aatra-ai/claude-code-usage-meter
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `aatra-ai/claude-code-usage-meter`, then **Add plugin**.

To remove it: `/plugin uninstall usage-meter`.
