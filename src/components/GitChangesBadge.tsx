import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/**
 * ------------------------------------------------
 * Titlebar working-tree changes badge (sits beside the branch picker). Shows
 * just the diff icon when the selected worktree is clean and expands to the
 * changed-file count plus inserted/deleted line totals once there are changes.
 * @returns {JSX.Element | null} Changes badge, or null outside a git repo.
 */
export function GitChangesBadge() {
  const activeProjectId = useStore((s) => s.activeProjectId)
  const view = useStore((s) => s.view)
  const status = useStore((s) => (activeProjectId ? s.gitStatus[activeProjectId] : undefined))
  const refreshGitStatus = useStore((s) => s.refreshGitStatus)
  const setView = useStore((s) => s.setView)

  // Working-tree changes shift as agents edit files, so poll while the window
  // is focused to keep the badge roughly live without churning in the
  // background. refreshGit already covers the on-focus refresh elsewhere.
  useEffect(() => {
    if (!activeProjectId) return
    void refreshGitStatus(activeProjectId)
    const id = window.setInterval(() => {
      if (document.hasFocus()) void refreshGitStatus(activeProjectId)
    }, 4000)
    return () => window.clearInterval(id)
  }, [activeProjectId, refreshGitStatus])

  // Nothing to summarise outside a git repository.
  if (status && !status.isRepository) return null

  const changed = status?.filesChanged ?? 0
  const dirty = changed > 0
  const open = view === 'gitDiff'

  return (
    <button
      type="button"
      onClick={() => setView(open ? 'workspace' : 'gitDiff')}
      className={cn(
        'app-no-drag flex h-7 cursor-pointer items-center gap-2 rounded-md border-[0.5px] px-2.5 text-body-sm font-semibold transition-all duration-150',
        open
          ? 'border-orange bg-orange/10 text-orange-bright'
          : dirty
            ? 'border-line text-cream hover:border-orange hover:bg-orange/10 hover:text-orange-bright'
            : 'border-line-soft text-cream-ghost hover:border-orange/50 hover:bg-orange/5 hover:text-cream'
      )}
      title={
        open
          ? 'Close diff viewer'
          : dirty
            ? `${changed} changed file${changed === 1 ? '' : 's'}`
            : 'No changes'
      }
    >
      <Icon
        name="file-diff"
        size={14}
        className={open ? 'text-orange-bright' : dirty ? 'text-orange' : 'opacity-60'}
      />
      {dirty && status && (
        <span className="flex items-center gap-2 tabular-nums">
          <span className="text-cream-dim">{changed}</span>
          <span style={{ color: 'var(--teal)' }}>+{status.insertions}</span>
          <span style={{ color: 'var(--ember)' }}>-{status.deletions}</span>
        </span>
      )}
    </button>
  )
}
