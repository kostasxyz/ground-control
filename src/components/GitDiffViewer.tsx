import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '@/state/store'
import { selectedWorktreeKey } from '@/state/worktreeScope'
import type { DiffSource, GitDiffFile } from '@shared/types'
import {
  clampGitDiffFileListWidth,
  GIT_DIFF_FILE_LIST_DEFAULT
} from '@/lib/constants'
import { useResizeHandle, ResizeHandle } from '@/components/ui/ResizeHandle'
import { GitDiffFileList } from './GitDiffFileList'
import { GitDiffPane } from './GitDiffPane'
import { GitDiffSourceSelect } from './GitDiffSourceSelect'

/**
 * ------------------------------------------------
 * Stable working-changes source — never recreated on render, so it can be the
 * default and the reset target without retriggering source-keyed effects.
 */
const WORKING_SOURCE: DiffSource = { kind: 'working' }

/**
 * ------------------------------------------------
 * Stable string key for a diff source, used to tag loaded file lists (like
 * `filesWorktreeKey`) so a source switch can't show or feed the diff pane a
 * file list belonging to the previous source.
 * @param {DiffSource} source - Diff source.
 * @returns {string} `'working'` or `'branch:<name>'`.
 */
function diffSourceKey(source: DiffSource): string {
  return source.kind === 'branch' ? `branch:${source.branch}` : 'working'
}

/**
 * ------------------------------------------------
 * Full-page working-changes viewer. Shows a two-pane layout with the
 * changed-file list on the left and the unified diff for the selected
 * file on the right. Scoped to the active project's selected worktree;
 * re-loads when the worktree changes and refreshes on window focus.
 * @returns {JSX.Element | null} Git diff viewer, or null if no project is active.
 */
