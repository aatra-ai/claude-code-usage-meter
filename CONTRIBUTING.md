# Contributing

Thanks for helping. This mod is deliberately small, so please open an issue before starting a large change.

## Setup

You need a recent [Claude Code](https://docs.claude.com/en/docs/claude-code). No other dependencies.

```bash
git clone https://github.com/aatra-ai/claude-code-usage-meter.git
cd claude-code-usage-meter
claude --plugin-dir .      # a session with the mod loaded from source
```

Claude Code writes the mod's type definitions to `.claude-plugin/types/` when it loads the mod. After that, `tsc -p .` type-checks it in your editor.

## Before opening a pull request

```bash
claude plugin validate .   # must pass
claude plugin test .       # must pass
```

- Keep the mod free of model calls and network access: no extra tokens, no extra cost, nothing sent anywhere. That promise is the point of the project.
- Add or update a test in `hooks/register.test.tsx` for any change to warnings or the line.
- If you change the shape of a value in session state, change its `shape` tag in `hooks/register.tsx` so values stored by the old version are dropped.
- Add a line under an `Unreleased` heading in [CHANGELOG.md](CHANGELOG.md).

## Releasing

1. Bump `version` in `.claude-plugin/plugin.json` and move the changelog entries under the new version.
2. Tag the commit `vX.Y.Z` and publish a GitHub release with the changelog section.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
