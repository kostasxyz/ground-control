# Changelog

All notable changes to GROUND CONTROL are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Pin projects to the workspace icon rail: a pin/unpin button on each project
  card. Pinned projects appear in the thin left rail; the active project always
  shows there too, even when it isn't pinned.
- "Project terminals" button in the agent panel header — toggles the terminals
  dock open/closed, spawning the first shell when the project has none.
- Confirmation dialog before archiving an agent session, shared by the session
  card and the agent panel archive buttons.

### Changed
- Slimmed the project icon rail width by ~30%.
- Reworked the sessions panel header: the project title now sits beside a
  subtler, ghost-style "New session" button.

### Fixed
- Close the project terminals panel automatically when its last terminal is
  trashed.
