import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { GitDiffFile, GitFileStatus } from '@shared/types'
import { Icon } from './Icon'
import { IconButton } from './ui/IconButton'

interface GitDiffFileListProps {
  /** Changed files for the active worktree and source. */
  files: GitDiffFile[]
  /** Whether the file list is currently being fetched. */
  loading: boolean
  /** Top-level error fetching the file list, if any. */
  error: string | null
  /** Path of the currently selected file, or null. */
  selectedFile: string | null
  /** Source selector (working changes / compare-to-branch) shown in the header. */
  sourceSelect: ReactNode
  /** Code font-size control (A−/A+) shown in the header toolbar. */
  fontControl: ReactNode
  /** Called when the user selects a file. */
  onSelect(path: string): void
  /** Called by the manual refresh button. */
  onRefresh(): void
  /** Called by the close button to return to the workspace. */
  onClose(): void
}

const STATUS_LABELS: Record<GitFileStatus, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  copied: 'Copied',
  untracked: 'Untracked'
}

/** Single-letter status glyphs shown in the per-file chip. */
const STATUS_LETTERS: Record<GitFileStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U'
}

/** Split a repo-relative path into its trailing filename and leading directory.
 * Root-level files (no slash) report '/' so they still show a directory line. */
function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/')
  return i === -1 ? { dir: '/', name: path } : { dir: path.slice(0, i), name: path.slice(i + 1) }
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

/**
 * ------------------------------------------------
 * Left pane of the Git diff viewer: header, refresh/close actions, and the
 * scrollable list of changed files with status and ± counts.
 * @param {GitDiffFileListProps} props - Component props.
 * @returns {JSX.Element} File list pane.
 */
export function GitDiffFileList({
  files,
  loading,
  error,
  selectedFile,
  sourceSelect,
  fontControl,
  onSelect,
  onRefresh,
  onClose
}: GitDiffFileListProps) {
  const totalInsertions = files.reduce((sum, f) => sum + f.insertions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  return (
    <div className="flex w-[var(--git-diff-list-w)] shrink-0 flex-col border-r border-line-soft bg-surface/30">
      {/* Source selector on the left; refresh/close pinned top-right so they
          stay put when the branch picker adds a second row in branch mode. */}
      <div className="flex shrink-0 items-start gap-2 border-b border-line-soft p-2">
        <div className="min-w-0 flex-1">{sourceSelect}</div>
        <div className="flex shrink-0 items-center gap-1">
          {fontControl}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-line-soft" aria-hidden />
          <IconButton
            tooltip="Refresh"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className={cn(loading && 'animate-spin')}
          >
            <Icon name="refresh-cw" size={14} />
          </IconButton>
          <IconButton tooltip="Close" size="sm" onClick={onClose}>
            <Icon name="close" size={14} />
          </IconButton>
        </div>
      </div>

      {!loading && files.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft px-3 py-1.5 text-body-2xs tabular-nums text-cream-ghost">
          <span>{files.length} file{files.length === 1 ? '' : 's'}</span>
          {totalInsertions > 0 && <span className="text-teal">+{totalInsertions}</span>}
          {totalDeletions > 0 && <span className="text-ember">−{totalDeletions}</span>}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {error && (
          <div className="m-3 rounded-md border border-ember/30 bg-ember/10 p-3 text-body-sm text-ember">
            {error}
          </div>
        )}

        {!error && files.length === 0 && !loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-cream-ghost">
            <Icon name="check" size={28} />
            <span className="text-body text-cream-dim">No changes</span>
          </div>
        )}

        {!error && files.length === 0 && loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-cream-dim">
            <Icon name="refresh-cw" size={24} className="animate-spin" />
            <span className="text-body-sm">Loading changes…</span>
          </div>
        )}

        {files.map((file) => {
          const selected = selectedFile === file.path
          const { dir, name } = splitPath(file.path)
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelect(file.path)}
              title={`${STATUS_LABELS[file.status]} · ${file.path}`}
              className={cn(
                'group flex items-center gap-2.5 border-l-2 px-3 py-1.5 text-left transition-colors duration-150',
                selected
                  ? 'border-orange bg-orange/10'
                  : 'border-transparent hover:bg-orange/5'
              )}
            >
              <span
                className={cn(
                  'w-3.5 shrink-0 text-center font-terminal text-body-sm font-bold',
                  statusColor(file.status)
                )}
              >
                {STATUS_LETTERS[file.status]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    'truncate font-medium text-body-sm',
                    selected ? 'text-cream' : 'text-cream-dim group-hover:text-cream'
                  )}
                >
                  {name}
                </span>
                {dir && <span className="truncate text-body-2xs text-cream-ghost">{dir}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 self-center font-terminal text-body-2xs tabular-nums">
                {file.binary ? (
                  <span className="text-cream-ghost">bin</span>
                ) : (
                  <>
                    {file.insertions > 0 && <span className="text-teal">+{file.insertions}</span>}
                    {file.deletions > 0 && <span className="text-ember">−{file.deletions}</span>}
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
