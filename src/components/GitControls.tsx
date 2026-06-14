import { useEffect, useMemo, useState } from 'react'
import type { GitWorktree, Project } from '@shared/types'
import { useStore } from '@/state/store'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorDialog } from './ErrorDialog'
import { GitDropdown } from './GitDropdown'
import { IconButton } from './ui/IconButton'
import { Icon } from './Icon'
import { NewWorktreeDialog } from './NewWorktreeDialog'

interface GitControlsProps {
  project: Project
}

/**
 * ------------------------------------------------
 * Titlebar git worktree and branch dropdowns for the active project.
 * @param {GitControlsProps} props - Component props.
 * @returns {JSX.Element} Git controls element.
 */
export function GitControls({ project }: GitControlsProps) {
  const gitInfo = useStore((state) => state.git[project.id])
  const loading = useStore((state) => !!state.gitLoading[project.id])
  const refreshGit = useStore((state) => state.refreshGit)
  const selectWorktree = useStore((state) => state.selectWorktree)
  const checkoutBranch = useStore((state) => state.checkoutBranch)
  const removeWorktree = useStore((state) => state.removeWorktree)
  const addWorktree = useStore((state) => state.addWorktree)
  const gitError = useStore((state) => state.gitErrors[project.id])
  const clearGitError = useStore((state) => state.clearGitError)
  const [worktreeToDelete, setWorktreeToDelete] = useState<GitWorktree | null>(null)
  const [newWorktreeOpen, setNewWorktreeOpen] = useState(false)

  // Branches/worktrees change outside the app (e.g. in a session terminal), so
  // re-read on refocus as well; dropdowns also refresh themselves on open.
  useEffect(() => {
    void refreshGit(project.id)
    const onFocus = () => void refreshGit(project.id)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [project.id, refreshGit])

  const worktrees = gitInfo?.worktrees ?? [
    {
      path: project.path,
      label: 'main',
      branch: null,
      head: null,
      isMain: true,
      detached: false
    }
  ]
  const selectedWorktreePath = worktrees.some(
    (worktree) => worktree.path === project.activeWorktreePath
  )
    ? (project.activeWorktreePath ?? project.path)
    : (worktrees[0]?.path ?? project.path)
  const selectedWorktree =
    worktrees.find((worktree) => worktree.path === selectedWorktreePath) ?? worktrees[0]
  const selectedBranch = selectedWorktree?.branch ?? ''
  const branchOptions = useMemo(() => {
    const branches = gitInfo?.branches ?? []
    const lockedBranches = new Set(
      worktrees
        .filter((worktree) => worktree.path !== selectedWorktreePath)
        .map((worktree) => worktree.branch)
        .filter((branch): branch is string => !!branch)
    )
    const availableBranches = branches.filter(
      (branch) => branch === selectedBranch || !lockedBranches.has(branch)
    )
    if (selectedBranch && !availableBranches.includes(selectedBranch)) {
      return [selectedBranch, ...availableBranches]
    }
    return availableBranches
  }, [gitInfo?.branches, selectedBranch, selectedWorktreePath, worktrees])
  const isRepository = gitInfo?.isRepository ?? true
  const branchPlaceholder = !isRepository
    ? 'No git repo'
    : loading
      ? 'Loading…'
      : selectedWorktree?.detached
        ? 'detached'
        : 'No branches'

  return (
    <>
      <GitDropdown
        icon="worktree"
        title="Git worktree"
        className="w-[120px]"
        value={selectedWorktreePath}
        options={worktrees.map((worktree) => ({
          value: worktree.path,
          label: worktree.label,
          deletable: !worktree.isMain
        }))}
        disabled={loading || worktrees.length <= 1}
        deleteTitle="Delete worktree"
        onOpen={() => void refreshGit(project.id)}
        onSelect={(worktreePath) => selectWorktree(project.id, worktreePath)}
        onDelete={(worktreePath) => {
          const worktree = worktrees.find((candidate) => candidate.path === worktreePath)
          if (worktree) setWorktreeToDelete(worktree)
        }}
      />

      <IconButton
        tooltip="New worktree"
        disabled={loading || !isRepository || (gitInfo?.branches ?? []).length === 0}
        onClick={() => setNewWorktreeOpen(true)}
      >
        <Icon name="git-fork" size={14} />
      </IconButton>

      <GitDropdown
        icon="branch"
        title="Git branch"
        className="w-[132px]"
        value={selectedBranch}
        options={branchOptions.map((branch) => ({ value: branch, label: branch }))}
        disabled={loading || !isRepository || branchOptions.length === 0}
        placeholder={branchPlaceholder}
        onSelect={(branch) => void checkoutBranch(project.id, branch)}
        onOpen={() => void refreshGit(project.id)}
      />

      <NewWorktreeDialog
        open={newWorktreeOpen}
        branches={gitInfo?.branches ?? []}
        defaultBranch={selectedBranch || (gitInfo?.branches[0] ?? '')}
        onCancel={() => setNewWorktreeOpen(false)}
        onCreate={(name, baseBranch) => {
          setNewWorktreeOpen(false)
          void addWorktree(project.id, name, baseBranch)
        }}
      />
      <ConfirmDialog
        open={!!worktreeToDelete}
        title="Delete worktree"
        message={`Delete worktree "${worktreeToDelete?.label}"?`}
        detail="The worktree folder is removed and uncommitted changes in it are lost. Agent sessions and terminals pinned to this worktree are closed and removed."
        checkboxLabel={
          worktreeToDelete?.branch
            ? `Also delete branch "${worktreeToDelete.branch}"`
            : undefined
        }
        confirmLabel="Delete"
        onCancel={() => setWorktreeToDelete(null)}
        onConfirm={(deleteBranch) => {
          if (worktreeToDelete) {
            void removeWorktree(project.id, worktreeToDelete.path, deleteBranch)
          }
          setWorktreeToDelete(null)
        }}
      />
      <ErrorDialog
        open={!!gitError}
        title={gitError?.title ?? ''}
        message={gitError?.message ?? ''}
        output={gitError?.output}
        onClose={() => clearGitError(project.id)}
      />
    </>
  )
}
