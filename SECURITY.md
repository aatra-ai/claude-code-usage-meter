# Security

**Please don't open a public issue for a vulnerability.** Report it privately through
[GitHub's private vulnerability reporting](https://github.com/aatra-ai/claude-code-usage-meter/security/advisories/new).
You should hear back within a week.

## What the mod can do

The mod runs inside Claude Code's plugin engine. It has no file system, network or shell access of its own. It reads Claude Code's usage figures, keeps a few values in session state, registers the `/usage-meter` command, and shows a line, toasts and a desktop notification.

## Scope

In scope:
- Anything that makes the mod send data off the machine, call a model, or run code beyond the above.
- A change that lets the mod's output be used to inject text into the conversation.

Out of scope:
- Accuracy of the usage figures themselves: they come from Claude Code.
