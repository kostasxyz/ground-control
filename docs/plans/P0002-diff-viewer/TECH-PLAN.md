---
title: P0002-diff-viewer
created_by: Kostas Charalampidis
last_updated: 2026-6-15
status: draft
documentation_status: pending
---

# Tech Plan — Diff Viewer (@pierre/diffs renderer swap)

Replace the hand-rolled unified-diff renderer in the existing `gitDiff` page with the
`@pierre/diffs` `<FileDiff/>` component to gain split/unified rendering and word-level intra-line
diffs, keep our Rust diff backend unchanged except for one additive field, and give diffs their
own theme axis (a third theme alongside app + terminal) using purpose-built Shiki themes.

## Problem

Our diff viewer renders unified-only, line-by-line, with syntax colors *derived* from the active
terminal palette. Two limits:

- **No split view and no word-level diff.** `GitDiffPane.tsx` lays out one row per line with a
  fixed `[44px_44px_1fr]` grid (`GitDiffPane.tsx:176-234`); there is no side-by-side mode and no
  intra-line (added/removed token) highlighting. Side-by-side with word diff is the single biggest
  UX gap versus comparable tools (e.g. Jean, which uses `@pierre/diffs`).
- **Highlighting is lossy.** Colors come from `buildTerminalTheme` (`highlighter.ts:38-68`), which
  collapses many TextMate scopes onto a terminal's 16 ANSI colors. Purpose-built Shiki code themes
  (vitesse, github, dracula, …) distinguish far more scopes, with per-scope font styles.

A developer reviewing several agents' output wants legible, side-by-side diffs and the ability to
pick a code theme tuned for review — independent of the terminal theme.

## Current behavior

- **Page model.** `gitDiff` is a `View` (`store.ts:77`), rendered as a two-pane layout:
  `GitDiffFileList` (left) + `ResizeHandle` + `GitDiffPane` (right), composed by `GitDiffViewer`
  (`GitDiffViewer.tsx:206-241`), scoped to the active project's selected worktree, with
  stale-request sequencing (`GitDiffViewer.tsx:104-145`) and focus-refresh (`:151-155`).
- **Per-file backend.** `git_file_diff` (`git.rs:767-886`) runs `git diff` for one file, detects
  `"Binary files … differ"` → `binary`, caps `text.len() > 500_000` → `tooLarge`, then
  `parse_unified_diff(&text)` → `hunks` and **discards the raw `text`**. Returns `GitFileDiff`
  (`model.rs:176-184`): `hunks`, `binary`, `tooLarge`, `error`.
- **Rendering.** `GitDiffPane` fetches via `window.gc.git.fileDiff(...)` (`bridge.ts:164-165`),
  tokenizes each line with Shiki through `tokenizeLine`/`langForFile` (`highlighter.ts:190-231`),
  and renders hunks manually with a sticky per-file header (`GitDiffPane.tsx:169-173`). It has
  six placeholder states: no-file, loading, error, binary, too-large, no-diff
  (`GitDiffPane.tsx:106-165`).
- **Theming.** Diff colors follow `settings.terminalThemeId` (`GitDiffPane.tsx:32`). The diff font
  follows the terminal font/size (commit 5833a50). `highlighter.ts` is consumed **only** by
  `GitDiffPane` (verified: `grep -rl tokenizeLine src` → `GitDiffPane.tsx` + `highlighter.ts`).
- **Settings.** Theme ids are validated/clamped in `normalizeSettings` (`settings.ts:157-193`) and
  edited via `Select` rows in `SettingsPage.tsx` (terminal theme: `:254-275`); writes go through
  `patchSettings` (`store.ts:374`). Catalogs live in `shared/terminalThemes.ts` and
  `shared/appThemes.ts` (id union + `ORDER` + `label` + `is*` guard + `DEFAULT_*`).

## Target behavior

The same `gitDiff` page, same backend, same file list and single-file-at-a-time selection — but the
right pane renders with `@pierre/diffs`:

