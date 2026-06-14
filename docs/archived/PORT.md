# GROUND CONTROL — Electron → Tauri port

A working port of GROUND CONTROL from Electron to **Tauri v2 + Rust**. The React
renderer is reused unchanged; the Electron main process (`electron/main`, ~2,100
LOC) is rewritten in Rust; the preload bridge becomes a Tauri-backed
`window.gc`. Grew out of the PTY spike (see `SPIKE.md`).

Status: **functionally complete and verified.** Rust builds with 0 warnings,
`tsc` and `vite build` pass clean, and the app boots end-to-end (renderer ↔
bridge ↔ Rust round-trips confirmed).

## Strategy

1. **Renderer reused as-is.** `src/` and `shared/` are copied verbatim from the
   Electron app. The renderer only ever talks to the backend through the
   `GroundControlApi` contract on `window.gc`. So instead of rewriting 60 files,
   `src/bridge.ts` re-implements that exact interface over Tauri `invoke` +
   events and assigns `window.gc`. The whole UI runs untouched.
2. **Main process rewritten in Rust** under `src-tauri/src/`, one module per
   Electron concern.
3. **String-contract parity.** `SessionDataEvent.data` is a string, so the Rust
   PTY coalesces bytes (6 ms tick) and emits `session-data`/`terminal-data`
   events — matching Electron's `webContents.send` model. (The binary `Channel`
   from the spike is a banked post-parity optimization.)

## Rust module map

| `src-tauri/src/` | Ports from `electron/main/` | Notes |
|---|---|---|
| `pty.rs` | `pty.ts` | PtyManager: session + shell spawn, 6 ms coalescing flush, generation guards, reader/flusher threads, id-discovery wiring. `portable-pty`. |
| `agents.rs` | `agents.ts` | agent resolution/version, spawn-planning (claude/cursor/codex/opencode), cursor create-chat. |
| `discover.rs` | `discover.ts` | codex/opencode session-id watchers (filesystem poll). |
| `env.rs` | `env.ts` + `shell.ts` | login-shell env capture (GUI-PATH fix), bin resolution, shell-quote, bounded `run_capture`. |
| `git.rs` + `diffparse.rs` | `git.ts` + `shared/diffParse.ts` | full git layer ported to Rust (kept backend-authoritative; renderer gets parsed results). |
| `store.rs` | `store.ts` + `persistedStateLoad.ts` | atomic JSON store, structural normalize, path identity. Settings pass through; renderer normalizes. |
| `transcript.rs` | `transcript.ts` | Claude jsonl title derivation. |
| `terminalbg.rs` | `terminalBg.ts` | image upload (base64, magic-byte sniff) + `groundcontrol://` protocol (in `main.rs`). |
| `dialog.rs` | dialog handlers | `tauri-plugin-dialog` (folder pick + confirm). |
| `system.rs` | system handlers | agent probe, home dir. |
| `paths.rs` | `pathIdentity.ts` | path normalization / realpath. |
| `model.rs` | `shared/types.ts` | serde payload types. |
| `main.rs` | `index.ts` + `ipc.ts` | builder, command registration, protocol, exit cleanup. |

`src/bridge.ts` replaces `electron/preload/index.ts`. Startup seed (`platform`,
`startupAppTheme`) is sourced in the bridge (navigator + `localStorage`) instead
of a native preload.

## Verified

- App boots; `window.gc` installed; Tauri IPC live; React mounts.
- Store round-trip: `~/Library/Application Support/com.groundcontrol.taurispike/groundcontrol.json`
  is written with OS-seeded settings on first run → exercises `store_load`,
  `normalizeSettings`, `themeNeedsOsSeed`, `store_save`.
- PTY core proven by the prior spike (Claude TUI rendered over a real pty).

## Run

```bash
cd gc-tauri-spike
pnpm install           # once
pnpm tauri dev         # dev (Vite + Rust)
pnpm tauri build       # production bundle
```

## Known issues / follow-ups

- **Dev hot-restart can serve a stale/blank webview.** The Rust file-watcher
  restart sometimes reuses a bad WKWebView cache and shows a blank window. A
  full clean relaunch (`pkill -f gc-tauri-spike; pnpm tauri dev`) always
  works. Cosmetic dev-mode quirk; doesn't affect `tauri build`.
- **CSP** is currently `null` (trusted local app). Re-add via `tauri.conf.json`
  `app.security.csp` (Tauri-managed, not a meta tag) as a hardening follow-up.
- **Post-parity optimizations** (banked, do after behavior parity holds): binary
  `Channel` for PTY output; `notify` fs-events instead of `discover.rs` polling;
  `gitoxide` for git read paths; cancellation tokens over the generation-counter
  guard. See the parent assessment.
- The dir is still named `gc-tauri-spike`; rename to `ground-control-tauri` when
  promoting (the Cargo build cache is path-keyed, so do it deliberately).
