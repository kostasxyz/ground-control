import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import type { DiffSource, GitDiffFile, GitFileDiff, GitFileStatus } from '@shared/types'
import { Icon } from './Icon'
import { initHighlighter, isReady, tokenizeLine, langForFile } from '@/lib/highlighter'
import { useStore } from '@/state/store'

/** Single-letter status glyphs for the header chip. */
const STATUS_LETTERS: Record<GitFileStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U'
}

function statusColor(status: GitFileStatus): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-teal'
    case 'deleted':
      return 'text-ember'
    case 'renamed':
    case 'copied':
      return 'text-gold'
    default:
      return 'text-cream-dim'
  }
}

/** Split a repo-relative path into its trailing filename and leading directory.
 * Root-level files (no slash) report '/' so the header shows e.g. "/notes.md". */
function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/')
  return i === -1 ? { dir: '/', name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) }
}

interface GitDiffPaneProps {
  /** Worktree directory the diff is scoped to. */
  worktreePath: string
  /** Diff source (working changes or branch comparison). */
  source: DiffSource
  /** Selected file, or null when nothing is selected. */
  file: GitDiffFile | null
}

/**
 * ------------------------------------------------
 * Right pane of the Git diff viewer. Fetches and renders the unified diff for
 * the selected file, including binary/too-large/error placeholders.
 * Depends only on primitive fields so the fetch doesn't retrigger on unrelated
 * parent renders (e.g. drag width changes or refresh loading state flips).
 * @param {GitDiffPaneProps} props - Component props.
 * @returns {JSX.Element} Diff pane.
 */
