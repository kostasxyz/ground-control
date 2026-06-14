import { useEffect, useRef, useState } from 'react'
import { AlertDialog } from './ui/AlertDialog'
import { Button } from './ui/Button'
import { Checkbox } from './ui/Checkbox'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  /** Secondary line under the message. */
  detail?: string
  /** Optional opt-in checkbox; its state is passed to onConfirm. */
  checkboxLabel?: string
  confirmLabel?: string
  onConfirm(checked: boolean): void
  onCancel(): void
}

/**
 * ------------------------------------------------
 * In-app confirmation dialog for destructive actions. Esc cancels; backdrop
 * click deliberately does NOT (AlertDialog semantics, ADR-008-06). Cancel
 * gets initial focus so Enter never deletes by accident.
 * @param {ConfirmDialogProps} props - Component props.
 * @returns {JSX.Element} Dialog element.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  checkboxLabel,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const [checked, setChecked] = useState(false)

  // The checkbox always starts unticked so a previous opt-in never leaks
  // into the next confirmation.
  useEffect(() => {
    if (open) setChecked(false)
  }, [open])

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
    >
      {/* Cancel holds initial focus so Enter can never confirm a delete. */}
      <AlertDialog.Popup initialFocus={cancelRef}>
        <AlertDialog.Header>
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.CloseX />
        </AlertDialog.Header>
        <AlertDialog.Description render={<div />}>
          {message}
          {detail && <div className="mt-1.5 text-body-2xs text-cream-ghost">{detail}</div>}
        </AlertDialog.Description>
        {checkboxLabel && (
          <label className="-mt-1 mb-3.5 flex cursor-pointer items-center gap-2 text-body-sm text-cream-dim">
            <Checkbox checked={checked} onCheckedChange={setChecked} />
            <span className="truncate">{checkboxLabel}</span>
          </label>
        )}
        <AlertDialog.Footer>
          <Button ref={cancelRef} variant="dialog" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="dialogDanger" onClick={() => onConfirm(checked)}>
            {confirmLabel}
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Popup>
    </AlertDialog.Root>
  )
}