- **P1 Renderer swap + theme axis** — `GitDiffPane` parses `rawPatch` and renders `<FileDiff/>`
  with split/unified support; a persisted split/unified toggle in the pane header; a new
  `diffThemeId` setting (bundled Shiki theme) with its own Settings selector; the diff font/size
  still follows the terminal font/size; the six placeholder states are preserved; the custom
  `highlighter.ts` tokenize path is retired.
- **P2 Sidebar polish** — file filter box, `/` to focus it, `j`/`k`/arrow keyboard navigation
  between files, selected-file scroll-into-view.
- **P3 (deferred) Actions** — per-file revert first, commit later; only if it fits GC's UX.

## Affected areas

- Rust backend: `model.rs` (`GitFileDiff` gains `raw_patch`), `git.rs` (`git_file_diff` returns the
  text it already builds).
- IPC types: `shared/types.ts` (`GitFileDiff.rawPatch?`, `Settings.diffThemeId`, `Settings.diffViewStyle`).
- New shared catalog: `shared/diffThemes.ts` (diff theme id union + order + labels + guard + default).
- Settings: `shared/settings.ts` (defaults + `pickDiffThemeId`/`pickDiffViewStyle`),
  `src/components/SettingsPage.tsx` (a Diff selector mirroring the terminal-theme `Select` + diff
  re-pair on app-theme change).
- Theme pairing: `src/state/store.ts` (re-pair the diff theme alongside the terminal in the OS-seed
  block and the OS-change listener).
- Renderer: `GitDiffPane.tsx` (swap inner render to `<FileDiff/>`), `GitDiffViewer.tsx` (filter +
  keyboard nav in P2), delete `src/lib/highlighter.ts` (P1).
- Dependencies: add `@pierre/diffs`; remove now-unused `@shikijs/langs` (only `highlighter.ts` used it).

## Proposed approach

**Backend (one additive field).** Add `raw_patch: Option<String>` to `GitFileDiff` (`model.rs:178`,
`#[serde(skip_serializing_if = "Option::is_none")]`). In `git_file_diff`, populate it with the `text`
already computed in the success path (`git.rs:880-885`); the binary / too-large / error early returns
keep `raw_patch: None`. No new git invocation, no behavior change to `hunks` — they remain as a
fallback and keep the existing Rust diff-parse tests valid.

**Renderer.** In `GitDiffPane`, keep the fetch, the six placeholder states, and the sticky header.
Replace the manual hunk render (`GitDiffPane.tsx:176-234`) with:

```ts
import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
// rawPatch is for a single file → take files[0]
const meta = useMemo(() => parsePatchFiles(diff.rawPatch ?? '').files[0] ?? null, [diff.rawPatch])
// fall back to the existing manual hunk render if rawPatch is absent (older state) or meta is null
```

`<FileDiff fileDiff={meta} options={options} />` with `options`:
- `theme`: the bundled Shiki theme name from `settings.diffThemeId`; `themeType`: `'dark' | 'light'`
  from the catalog's per-id scheme flag.
