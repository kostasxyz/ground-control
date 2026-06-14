import { useEffect, useRef, useState } from 'react'
import { randomWorktreeName } from '@/lib/names'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { Input } from './ui/Input'
import { GitDropdown } from './GitDropdown'

interface NewWorktreeDialogProps {
  open: boolean
  /** Local branches offered as the base. */
  branches: string[]
  /** Preselected base branch (the active worktree's branch). */
  defaultBranch: string
  onCancel(): void
  onCreate(name: string, baseBranch: string): void
}

/**
 * ------------------------------------------------
 * Dialog for creating a git worktree: an editable name (prefilled with a
 * random three-word name) plus the branch the new branch starts from.
 * @param {NewWorktreeDialogProps} props - Component props.
 * @returns {JSX.Element} Dialog element.
 */
export function NewWorktreeDialog({
  open,
  branches,
  defaultBranch,
  onCancel,
  onCreate
}: NewWorktreeDialogProps) {
  const [name, setName] = useState('')
  const [base, setBase] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Fresh suggestion per open; select it so typing replaces the whole name
    // (initial focus alone wouldn't select).
    setName(randomWorktreeName())
    setBase(defaultBranch)
    const raf = requestAnimationFrame(() => inputRef.current?.select())
    return () => cancelAnimationFrame(raf)
  }, [open, defaultBranch])

  const trimmed = name.trim()
  const duplicate = branches.includes(trimmed)
  const canCreate = !!trimmed && !!base && !duplicate

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
    >
      {/* The popup IS the form so Enter anywhere inside submits. */}
      <Dialog.Popup
        initialFocus={inputRef}
        render={
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (canCreate) onCreate(trimmed, base)
            }}
          />
        }
      >
        <Dialog.Header>
          <Dialog.Title>New worktree</Dialog.Title>
          <Dialog.CloseX />
        </Dialog.Header>
        <Dialog.Description>
          Creates a branch with this name and checks it out in its own folder.
        </Dialog.Description>

        <label className="mb-2.5 flex flex-col gap-1.5">
          <span className="text-body-2xs font-bold tracking-[0.08em] text-cream-dim uppercase">
            Worktree name
          </span>
          <Input
            ref={inputRef}
            className="h-8 w-full rounded-md [font-variant-numeric:normal]"
            value={name}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
          />
          {duplicate && <span className="text-body-2xs text-ember">Branch already exists</span>}
        </label>

        <div className="mb-2.5 flex flex-col gap-1.5">
          <span className="text-body-2xs font-bold tracking-[0.08em] text-cream-dim uppercase">
            Base branch
          </span>
          <GitDropdown
            icon="branch"
            title="Base branch"
            className="w-full"
            value={base}
            options={branches.map((branch) => ({ value: branch, label: branch }))}
            onSelect={setBase}
          />
        </div>

        <Dialog.Footer>
          <Button variant="dialog" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="dialogPrimary" disabled={!canCreate}>
            Create
          </Button>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog.Root>
  )
}