export function GitDiffViewer() {
  const activeProjectId = useStore((s) => s.activeProjectId)
  const projects = useStore((s) => s.projects)
  const patchSettings = useStore((s) => s.patchSettings)
  const setView = useStore((s) => s.setView)
  // Branch list + worktrees come from the already-loaded project-keyed git info
  // (git:info) — no new IPC/branch channel for the diff viewer (ADR-009).
  const gitInfo = useStore((s) => (activeProjectId ? s.git[activeProjectId] : undefined))

  const project = useMemo(
    () => projects.find((p) => p.id === activeProjectId && !p.archived) ?? null,
    [projects, activeProjectId]
  )
  const worktreeKey = project ? selectedWorktreeKey(project) : ''

  // Branches offered for comparison: local heads minus the active worktree's own
  // branch (self-compare yields an empty diff). git:info supplies local heads
  // only, so merge-base always resolves without fetching (ADR-003).
  const branchOptions = useMemo(() => {
    const all = gitInfo?.branches ?? []
    const current = gitInfo?.worktrees.find((w) => w.path === worktreeKey)?.branch ?? null
    return current ? all.filter((b) => b !== current) : all
  }, [gitInfo, worktreeKey])

  const [files, setFiles] = useState<GitDiffFile[]>([])
  const [filesWorktreeKey, setFilesWorktreeKey] = useState<string | null>(null)
  const [filesSourceKey, setFilesSourceKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // Diff source (working changes vs branch compare), component-local per ADR-004.
  // Tagged with the worktree it belongs to so a worktree switch reverts to
  // Working immediately — without a stale-source fetch — and a return to a
  // previously-compared worktree still opens in Working.
  const [source, setSource] = useState<DiffSource>(WORKING_SOURCE)
  const [sourceWorktreeKey, setSourceWorktreeKey] = useState<string | null>(null)

  const activeSource: DiffSource =
    sourceWorktreeKey === worktreeKey ? source : WORKING_SOURCE
  const activeSourceBranch = activeSource.kind === 'branch' ? activeSource.branch : ''
  const activeSourceKey = diffSourceKey(activeSource)

  // Clear the remembered source on every worktree switch (the derivation above
  // already shows Working this render; this also erases round-trip memory).
  useEffect(() => {
    setSource(WORKING_SOURCE)
    setSourceWorktreeKey(worktreeKey)
    // Don't carry a file selection across worktrees — a same-named file in the
    // new worktree would otherwise be auto-selected and diffed without the user
    // ever picking it.
    setSelectedPath(null)
  }, [worktreeKey])

  const changeSource = useCallback(
    (next: DiffSource) => {
      setSource(next)
      setSourceWorktreeKey(worktreeKey)
    },
    [worktreeKey]
  )

  // Request sequencing: track the latest load request id so stale async
  // responses (e.g. after a worktree switch) don't overwrite newer data.
  const loadReqRef = useRef(0)

  const loadFiles = useCallback(async () => {
    if (!worktreeKey) return
    const reqId = ++loadReqRef.current

    // Rebuild the source from the primitive branch key so this callback's
    // identity only changes when the source actually changes (working ⇒ '').
    const reqSource: DiffSource = activeSourceBranch
      ? { kind: 'branch', branch: activeSourceBranch }
      : { kind: 'working' }
    const reqSourceKey = diffSourceKey(reqSource)

    setLoading(true)
    setError(null)
    setFiles([])
    setFilesWorktreeKey(worktreeKey)
    setFilesSourceKey(reqSourceKey)

    try {
      const result = await window.gc.git.diffFiles(worktreeKey, reqSource)

      // Stale response — a newer load (different worktree or source) is in flight.
      if (reqId !== loadReqRef.current) return

      if (result.error) {
        setError(result.error)
      } else {
        setFiles(result.files)
        setFilesWorktreeKey(worktreeKey)
        setFilesSourceKey(reqSourceKey)
        // Restore the previous selection if its file still exists in the result.
        setSelectedPath((prev) =>
          prev && result.files.some((f) => f.path === prev) ? prev : null
        )
      }
    } finally {
      if (reqId === loadReqRef.current) setLoading(false)
    }
  }, [worktreeKey, activeSourceBranch])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  useEffect(() => {
    const onFocus = () => void loadFiles()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadFiles])

  const contentRef = useRef<HTMLDivElement | null>(null)
  // Subscribe to only the width slice — a whole-`settings` subscription would
  // re-render the diff subtree (and re-tokenize) on any unrelated settings change.
  const width = useStore((s) => s.settings.gitDiffFileListWidth ?? GIT_DIFF_FILE_LIST_DEFAULT)

  const setWidth = useCallback(
    (px: number) => {
      const content = contentRef.current
      if (!content) return
      patchSettings({
        gitDiffFileListWidth: clampGitDiffFileListWidth(px, content.clientWidth)
      })
    },
    [patchSettings]
  )

  useEffect(() => {
    const onResize = (): void => {
      const content = contentRef.current
      if (!content) return
      const clamped = clampGitDiffFileListWidth(width, content.clientWidth)
      if (clamped !== width) patchSettings({ gitDiffFileListWidth: clamped })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [width, patchSettings])

  const { onPointerDown } = useResizeHandle({
    orientation: 'vertical',
    onMove: (delta) => setWidth(width + delta)
  })

  // Expose files/selection/error only when the loaded list matches BOTH the
  // active worktree and the active source — otherwise a source switch would
  // flash the previous source's files and feed the diff pane a stale file.
  const filesMatchView =
    filesWorktreeKey === worktreeKey && filesSourceKey === activeSourceKey
  const visibleFiles = filesMatchView ? files : []
  const visibleSelectedPath = filesMatchView ? selectedPath : null
  const visibleLoading = loading || !filesMatchView
  const visibleError = filesMatchView ? error : null

  const selectedFile = useMemo(
    () => visibleFiles.find((f) => f.path === visibleSelectedPath) ?? null,
    [visibleFiles, visibleSelectedPath]
  )

  if (!project || !worktreeKey) return null

  return (
    <div
      ref={contentRef}
      className="flex min-w-0 flex-1 bg-(image:--grad-content)"
      style={{ '--git-diff-list-w': `${width}px` } as CSSProperties}
    >
      <GitDiffFileList
        files={visibleFiles}
        loading={visibleLoading}
        error={visibleError}
        selectedFile={visibleSelectedPath}
        onSelect={setSelectedPath}
        onRefresh={loadFiles}
        onClose={() => setView('workspace')}
        sourceSelect={
          <GitDiffSourceSelect
            key={worktreeKey}
            source={activeSource}
            branches={branchOptions}
            onChange={changeSource}
          />
        }
      />
      <ResizeHandle
        orientation="vertical"
        ariaLabel="Resize file list"
        onPointerDown={onPointerDown}
        onDoubleClick={() => setWidth(GIT_DIFF_FILE_LIST_DEFAULT)}
      />
      <GitDiffPane
        worktreePath={worktreeKey}
        source={activeSource}
        file={selectedFile}
      />
    </div>
  )
}
