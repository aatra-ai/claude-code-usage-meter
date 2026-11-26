<h1 align="center">Claude Code Usage Meter</h1>

<p align="center"><b>See your Claude Code token usage and limits live, and get warned before you hit them.</b><br>
A tiny mod for Claude Code. No extra tokens, no extra cost, nothing sent anywhere.</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-0.1.0-green.svg" alt="Version 0.1.0"></a>
  <a href="https://aatra.ai"><img src="https://img.shields.io/badge/made%20by-Aatra-orange.svg" alt="Made by Aatra"></a>
</p>

---

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

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-meter --marketplace aatra-ai/claude-code-usage-meter
```

Answer `y` to add the marketplace, then choose the **user** scope so it loads in every session.

From a shell:

```
claude plugin install usage-meter --marketplace aatra-ai/claude-code-usage-meter
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `aatra-ai/claude-code-usage-meter`, then **Add plugin**.

To remove it: `/plugin uninstall usage-meter`.

## Commands

| Command | What it does |
|---|---|
| `/usage-meter` | Prints a detailed breakdown: context, each limit window with reset time, tokens and cost |
| `/usage-meter toggle` | Hides or shows the line |

## How it works

Claude Code already tracks your usage for its own `/cost` command and status line. This mod reads those same figures and shows them where you can see them.

1. **Claude Code pushes the figures.** After each turn, and whenever a limit window moves by a whole point, Claude Code raises a `session.measure` event with the context fill, the rate-limit windows from the last API response, and the cost estimate. The mod doesn't poll or make requests of its own.
2. **The mod checks thresholds.** It compares each figure with its warning levels and remembers the highest level it has already warned about for each window, so every warning fires once. A new window (after a reset) starts fresh.
3. **Each turn is tallied.** When a turn completes, the mod adds up that turn's tokens (input, output, cache reads and cache writes) and compares the limit windows and cost with where they were when you sent the prompt. A big jump counts as heavy usage.
4. **The line is redrawn.** The values are kept in Claude Code's session state, so the line redraws only when a number changes.

The code is about 200 lines of TypeScript in [`hooks/register.tsx`](hooks/register.tsx). The warning levels are constants at the top of that file.

### No additional cost or tokens

- The mod **makes no model calls**. It never asks Claude anything, so it adds **zero tokens** to your usage and **nothing** to your bill or limits.
- Reading the usage figures is free: they come from Claude Code's own local bookkeeping, the same numbers `/cost` shows.
- **Nothing leaves your machine.** The mod has no network access and sends no telemetry.

### Notes

- The 5-hour and weekly windows appear only on a Claude subscription (Pro or Max), after the first response of a session reports them. With API-key billing you see context, tokens and cost.
- Token counts cover the main conversation, not subagents.
- Cache reads are included in token counts, so `last` can look large. They are cheap and weigh lightly against limits.
- The cost figure is Claude Code's local estimate at list prices, not your actual bill.

## Development

Requires a recent Claude Code. From this folder:

```bash
claude plugin validate .   # checks the manifest, hooks and types
claude plugin test .       # runs hooks/register.test.tsx
claude --plugin-dir .      # starts a session with the mod loaded from source
```

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.claude-plugin/marketplace.json` | Makes this repo installable with one line |
| `hooks/hooks.json` | Points Claude Code at the hooks module |
| `hooks/register.tsx` | The mod |
| `hooks/register.test.tsx` | Tests for the warnings and the line |
| `types/index.d.ts` | Types for the values the mod keeps in session state |

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Aatra and the Claude Code Usage Meter contributors. [MIT](LICENSE).

Not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.

---

<p align="center">Made with ❤️ by <a href="https://aatra.ai">Aatra</a></p>