export function GitDiffPane({ worktreePath, source, file }: GitDiffPaneProps) {
  const [diff, setDiff] = useState<GitFileDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [hlReady, setHlReady] = useState(isReady())
  // Diff colours follow the TERMINAL theme (a shared code surface), not the app
  // chrome theme — change the terminal theme and the diff restyles with it.
  const terminalThemeId = useStore((s) => s.settings.terminalThemeId)
  const langId = file ? langForFile(file.path) : null

  // Derive stable primitive keys so the effect doesn't fire when the parent
  // creates a new source object reference (e.g. inline literal in JSX) or a
  // new file object identity on every load.
  const sourceKind = source.kind
  const sourceBranch = source.kind === 'branch' ? source.branch : ''

  useEffect(() => {
    const filePath = file?.path
    const fileOldPath = file?.oldPath

    if (!filePath) {
      setDiff(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setDiff(null)

    const diffSource: DiffSource =
      sourceBranch ? { kind: 'branch', branch: sourceBranch } : { kind: 'working' }

    window.gc.git
      .fileDiff(worktreePath, diffSource, filePath, fileOldPath)
      .then((result) => {
        if (!cancelled) setDiff(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    worktreePath,
    sourceKind,
    sourceBranch,
    file?.path,
    file?.oldPath
  ])

  // Initialise the Shiki highlighter once; rendering starts plain and upgrades
  // to coloured spans once the engine/grammars have loaded (ADR-006).
  useEffect(() => {
    let cancelled = false

    if (!isReady()) {
      initHighlighter()
        .then(() => {
          if (!cancelled) setHlReady(true)
        })
        .catch(() => {
          if (!cancelled) setHlReady(false)
        })
    }

    return () => {
      cancelled = true
    }
  }, [])

  // Tokenise the whole diff once per [diff, lang, theme] rather than re-running
  // Shiki for every line on every render (e.g. each file-list resize-drag frame).
  const highlighted = useMemo(() => {
    if (!diff || !hlReady || !langId) return null
    return diff.hunks.map((hunk) =>
      hunk.lines.map((line) => tokenizeLine(langId, line.text, terminalThemeId))
    )
  }, [diff, hlReady, langId, terminalThemeId])

  if (!file) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-cream-ghost">
        <Icon name="file-diff" size={32} className="opacity-40" />
        <span className="text-body text-cream-dim">Select a file to view its diff</span>
      </div>
    )
  }

  if (loading || !diff) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 text-cream-dim">
        <Icon name="refresh-cw" size={24} className="animate-spin" />
        <span className="text-body-sm">Loading diff…</span>
      </div>
    )
  }

  if (diff.error) {
    return (
      <div className="flex min-w-0 flex-1 items-start justify-center p-6">
        <div className="max-w-xl rounded-md border border-ember/30 bg-ember/10 p-4 text-body-sm text-ember">
          {diff.error}
        </div>
      </div>
    )
  }

  if (diff.binary) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-cream-ghost">
        <Icon name="file-diff" size={32} className="opacity-40" />
        <span className="text-body text-cream-dim">Binary file — no diff</span>
        <span className="text-body-sm text-cream-ghost">{file.path}</span>
      </div>
    )
  }

  if (diff.tooLarge) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-cream-ghost">
        <Icon name="file-diff" size={32} className="opacity-40" />
        <span className="text-body text-cream-dim">Diff too large</span>
        <span className="max-w-md px-6 text-center text-body-sm text-cream-ghost">
          {file.path} exceeds the safe inline diff size. Open it in an external
          editor or terminal.
        </span>
      </div>
    )
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-cream-ghost">
        <Icon name="file-diff" size={32} className="opacity-40" />
        <span className="text-body text-cream-dim">No diff</span>
        <span className="text-body-sm text-cream-ghost">{file.path}</span>
      </div>
    )
  }

  const { dir, name } = splitPath(file.path)

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-auto bg-term-bg/70">
      <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2.5 border-b border-line-soft bg-surface/80 px-4 backdrop-blur-sm">
        <span
          className={cn('shrink-0 font-terminal text-body-sm font-bold', statusColor(file.status))}
          title={file.status}
        >
          {STATUS_LETTERS[file.status]}
        </span>
        <span className="min-w-0 truncate font-display text-heading-2xs font-bold">
          {dir && <span className="font-medium text-cream-ghost">{dir}</span>}
          <span className="text-cream">{name}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 font-terminal text-body-2xs tabular-nums">
          {file.insertions > 0 && <span className="text-teal">+{file.insertions}</span>}
          {file.deletions > 0 && <span className="text-ember">−{file.deletions}</span>}
        </span>
      </div>

      <div className="min-w-0 flex-1 font-terminal text-[length:var(--git-diff-font-size,var(--terminal-font-size))] leading-[1.5]">
        {diff.hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex}>
            <div className="select-text border-y border-line-soft bg-orange/[0.06] px-3 py-1 text-body-2xs text-cream-ghost">
              @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
              {hunk.header ? ` ${hunk.header}` : ''}
            </div>
            {hunk.lines.map((line, lineIndex) => {
              const added = line.kind === 'add'
              const deleted = line.kind === 'delete'
              const gutterTone = added
                ? 'text-teal/70'
                : deleted
                  ? 'text-ember/70'
                  : 'text-cream-ghost/60'
              return (
                <div
                  key={lineIndex}
                  className={cn(
                    // em-based gutter so the line-number columns scale with the
                    // diff font size and keep room for the digits at any zoom.
                    'grid grid-cols-[3.5em_3.5em_1fr] items-start',
                    added && 'bg-teal/[0.09]',
                    deleted && 'bg-ember/[0.09]'
                  )}
                >
                  <span
                    className={cn(
                      'select-none bg-line-dark/40 px-1.5 py-px text-right tabular-nums',
                      gutterTone
                    )}
                  >
                    {line.oldLine ?? ''}
                  </span>
                  <span
                    className={cn(
                      'select-none border-r border-line-soft bg-line-dark/40 px-1.5 py-px text-right tabular-nums',
                      gutterTone
                    )}
                  >
                    {line.newLine ?? ''}
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap break-words py-px pr-4 pl-3 text-cream-dim">
                    <span
                      className={cn(
                        'inline-block w-3 select-none',
                        added ? 'text-teal' : deleted ? 'text-ember' : 'text-transparent'
                      )}
                    >
                      {added ? '+' : deleted ? '−' : ' '}
                    </span>
                    {highlighted
                      ? (() => {
                          const tokens = highlighted[hunkIndex]?.[lineIndex]
                          return tokens
                            ? tokens.map((t, i) => (
                                <span key={i} style={t.color ? { color: t.color } : undefined}>
                                  {t.content}
                                </span>
                              ))
                            : line.text
                        })()
                      : line.text}
                    {line.noTrailingNewline && (
                      <span className="ml-1 text-cream-ghost">\ No newline at end of file</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
