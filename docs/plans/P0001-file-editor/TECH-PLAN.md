---
title: P0001-file-editor
created_by: Kostas Charalampidis
last_updated: 2026-6-15
status: draft
documentation_status: pending
---

# Tech Plan — File Editor

In-app file editor for GROUND CONTROL: a dedicated page (a new `editor` view, peer to `gitDiff`)
opened by an icon button in the title bar after the git actions, with a lazy project file tree on
the left and a CodeMirror 6 editing surface on the right.

## Problem

A developer runs several coding agents on one project at once. To read what the agents produce or
make a quick hand edit, they must leave GROUND CONTROL for a separate IDE, breaking focus. There is
no in-app way to browse the project tree or open and edit a file, and no general file read/write
surface across the bridge — file contents only ever reach the renderer as git diffs.

## Current behavior

- **Dedicated-page navigation** is a `View` union (`src/state/store.ts:77`:
  `'workspace' | 'settings' | 'welcome' | 'gitDiff'`), switched by `setView` and rendered lazily in
  `src/App.tsx:17-22,64-69`. The Git diff viewer (`gitDiff`) is the page model to mirror: left list +
  `ResizeHandle` + right pane (`src/components/GitDiffViewer.tsx:206-241`), with pane width persisted
  as `gitDiffFileListWidth` (`shared/settings.ts`, `src/state/store.ts:374-380`).
- **Title bar** renders project-scoped controls only when a project is active
  (`src/components/Titlebar.tsx:44-53`); the back button shows for `workspace`/`gitDiff`
  (`Titlebar.tsx:22`); icon buttons follow an `IconButton` + `Icon` pattern (`Titlebar.tsx:59-64`).
- **No file IO surface.** The Rust backend exposes git/pty/store/dialog/system commands only
  (`src-tauri/src/main.rs:82-109`); `bridge.ts` calls them with raw `invoke('<snake_case>')` strings
  (`src/bridge.ts:91,100,109,144-166`). `shared/ipc.ts` is unused (an Electron-port leftover).
- **Highlighting** exists via Shiki, driven by the **terminal theme**, but only for diffs
  (`src/lib/highlighter.ts:37-68,207`, `src/components/GitDiffPane.tsx:30-32,134-155`).
- **External-change refresh** already has a precedent: the diff viewer re-loads on window focus
  (`src/components/GitDiffViewer.tsx:151-155`).

## Target behavior

A new `editor` view, peer to `gitDiff`, opened by an icon button placed **after the git actions** in
the title bar (available only when a project is active). The page shows the active worktree's file
tree (left, lazy per-directory) and a CodeMirror 6 editor (right). Three shippable increments:

- **P1 Browse & view** — open the page, expand folders, select a text file, read it with syntax
  highlighting; non-editable (binary / >2 MB) files show a placeholder; back returns to the prior view.
- **P2 Edit & save** — edit the buffer, see a dirty indicator, save on `Cmd/Ctrl+S` or an on-screen
  action; save errors surface and keep the buffer dirty; leaving/switching with unsaved changes prompts.
- **P3 Agent consistency** — on window focus, detect files agents changed on disk: auto-reload when
  clean, prompt keep-vs-reload when dirty, notify on deletion; saving uses an mtime guard to refuse
  clobbering a newer on-disk version.

Everything is confined to the active worktree root; the user cannot browse above it.

## Affected areas

- Renderer navigation/view layer: `store.ts` View union, `App.tsx` render + dock-hide, `Titlebar.tsx`.
- New renderer UI: `FileEditor` page, `FileTree`, `FileEditorPane`, and a CM6 theming lib.
- IPC: `shared/types.ts` (`GroundControlApi.files` + DTOs), `src/bridge.ts` wiring, `shared/settings.ts`.
- Rust backend: new `src-tauri/src/files.rs`, structs in `model.rs`, registration in `main.rs`, and
  `discover.rs` (`mtime_ms` → `pub`).

## Proposed approach

Follow the established dedicated-page pattern: add `'editor'` to the `View` union, render a lazy
`<FileEditor/>` when `view === 'editor'`, and add an `IconButton` after the git controls. `FileEditor`
composes the left tree + `ResizeHandle` + right pane exactly like `GitDiffViewer`, scoped to the active
project's `selectedWorktreeKey`.

The editor surface is **CodeMirror 6** (workerless — no CSP/worker wiring). Syntax highlighting is
CM6-native (Lezer grammars) with a `HighlightStyle` + editor theme **generated from the terminal-theme
palette**, the analogue of `src/lib/highlighter.ts:37-68`, so the editor restyles with the terminal
theme like the diff viewer.

