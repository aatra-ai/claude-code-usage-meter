# Development

Requires a recent Claude Code. From the repository root:

```bash
claude plugin validate .   # checks the manifest, hooks and types
claude plugin test .       # runs hooks/register.test.tsx
claude --plugin-dir .      # starts a session with the mod loaded from source
```

Claude Code writes the mod's type definitions to `.claude-plugin/types/` when it loads the mod. After that, `tsc -p .` type-checks it in your editor.

## Layout

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.claude-plugin/marketplace.json` | Makes this repo installable with one line |
| `hooks/hooks.json` | Points Claude Code at the hooks module |
| `hooks/register.tsx` | The mod |
| `hooks/register.test.tsx` | Tests for the warnings and the line |
| `types/index.d.ts` | Types for the values the mod keeps in session state |

See [CONTRIBUTING.md](../CONTRIBUTING.md) before opening a pull request.
