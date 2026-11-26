# usage-meter

A mod for Claude Code that shows your token usage and limits live, in a line above the prompt, and warns you before you hit a limit.

```
ctx 42% · 5h 31% (2h14m) · 7d 12% (4d) · last 84k · session 1.2M tok · ~$3.10 est
```

- **ctx**: how full the context window is
- **5h / 7d**: subscription rate-limit windows, with time until reset (shown once Claude Code has a reading; not shown on API-key billing)
- **last / session**: tokens used by the last turn and by the session (main thread)
- **~$**: Claude Code's local cost estimate, not a bill

Figures turn yellow and then red as they rise (limits at 75% / 90%, context at 70% / 85%).

## Warnings

- **Approaching a limit**: a toast at 75% and 90% of any rate-limit window; at 100% a desktop notification too. Each level fires once per window.
- **Context filling**: a toast at 80% and 90%, suggesting `/compact`.
- **Heavy usage**: a toast after a turn that used 200k+ tokens, moved a limit window 5+ points, or cost an estimated $2+.

Thresholds are constants at the top of `hooks/register.tsx`.

## Commands

- `/usage-meter`: detailed breakdown of context, limits, tokens and cost
- `/usage-meter toggle`: hide or show the line

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-meter --marketplace krishnaraj-aatra/claude-code-usage-meter
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install usage-meter --marketplace krishnaraj-aatra/claude-code-usage-meter
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `krishnaraj-aatra/claude-code-usage-meter`, then Add plugin.

## Privacy

Everything it shows comes from Claude Code's own usage figures (the same ones `/cost` and the status line use). Nothing is sent anywhere.

## License

MIT

Not affiliated with or endorsed by Anthropic.
