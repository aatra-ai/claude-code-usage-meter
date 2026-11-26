# Claude Code Usage Meter

See your Claude Code token usage and limits live, and get warned before you hit them.
No extra tokens, no extra cost.

```
ctx 42% · 5h 31% (2h14m) · 7d 79% (2d) · last 84k · session 1.2M tok · ~$3.10 est
```

## Install

```
/plugin install usage-meter --marketplace aatra-ai/claude-code-usage-meter
```

Answer `y`, then choose the **user** scope.

## Use

- The line above your prompt updates as you work. It turns yellow, then red, near a limit.
- You get a pop-up at 75% and 90% of a limit, and when context is filling up.
- On an API key or a cloud provider (no plan limits), it shows today's spend. Set a session or daily budget to get warnings for those too: `/plugin configure usage-meter@usage-meter`.
- `/usage-meter` shows a detailed breakdown. `/usage-meter toggle` hides the line.

## Learn more

- [How it works](docs/how-it-works.md): what each number means, the warnings, why it adds no cost
- [Development](docs/development.md): run, test and change it locally
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

MIT · Not affiliated with Anthropic · Made with ❤️ by [Aatra](https://aatra.ai)