File IO is four custom Rust commands in a new `src-tauri/src/files.rs`, wired through typed
`window.gc.files.*` (`shared/types.ts` + `bridge.ts`) and registered in `main.rs`. Every command takes
the worktree `root` and a target path and runs a **net-new** `confine(root, path)` check before any IO.
Reads/stat reject on failure (`Result`); `files_write` returns a `WriteResult` struct because *conflict*
is a structured outcome. `files_read` flags binary (NUL sniff) and too-large (2 MB cap) so the renderer
shows a non-editable placeholder reusing `GitDiffPane`'s states. External changes are detected by the
diff viewer's focus-refresh pattern plus an mtime save-guard. `shared/ipc.ts` is left untouched (dead).

**Contract additions** (`shared/types.ts` → `GroundControlApi.files`):

```ts
files: {
  readDir(root: string, dirPath: string): Promise<FsEntry[]>          // invoke('files_read_dir')
  read(root: string, path: string): Promise<FileContent>             // invoke('files_read')
  stat(root: string, path: string): Promise<FileStat>                // invoke('files_stat')
  write(root: string, path: string, content: string,
        expectedMtimeMs?: number): Promise<WriteResult>              // invoke('files_write')
}
```

DTOs (camelCase, `#[serde(rename_all = "camelCase")]` in `model.rs`):
- `FsEntry { name, path, isDir }` — one directory child; `.git` excluded at root; dirs-first then
  case-insensitive name.
- `FileContent { path, content: string|null, binary, tooLarge, mtimeMs, eol: 'lf'|'crlf' }` —
  `content` null when binary/tooLarge.
- `FileStat { exists, mtimeMs }` — cheap focus probe; missing file is not an error.
- `WriteResult { ok, mtimeMs, conflict, error: string|null }` — conflict when `expectedMtimeMs` differs.

## Relevant files

| Path | Change |
|------|--------|
| `src/state/store.ts:77` | add `'editor'` to the `View` union |
| `src/App.tsx:17-22,64-69` | lazy-render `<FileEditor/>` when `view === 'editor'`; inherits the existing `view !== 'workspace'` dock-hide + appearance-deferral (`App.tsx:44,65,72`) |
| `src/components/Titlebar.tsx:22,53` | `IconButton` after the git controls; add `'editor'` to `showBack` |
| `src/components/GitDiffViewer.tsx:206-241,151-155` | reference pattern (page composition + focus-refresh) — not modified |
| `src/components/FileEditor.tsx` | NEW — page shell: tree + `ResizeHandle` + pane |
| `src/components/FileTree.tsx` | NEW — lazy expandable tree; type `FileTreeNode` (avoid the `GitDiffFileList` type/component name collision, `shared/types.ts:214`) |
| `src/components/FileEditorPane.tsx` | NEW — CM6 surface, dirty state, save, non-editable placeholders (mirror `GitDiffPane.tsx:134-155`) |
| `src/lib/editorTheme.ts` | NEW — terminal-palette → CM6 `HighlightStyle` + editor theme |
| `shared/types.ts:244-323` | add DTOs + `GroundControlApi.files` |
| `shared/settings.ts` | add `fileTreeWidth` default + clamp (mirror `pickGitDiffFileListWidth`) |
| `src/bridge.ts:144-166` | add `window.gc.files.*` (raw `invoke('files_*')` strings) |
| `src-tauri/src/files.rs` | NEW — 4 commands + `confine`, `is_binary`, size cap, EOL detect |
| `src-tauri/src/model.rs:133` | add `FsEntry`/`FileContent`/`FileStat`/`WriteResult` |
| `src-tauri/src/main.rs:82-109` | `mod files;` + register `files_*` in `generate_handler!` |
| `src-tauri/src/discover.rs:27` | make `mtime_ms` `pub` (reuse instead of re-deriving) |
| `shared/ipc.ts` | **NOT modified** — vestigial (ADR-009) |

## Decisions (ADRs)

### ADR-001: CodeMirror 6 as the editor surface (not Monaco)
- **Decision**: Use CodeMirror 6 (`@codemirror/state`,`/view`,`/commands`,`/language` + per-language
  grammars, lazy-loaded by file type) for the editing surface.
- **Context**: The user suggested "possibly monaco… if it fits." It doesn't: the webview CSP is
  `script-src 'self'` with no `blob:` (`src-tauri/tauri.conf.json:32`), and Monaco's default worker
  loader builds workers from `blob:` URLs the CSP blocks. The need is quick hand edits alongside agents,
  not an IDE.
