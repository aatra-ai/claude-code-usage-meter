# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-26

### Added
- API key and cloud provider support: today's estimated spend on the line when there are no plan limits.
- Session and daily budgets (USD) with warnings at the same levels as limits.
- Daily spend kept across sessions for 31 days; `/usage-meter` lists the last 7.
- Subagent tokens counted in the session total and listed separately in `/usage-meter`.
- Settings for budgets, warning levels, the context warning and heavy-turn thresholds (`/plugin configure usage-meter@usage-meter`).

### Changed
- Slimmed the README to install and usage; details moved to `docs/how-it-works.md` and `docs/development.md`.

## [0.1.0] - 2026-11-26

### Added
- A live line above the prompt showing context fill, the 5-hour and weekly limit windows with reset times, tokens used in the last turn and the session, and the estimated cost.
- Warnings at 75%, 90% and 100% of a limit window (a desktop notification at 100%), at 80% and 90% context fill, and after heavy turns.
- `/usage-meter` for a detailed breakdown and `/usage-meter toggle` to hide or show the line.

[0.2.0]: https://github.com/aatra-ai/claude-code-usage-meter/releases/tag/v0.2.0
[0.1.0]: https://github.com/aatra-ai/claude-code-usage-meter/releases/tag/v0.1.0
