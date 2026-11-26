# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-26

### Added
- A live line above the prompt showing context fill, the 5-hour and weekly limit windows with reset times, tokens used in the last turn and the session, and the estimated cost.
- Warnings at 75%, 90% and 100% of a limit window (a desktop notification at 100%), at 80% and 90% context fill, and after heavy turns.
- `/usage-meter` for a detailed breakdown and `/usage-meter toggle` to hide or show the line.

[0.1.0]: https://github.com/aatra-ai/claude-code-usage-meter/releases/tag/v0.1.0
