import { useRef } from 'react'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'

interface ErrorDialogProps {
  open: boolean
  title: string
  /** What failed, e.g. "git switch failed". */
  message: string
  /** Raw command output, shown in a scrollable monospace block. */
  output?: string
  onClose(): void
}

/**
 * ------------------------------------------------
 * In-app error dialog for failed operations (e.g. git mutations). Shows the
 * raw command output so the user can act on it. Esc / backdrop click / Close
 * all dismiss (Base UI defaults, ADR-008-06).
 * @param {ErrorDialogProps} props - Component props.
 * @returns {JSX.Element} Dialog element.
 */
export function ErrorDialog({ open, title, message, output, onClose }: ErrorDialogProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      {/* Initial focus on the footer Close (parity) — the default would land
          on the header ✕, whose focus-opened tooltip eats the first Esc. */}
      <Dialog.Popup className="w-[min(560px,calc(100vw-48px))]" initialFocus={closeRef}>
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.CloseX />
        </Dialog.Header>
        <Dialog.Description>{message}</Dialog.Description>
        {output && (
          <pre className="m-0 mb-3.5 max-h-[280px] overflow-auto rounded-lg border-[0.5px] border-line bg-bg px-3 py-2.5 font-mono text-body-2xs leading-[1.6] whitespace-pre-wrap text-cream-dim select-text [word-break:break-word]">
            {output}
          </pre>
        )}
        <Dialog.Footer>
          <Dialog.Close render={<Button ref={closeRef} variant="dialog">Close</Button>} />
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog.Root>
  )
}
