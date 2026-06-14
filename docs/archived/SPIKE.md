# Tauri PTY spike — result: ✅ PASS

A minimal Tauri v2 + `portable-pty` app that streams one agent session into
xterm. Built to de-risk the hardest part of porting GROUND CONTROL (Electron →
Tauri) **before** committing to the full migration.

## What it proves

| Unknown | Result | Evidence |
|---|---|---|
| **TUI ownership** — does an Ink TUI accept a Rust PTY as its own? | ✅ | Claude Code v2.1.177 rendered its full Ink UI (logo, bordered input, status line, ANSI colors, box-drawing). Ink exits immediately if it lacks a real tty; it survived and drew. |
| **Throughput** — do PTY bytes stream cleanly across the IPC boundary? | ✅ | 3.7 KiB streamed via `tauri::ipc::Channel<InvokeResponseBody>` → `InvokeResponseBody::Raw` → ArrayBuffer in JS → `term.write()`. Correct colors/box chars, no garbling. |
| **GUI-PATH fix in Rust** — can we find CLIs not on launchd's PATH? | ✅ | Resolved `claude` from `~/.local/bin` (not on the GUI PATH) via login-shell env capture ported from `electron/main/env.ts`. |
| **`exec`-through-login-shell** for PTY ownership | ✅ | `zsh -lc "exec '<bin>'"` — agent inherits the PTY's pid/session directly. |
| **Tauri v2 command/ACL wiring** | ✅ | App-defined commands (`spawn_agent`/`write_pty`/`resize_pty`/`kill_pty`) need **no** capability entry; only `core:default` for the window. |
| **Rust compile of the binary-Channel path** | ✅ | `cargo build` clean in 42s; the `Channel` moves into the blocking reader thread (`'static`) because the message type is the owned `InvokeResponseBody`, not `&[u8]`. |

## Key API decisions (verified, not assumed)

- **Binary streaming:** use `Channel<InvokeResponseBody>` and send
  `InvokeResponseBody::Raw(bytes.to_vec())`. The documented `Channel<&[u8]>`
  form does **not** move into a long-lived thread (its phantom lifetime isn't
  `'static`); the owned-body form does. JS receives each message as `ArrayBuffer`.
- **Real PTY, not `tauri-plugin-shell`:** the shell plugin gives piped stdout,
  not a tty — Ink TUIs reject it. Use `portable-pty` directly.
- **Exit signalling:** PTY bytes ride the hot binary Channel; the low-frequency
  `pty://exit` rides a normal `app.emit` event. Don't mix the two.

## Not yet ported (deliberately out of spike scope)

Output coalescing (`pty.ts` FLUSH_MS=6 / 256 KB), the spawn race/generation
guards, agent spawn-planning (claude/cursor/codex/opencode resume + id
discovery), git, store, transcript, terminal-bg protocol, dialogs. These are
mechanical-to-medium ports — see the parent assessment.

## Run it

```bash
cd gc-tauri-spike
pnpm install         # once
pnpm tauri dev       # opens the window, auto-spawns the selected agent
```

Pick `claude`/`codex` in the toolbar, set a cwd, Spawn / Kill. The status line
shows bytes streamed + time-to-first-byte.

## Layout

```
src/main.ts                  xterm + invoke + binary Channel (renderer seam)
src-tauri/src/pty.rs         PtyManager: spawn/write/resize/kill + reader thread
src-tauri/src/env.rs         login-shell env capture, bin resolution, shell-quote
src-tauri/src/main.rs        Builder + command registration
src-tauri/capabilities/      default capability (core:default)
```