- **Alternatives rejected**: **Monaco (+`@shikijs/monaco`)** — needs bespoke same-origin `?worker`
  wiring CM6 makes unnecessary, several MB heavier, and its language services diverge from the project's
  grammar set (two highlight authorities); its IDE ceiling is out of v1 scope. Keep as the path only if
  this becomes a true embedded IDE.
- **Consequences**: CM6 is **workerless**, so the CSP/worker problem disappears entirely; lighter
  bundle; a new stack dependency → an ADR in `docs/ADR.md` is required before implementation lands.

### ADR-002: Highlighting via CM6 Lezer + a terminal-palette `HighlightStyle`
- **Decision**: Drive editor syntax colors from CM6's own Lezer grammars plus a `HighlightStyle`/theme
  generated from the active terminal palette (mirroring `src/lib/highlighter.ts:37-68`), so the editor
  restyles when the terminal theme changes (FR: highlighting matches the diff viewer's theme).
- **Context**: There is no official Shiki↔CodeMirror bridge — `@shikijs/codemirror` does not exist
  (verified: `npm view @shikijs/codemirror` → 404; Shiki ships `@shikijs/monaco` only).
- **Alternatives rejected**: **Reuse Shiki via a custom CM6 `ViewPlugin` decoration layer**
  (`tokenizeLine`, `highlighter.ts:207`) — exact diff-viewer color parity and a single highlight
  authority, but requires hand-managing TextMate's cross-line tokenizer state over an editable, scrolling
  buffer; higher v1 risk. Revisit if exact parity matters.
- **Consequences**: Editor colors are *approximate*, not byte-identical, to the diff viewer's Shiki
  output; both still track the same terminal palette. A second (Lezer) grammar set coexists with Shiki.

### ADR-003: File tree shows everything but `.git`, lazy per-directory
- **Decision**: List one directory level at a time (lazy expand); show all entries, hiding only `.git`.
- **Context**: Agent worktrees routinely contain git-ignored files a dev still needs to edit (`.env`,
  local config); the tree must stay responsive on 100k-file repos (`node_modules`).
- **Alternatives rejected**: **Respect `.gitignore`** — hides legitimately-editable files + parsing
  cost. **Eager full-tree walk** — stalls on large repos.
- **Consequences**: No ignore-parsing; heavy dirs cost nothing until expanded. A later "hide ignored"
  toggle remains possible.

### ADR-004: Focus-based external-change detection + mtime save-guard (no live watcher)
- **Decision**: On window focus, re-stat the open file and re-list expanded directories — reusing the
  diff viewer's `window.addEventListener('focus', …)` (`GitDiffViewer.tsx:151-155`). Clean+changed →
  auto-reload; dirty+changed → prompt keep-vs-reload; deleted → notify. `files_write` compares
  `expectedMtimeMs` and refuses on mismatch.
- **Context**: Agents write these files constantly (FR-011); a live recursive watcher adds complexity and
  noise for a local single-user tool.
- **Alternatives rejected**: **Live FS watcher** (heavier, recursive-watch edge cases — deferrable behind
  the same reconciliation logic). **Manual-only refresh** (too easy to edit a stale copy).
- **Consequences**: A change is detected on focus, not instantly; acceptable for hand edits.

### ADR-005: Explicit save, single active file (no auto-save / multi-tab in v1)
- **Decision**: Persist only on `Cmd/Ctrl+S` or an on-screen action, with a dirty indicator; one file
  open at a time (selecting another replaces it, with an unsaved-change guard).
- **Context**: Hand edits next to agents that also write should be deliberate, not autosaved mid-keystroke.
- **Alternatives rejected**: **Auto-save** — surprising next to concurrent agent writes. **Multi-tab** —
  out of v1 scope.
- **Consequences**: Simpler buffer model (`EditorBuffer`: path, diskContent, editorContent,
  baselineMtimeMs, dirty, editable); revisit multi-tab later.

### ADR-006: Net-new binary + 2 MB detectors (placeholder UX reuses GitDiffPane, the detection does not)
- **Decision**: `files_read` flags `binary` via a NUL-byte sniff of a sampled prefix and `tooLarge` via a
  2 MB on-disk size cap (a module `const` in `files.rs`); the renderer shows a non-editable placeholder
  reusing `GitDiffPane`'s binary/too-large states (`GitDiffPane.tsx:134-155`).
- **Context**: The codebase has **no content-based binary detector** — `GitFileDiff.binary` comes from
  git's `"Binary files … differ"` string (`git.rs:869`); git's size handling is two conflicting constants
  (`FILE_DIFF_MAX_BUFFER = 5 MB` at `git.rs:20` and a hardcoded `500_000` at `git.rs:877`), both measuring
  diff text, not file size.
- **Alternatives rejected**: "Mirror the backend's existing detection" — there is none to mirror.
- **Consequences**: 2 MB is a deliberate fresh pick; the *UI* is consistent with the diff pane, the
  *detection* is new and unit-tested.

### ADR-007: Custom `files.rs` seam + net-new path confinement; reuse `discover::mtime_ms`
- **Decision**: Four custom `#[tauri::command]`s in `files.rs` (no `tauri-plugin-fs`), each calling a new
  `confine(root, path) -> Result<PathBuf, String>` (canonicalize both, then `starts_with`, handling
  symlink escape) before any IO. Reuse `discover::mtime_ms` (made `pub`) for epoch-ms.
- **Context**: The custom-command seam matches git/pty/store, but **path-safety does not exist to reuse**:
  `paths.rs:29 normalize_path_identity` normalizes/canonicalizes but never enforces containment, and the
  git commands got safety from git itself (`-C` scoping + `:(literal)` pathspecs, `git.rs:802,830`), which
  raw `std::fs` cannot inherit. `mtime_ms` already exists (`discover.rs:27`, private).
- **Alternatives rejected**: **`tauri-plugin-fs` with scope** — a different access/capability model than
  the rest of the app. **Trusting renderer-supplied absolute paths** — traversal risk.
- **Consequences**: Confinement is security-critical new code → Rust unit tests for `..`, absolute-outside,
  and symlink escape. `discover::mtime_ms` becomes shared (it was duplicated 5× already).

### ADR-008: Rust command shape follows the operation
- **Decision**: `files_read_dir`/`files_read`/`files_stat` return `Result<T, String>` (the `invoke`
  promise rejects on hard failure → renderer try/catch shows an error state, like a failed `git.diffFiles`).
  `files_write` returns an infallible `WriteResult` struct (conflict is a structured outcome to branch on).
- **Context**: Both conventions exist — git commands return infallible structs with `error: Option<String>`
  (`git.rs:262,300,345,643,768`); `store_save` returns `Result<(),String>` (`store.rs:227`). Mapping by
  semantics keeps `files_read`'s two "null content" cases clean (reject = unreadable; resolve with
  `content:null` + flags = not editable).
