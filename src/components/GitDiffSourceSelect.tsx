import { useState } from 'react'
import type { DiffSource } from '@shared/types'
import { GitDropdown } from './GitDropdown'

interface GitDiffSourceSelectProps {
  /** Active diff source (working changes or a branch comparison). */
  source: DiffSource
  /** Local branches offered for comparison (current branch already filtered). */
  branches: string[]
  /** Called when the user picks a new source. */
  onChange(source: DiffSource): void
}

type Mode = 'working' | 'branch'

/**
 * ------------------------------------------------
 * Source selector for the Git diff viewer: a mode dropdown (Working changes /
 * Compare to branch) plus, in branch mode, a branch picker. Built on the `ui/`
 * layer via `GitDropdown` (ADR-010), not `CommitDropdown`.
 *
 * `mode` is held locally so "Compare to branch" can stay selected — showing the
 * branch picker disabled/empty — before a branch is chosen or while none are
 * loaded, without ever emitting an invalid branch source. The parent remounts
 * this component on a worktree switch (key=worktree), which re-derives `mode`
 * from the reset source.
 * @param {GitDiffSourceSelectProps} props - Component props.
 * @returns {JSX.Element} Source selector.
 */
export function GitDiffSourceSelect({ source, branches, onChange }: GitDiffSourceSelectProps) {
  const [mode, setMode] = useState<Mode>(source.kind)
  const hasBranches = branches.length > 0
  const branch = source.kind === 'branch' ? source.branch : ''

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <GitDropdown
        icon="file-diff"
        title="Diff source"
        className="w-full"
        value={mode}
        options={[
          { value: 'working', label: 'Working changes' },
          { value: 'branch', label: 'Compare to branch' }
        ]}
        onSelect={(next) => {
          const nextMode = next as Mode
          setMode(nextMode)
          if (nextMode === 'branch') {
            // Auto-pick the first branch so the comparison loads immediately;
            // when none are loaded, defer to the (disabled) branch picker.
            if (hasBranches) onChange({ kind: 'branch', branch: branches[0] })
          } else {
            onChange({ kind: 'working' })
          }
        }}
      />
      {mode === 'branch' && (
        <GitDropdown
          icon="branch"
          title="Compare against branch"
          className="w-full"
          value={branch}
          options={branches.map((name) => ({ value: name, label: name }))}
          disabled={!hasBranches}
          placeholder={hasBranches ? 'Select branch' : 'No branches'}
          onSelect={(name) => onChange({ kind: 'branch', branch: name })}
        />
      )}
    </div>
  )
}