- `diffStyle`: `settings.diffViewStyle` (`'unified' | 'split'`).
- `overflow: 'wrap'` (matches today's wrapping pane).
- `disableFileHeader: true` (we keep our own sticky header at `GitDiffPane.tsx:169`).
- `unsafeCSS`: set the diff font-family/size to `--font-terminal` + `settings.terminalFontSize` so
  the "diff font follows terminal font" behavior (commit 5833a50) is preserved.

`@pierre/diffs` invokes Shiki itself (deduped onto our `shiki@4.2.0`; its range is `^3 || ^4`), so
`highlighter.ts`'s `initHighlighter`/`tokenizeLine`/`buildTerminalTheme` path is no longer used and
is deleted.

**Theme axis (github, paired to the app scheme).** New `shared/diffThemes.ts` mirroring
`terminalThemes.ts`'s shape: a `DiffThemeId` union of curated **bundled Shiki theme** ids,
`DIFF_THEME_ORDER`, `diffThemeLabel`, `isDiffThemeId`, `diffThemeScheme(id)` (`dark|light`, used for
`themeType`), plus pairing helpers `DEFAULT_DIFF_THEME_ID = 'github-dark'`,
`diffThemeForScheme(scheme)` (`light → 'github-light'`, else `'github-dark'`), and
`isDiffThemePaired(id)` (true for the `github-dark`/`github-light` family).

The default tracks the **app** scheme (the terminal theme is irrelevant to it), riding the *same*
pairing rails the terminal already uses (`store.ts:54-75,350-371`, `appThemes.ts:163-186`):

- **First run** — `pickDiffThemeId(id, appThemeId, fieldPresent)` in `normalizeSettings`: if the field
  is present and valid, keep it; otherwise default to `diffThemeForScheme(appThemeScheme(appThemeId))`.
- **First-open OS seed** (`store.ts:350-371`) — when the OS-seed flips the app theme to match system,
  also re-pair the diff theme to the new scheme **if it is still in the github family**
  (`isDiffThemePaired`). This is what makes a first launch on a light system land on `github-light`.
- **OS light/dark flip** (`store.ts:54-75`) — same rule: re-pair the diff theme alongside the terminal
  when the app theme flips, only while the diff theme is a github variant.
- **Explicit app-theme change** (`SettingsPage.tsx:135-137`, where it already sets the terminal pair) —
  if the diff theme is in the github family, set it to `diffThemeForScheme(appThemeScheme(next))`.

A deliberately-chosen non-github diff theme (e.g. `dracula`) is left untouched by every scheme flip —
matching how an off-pair (customized) terminal is preserved today. Otherwise the plumbing is identical
to `terminalThemeId`: a `Settings` field, the `Select` row in `SettingsPage` (copy the terminal-theme
block, `SettingsPage.tsx:254-275`), and writes through the existing `patchSettings`.

**Split/unified toggle.** Persisted as `Settings.diffViewStyle` (so it survives reloads), flipped by
a small segmented control in the pane header next to the file path. `GitDiffPane` reads it the same
way it reads `terminalThemeId` today (subscribe to the slice, not all of `settings`).

## Contract additions

`shared/types.ts`:
```ts
interface GitFileDiff {
  hunks: DiffHunk[]
  binary: boolean
  tooLarge: boolean
  rawPatch?: string        // NEW — full unified patch for this file (success path only)
  error?: string
}

interface Settings {
  // …
  diffThemeId: DiffThemeId            // NEW
  diffViewStyle: 'unified' | 'split'  // NEW
}
```

`shared/diffThemes.ts` (new) — curated bundled Shiki themes, e.g.:
`github-dark`, `github-light`, `vitesse-dark`, `vitesse-light`, `dracula`, `catppuccin-mocha`,
`catppuccin-latte`, `tokyo-night`, `nord`, `one-dark-pro`, `one-light`, `rose-pine`,
`rose-pine-dawn`, `ayu-dark`, `min-dark`, `min-light` (Shiki lazy-loads each on demand).
Default `github-dark`; `diffThemeForScheme('light') === 'github-light'`. Helpers:
`DIFF_THEME_ORDER`, `diffThemeLabel`, `isDiffThemeId`, `diffThemeScheme`, `diffThemeForScheme`,
`isDiffThemePaired`, `DEFAULT_DIFF_THEME_ID`.

## Relevant files

| Path | Change |
|------|--------|
| `src-tauri/src/model.rs:178` | add `raw_patch: Option<String>` to `GitFileDiff` |
| `src-tauri/src/git.rs:880-885` | return `raw_patch: Some(text)` on success; `None` on binary/too-large/error |
| `shared/types.ts:236-240` | `GitFileDiff.rawPatch?`; `Settings.diffThemeId` + `diffViewStyle` |
| `shared/diffThemes.ts` | NEW — `DiffThemeId` union, order, labels, guard, scheme map + pairing helpers (`diffThemeForScheme`, `isDiffThemePaired`, default) |
| `shared/settings.ts:41-56,157-193` | defaults + `pickDiffThemeId(id, appThemeId, fieldPresent)`/`pickDiffViewStyle` in `normalizeSettings` |
| `src/components/SettingsPage.tsx:135-137,254-275` | Diff theme `Select` row (mirror terminal-theme block) + view-style control; re-pair diff theme on app-theme change |
| `src/state/store.ts:54-75,350-371` | re-pair the diff theme (when in the github family) alongside the terminal in the OS-change listener and the first-open OS-seed block |
| `src/components/GitDiffPane.tsx:99-104,176-234` | parse `rawPatch` → `<FileDiff/>`; drop `tokenizeLine`; keep placeholders + header |
| `src/lib/highlighter.ts` | DELETE — only consumed by `GitDiffPane` |
| `src/components/GitDiffViewer.tsx:66-71,206-228` | P2: filter state + keyboard nav, pass to file list |
| `src/components/GitDiffFileList.tsx` | P2: filter input in header; selected-file scroll-into-view |
| `package.json` | add `@pierre/diffs`; remove `@shikijs/langs` (now unused) |

## Decisions (ADRs)

### ADR-001: Renderer swap to `@pierre/diffs` `<FileDiff/>`, keep the per-file Rust backend
- **Decision**: Render the right pane with `@pierre/diffs/react`'s `<FileDiff/>`, fed by our backend's
  raw patch. Keep `git_file_diff`'s per-file model, binary/too-large/error handling, `:(literal)`
  path safety, merge-base/source model, and stale-request sequencing.
- **Context**: The desired UX wins (split view + word-level diff + richer syntax themes) live in the
  *renderer*. The backend is already a strength; copying another app's backend would be a regression.
  Verified current package: `@pierre/diffs@1.2.10`, deps `shiki: ^3||^4` (dedupes onto our 4.2.0),
  `react ^18.3.1||^19` peer (we run 19) — no Shiki duplication, contrary to the original brief's
  v3-vs-v4 caveat (which assumed the older `1.0.4`).
- **Alternatives rejected**: **Hand-build split + word diff in our renderer** — large, error-prone,
  reinvents a maintained library. **Adopt Jean's backend** — ours is better; the UX gap is renderer-only.
- **Consequences**: New runtime dep (+ transitive `@pierre/theme`, `@pierre/theming`,
  `@shikijs/transformers`, `diff`, `hast-util-to-html`, `lru_map`); `vite build` is in the gate.

### ADR-002: Surface the raw patch via an additive `rawPatch`, keep `hunks` as fallback
- **Decision**: Add `raw_patch: Option<String>` to `GitFileDiff`, populated with the `text`
  `git_file_diff` already builds and currently discards. `<FileDiff/>` consumes `parsePatchFiles(rawPatch)`;
  `hunks` stays for the manual fallback render and keeps existing parse tests meaningful.
- **Context**: The success path holds the complete unified diff in `text` before `parse_unified_diff`
  (`git.rs:867,880-885`). No second git call is needed.
- **Alternatives rejected**: **Drop `hunks` entirely** — loses the safe fallback and invalidates tests
  with no benefit. **Re-fetch the patch separately** — redundant git invocation.
- **Consequences**: `GitFileDiff` carries both shapes; `rawPatch` is `None` for binary/too-large/error
  (the renderer already branches to placeholders before parsing).

### ADR-003: A dedicated diff theme axis (bundled Shiki themes), github paired to the app scheme
- **Decision**: Diffs get their own `diffThemeId` setting drawn from **bundled Shiki code themes**,
  decoupled from `terminalThemeId`. Its *default* is github, **paired to the app/OS scheme**
  (`github-dark`/`github-light`) via the existing terminal-pairing rails: first-run default from the
  app scheme, and a re-pair to the matching github variant on OS-seed, OS flip, and explicit app-theme
  change — but only while the diff theme is still in the github family. A user who picks a non-github
  theme keeps it across scheme flips. Delete `highlighter.ts`'s terminal-palette→TextMate derivation
  and `tokenizeLine` path; `@pierre/diffs` owns highlighting.
- **Context**: `buildTerminalTheme` (`highlighter.ts:38-68`) maps 16 ANSI colors onto many scopes —
  lossy for code review. Purpose-built themes are richer and are exactly what `<FileDiff/>` consumes.
  The user wants diffs decoupled from the *terminal* theme, but the github default to track light/dark
  with the app (so a light system/app gets a light diff theme out of the box). The "pair only while
  in the github family" rule mirrors how an off-pair (customized) terminal is left untouched on an OS
  flip (`store.ts:66,359`).
- **Alternatives rejected**: **Fully independent fixed default** (never tracks the app scheme) — a
  light-system user would open to a dark diff. **Force-pair to github on every app-theme change**
  (clobbering a chosen `dracula`) — surprising; inconsistent with the terminal's off-pair handling.
  **Keep diffs bound to the terminal palette** via `createCSSVariablesTheme`/`registerCustomTheme` —
  keeps the lossy mapping as the only option (re-addable later as an optional "Match terminal" entry;
  see Open questions).
- **Consequences**: Choosing a *terminal* theme no longer restyles diffs (intended); the app theme's
  scheme does drive the github default. `highlighter.ts` and the explicit `@shikijs/langs/*` imports
  go away; the `@shikijs/langs` dependency can be removed. Diff pairing adds three small touch points
  alongside the terminal's existing ones.

### ADR-004: Keep single-file-at-a-time pane (not a stacked all-files scroll)
- **Decision**: Preserve our model — the sidebar selects one file; the pane shows that file's diff.
  Do not adopt the "all files stacked in one scroll with per-file sticky headers" layout.
- **Context**: Our viewer, stale-request sequencing, and focus-refresh are built around one selected
  file; it stays responsive on large changesets without virtualizing a giant concatenated patch.
- **Alternatives rejected**: **Stacked multi-file scroll** — larger rewrite of `GitDiffViewer`'s load
  model for marginal benefit given a fast sidebar.
- **Consequences**: `disableFileHeader: true` on `<FileDiff/>`; we keep our own sticky header.

### ADR-005: Persist split/unified as a setting
- **Decision**: `Settings.diffViewStyle` (`'unified' | 'split'`, default `'unified'`), toggled in the
  pane header.
- **Context**: A review-layout preference should survive reloads, like theme/font choices.
- **Alternatives rejected**: **Component-local state** — resets every navigation. **Per-file** — no need.
- **Consequences**: One more validated settings field (`pickDiffViewStyle`).

### ADR-006: Preserve "diff font follows terminal font" via `unsafeCSS`
- **Decision**: Pass `unsafeCSS` to `<FileDiff/>` setting font-family to `--font-terminal` and
  font-size to `settings.terminalFontSize`.
- **Context**: Commit 5833a50 deliberately synced diff font size to the terminal font; the swap must
  not regress it. `@pierre/diffs` renders its own DOM, so we style it through its CSS hook.
- **Alternatives rejected**: **A separate diff font setting** — scope creep; not requested.
- **Consequences**: Diff text continues to match terminal typography.

## Vertical slices

### Slice 1 — Renderer swap + theme axis (P1)
- **Delivers**: `<FileDiff/>` renders the selected file with working split/unified (persisted toggle);
  `diffThemeId` setting + Settings selector restyle diffs with bundled Shiki themes; diff font/size
  still follows the terminal font; all six placeholder states preserved; `highlighter.ts` deleted;
  backend returns `rawPatch`.
- **Files**: `model.rs`, `git.rs`, `shared/types.ts`, `shared/diffThemes.ts`, `shared/settings.ts`,
  `SettingsPage.tsx`, `GitDiffPane.tsx`, delete `src/lib/highlighter.ts`, `package.json`
  (+`@pierre/diffs`, −`@shikijs/langs`).
- **Verification**: `pnpm check` green (incl. `vite build` confirms `@pierre/diffs` + Shiki bundle and
  `cargo test` diff-parse still pass). Manual in `pnpm tauri dev`: select a file → renders via
  `<FileDiff/>`; toggle split/unified → layout switches and persists across reload; change the diff
  theme → colors change, terminal theme unaffected; change terminal font size → diff text resizes;
  binary / >500 KB / error / no-diff files show their placeholders; word-level intra-line diff visible
  on a modified line. **Pairing**: fresh profile on a light system opens to `github-light`; switching
  the app theme between a light and a dark variant flips the diff theme github-light↔github-dark; after
  manually choosing `dracula`, an app-theme switch leaves it on `dracula`.

### Slice 2 — Sidebar polish (P2)
- **Delivers**: a filter box in the file-list header (substring match on path, selection resets to the
  first match); `/` focuses the filter; `j`/`k` and ↓/↑ move the selection among filtered files;
  selected file scrolls into view.
- **Files**: `GitDiffFileList.tsx` (filter input + scroll-into-view), `GitDiffViewer.tsx` (filter
  state, keyboard handler, pass filtered list + handlers).
- **Verification**: `pnpm check` green. Manual: type in filter → list narrows, first match selected; `/`
  focuses from anywhere in the page; `j`/`k` walk the list and load each diff; selected row stays
  visible; clearing the filter restores the full list without losing a valid selection.

### Slice 3 — Actions (P3, deferred)
- **Delivers**: per-file **revert** (confirm via the existing `dialog.confirm*` seam), then optional
  selected-file **commit**. Scoped out of the initial effort; specify separately if pursued.
- **Files**: new Rust `git_revert_file` / commit commands (`git.rs`), `bridge.ts`, file-list actions.
- **Verification**: TBD when scheduled.

## Risks

- **New dependency surface** — `@pierre/diffs` + transitive deps. Mitigation: `vite build` in the gate;
  Shiki dedupes onto our 4.2.0; themes/langs lazy-load.
- **`unsafeCSS` is a raw style hook** — malformed CSS could break diff layout. Mitigation: a small,
  reviewed static string driven only by our own font vars/size.
- **`parsePatchFiles` edge cases** — empty/odd patches (e.g. mode-only changes). Mitigation: guard
  `files[0] ?? null` and fall back to the retained manual hunk render / placeholders.
- **Theme bundle/perf** — many bundled themes. Mitigation: Shiki loads a theme only when selected.
- **Behavior regression on diff font** — covered by ADR-006 + a manual check.

## Rollback

Additive and contained. Backend: `raw_patch` is optional and ignored if unused — revert is a field
removal. Frontend: restoring `GitDiffPane`'s manual render + `highlighter.ts` (from git) and removing
the `@pierre/diffs` import returns prior behavior; the new settings fields are ignored if absent
(`normalizeSettings` defaults them). A straight `git revert` of the feature commit(s) restores the old
viewer. No DB/schema/migration.

## Tests

- **Rust `cargo test`**: existing `parse_unified_diff` tests remain valid (`hunks` unchanged); add an
  assertion that `git_file_diff` populates `raw_patch` on success and leaves it `None` for
  binary/too-large/error.
- **Gate**: `pnpm check` = `tsc --noEmit` + `vite build` (confirms `@pierre/diffs`/Shiki bundle) +
  `cargo check` + `cargo clippy -D warnings` + `cargo test`.
- **Manual**: the per-slice steps above, in `pnpm tauri dev` (restart after Rust changes — `pnpm dev`
  does not watch the backend).

## Open questions

- **"Match terminal" entry**: whether to offer one synthetic option that re-registers the existing
  `gc-term-*` themes via `registerCustomTheme` (keeps `buildTerminalTheme` alive) — deferred per ADR-003.
- **ADR home**: whether `docs/ADR.md` needs a standalone `@pierre/diffs` stack-dependency ADR, or
  ADR-001 here suffices.
</content>
</invoke>