- **Alternatives rejected**: **Uniform git-style** (forces an `error` field into `FileContent` beside
  `binary`/`tooLarge`, blurring failure vs not-editable). **Uniform `Result`** (conflict isn't an error and
  the renderer needs the new mtime + a branch).
- **Consequences**: One module mixes two shapes by design; low-stakes (both compile).

### ADR-009: `shared/ipc.ts` is vestigial — do not feed it
- **Decision**: Do not add `files:*` constants to `shared/ipc.ts`. The contract is the `invoke('files_*')`
  string in `bridge.ts` matching the `generate_handler!` registration in `main.rs:82-109`; typing comes
  from `GroundControlApi` (`shared/types.ts`) + `model.rs` structs.
- **Context**: Nothing imports `ipc.ts`; `bridge.ts` uses raw snake_case strings
  (`bridge.ts:91,100,109,144-166`). It is an Electron-port leftover.
- **Alternatives rejected**: **Add entries for "consistency"** — consistency with a dead file misleads.
  **Delete `ipc.ts` now** — out of scope (touches git wiring); see Open questions.
- **Consequences**: The plan no longer claims `ipc.ts` is part of the contract.

## Vertical slices

### Slice 1 — Browse & view (P1)
- **Delivers**: editor view opens from the title-bar button (project-scoped, after git actions); lazy
  file tree (all but `.git`); selecting a text file renders it read-only with terminal-themed highlighting;
  binary/>2 MB show a placeholder; back returns to the prior view; everything confined to the worktree root.
- **Files**: `store.ts:77`, `App.tsx` (lazy render + dock-hide inherit), `Titlebar.tsx:22,53`,
  `components/FileEditor.tsx`, `FileTree.tsx`, `FileEditorPane.tsx` (read-only), `lib/editorTheme.ts`,
  `shared/types.ts` (`FsEntry`/`FileContent`/`FileStat`, `files.readDir/read/stat`), `shared/settings.ts`
  (`fileTreeWidth`), `bridge.ts`, `src-tauri/src/files.rs` (`files_read_dir`/`files_read`/`files_stat` +
  `confine`/`is_binary`/size-cap/EOL), `model.rs`, `main.rs`, `discover.rs` (`pub mtime_ms`).
- **Verification**: `cargo test` — confinement (`..`/absolute-outside/symlink), binary (NUL), too-large
  (>2 MB), `.git` excluded + dirs-first ordering. Manual: open editor → expand a heavy dir stays responsive
  (≤2 s interactive) → `.env` visible, `.git` not → select a file → highlighted; change terminal theme →
  editor restyles; no-project → button unavailable. `pnpm check` green.

### Slice 2 — Edit & save (P2)
- **Delivers**: editable buffer with a dirty indicator; `Cmd/Ctrl+S` and an on-screen save write to disk
  and clear dirty; save failure (read-only/permission) shows an error and keeps dirty; switching file or
  leaving with unsaved changes prompts save/discard (reuse the existing `dialog.confirm*` seam).
- **Files**: `FileEditorPane.tsx` (editable + save keymap), `files.rs` (`files_write` + `WriteResult`),
  `shared/types.ts`/`bridge.ts` (`files.write`), `store.ts` (dirty + leave/switch guard).
- **Verification**: `cargo test` mtime-guard. Manual: edit → dirty appears → save → clears → the saved
  change shows immediately in the existing Git diff viewer (no restart); `chmod 444` → save → error +
  stays dirty; edit + switch file → prompted. `pnpm check` green.

### Slice 3 — Agent consistency (P3)
- **Delivers**: on window focus, re-stat the open file + re-list expanded dirs; clean+changed →
  auto-reload, dirty+changed → keep-vs-reload prompt, deleted → notice; save mtime-guard refuses a clobber.
- **Files**: `FileEditor.tsx` (focus listener mirroring `GitDiffViewer.tsx:151-155`), `store.ts`
  (reconciliation transitions), `FileEditorPane.tsx`/`files.ts` bridge (stat + conflict handling).
- **Verification**: Manual: external edit + refocus (clean) → auto-reloads; unsaved + external edit +
  refocus → keep-vs-reload prompt; external edit then save → conflict prompt, no silent clobber; delete +
  refocus → "no longer exists". `pnpm check` green.

## Risks

- **Path confinement is net-new, security-critical** — a flaw allows traversal outside the worktree.
  Mitigation: canonicalize-both + `starts_with`, explicit symlink-escape test, kept in one helper.
- **CM6 is a new stack dependency** (bundle + an ADR obligation). Mitigation: `vite build` in the gate;
  lazy-load grammars by file type.
- **Highlight color divergence** from the diff viewer (Lezer ≠ Shiki output). Accepted (ADR-002); both
  still terminal-theme-driven. Some languages outside the grammar set render as plain text.
- **Large files / large trees** could stall. Mitigation: lazy per-directory listing (ADR-003), 2 MB cap.
- **Focus-refresh is not instantaneous** — a change is reconciled on next focus, not live (ADR-004).

## Rollback

Purely additive and gated behind the `editor` view. To disable: remove the title-bar button (and/or the
`view === 'editor'` branch in `App.tsx`) so the page is unreachable; the `files_*` commands are then never
invoked. No DB/schema/migration. The only persisted state is an optional `fileTreeWidth` setting (ignored
if absent). A straight `git revert` of the feature commit(s) restores prior behavior.

## Tests

- **Rust `cargo test` (in `files.rs`)**: confinement (`..`, absolute-outside-root, symlink escape);
  binary detection (NUL → `binary:true, content:null`); too-large (>2 MB → `tooLarge:true`); mtime
  save-guard (stale `expectedMtimeMs` → `conflict:true`, no write); `files_read_dir` omits `.git` and orders
  dirs-first then case-insensitive.
- **Gate**: `pnpm check` = `tsc --noEmit` + `vite build` (confirms CM6 + grammars bundle) + `cargo check`
  + `cargo clippy -- -D warnings` + `cargo test`.
- **Manual**: the per-slice verification steps above, run in `pnpm tauri dev` (restart after Rust changes —
  `pnpm dev` does not watch the backend).

## Open questions

- **Grammar set**: which CM6 language packages to bundle eagerly vs lazy-load — decide concretely in Slice 1.
- **Shared placeholder**: `GitDiffPane` has six near-identical placeholder blocks (`GitDiffPane.tsx:106-165`);
  the editor wants the same family. Copy for now; extracting a shared `<PanePlaceholder>` is a low-priority
  follow-up, not part of these slices.
- **ADR home**: whether `docs/ADR.md` gets a standalone CodeMirror ADR or ADR-001 here suffices for the
  constitution's stack-change requirement.
