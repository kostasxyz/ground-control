import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Select } from './ui/Select'
import { Icon, type IconName } from './Icon'

/* Compact toolbar trigger (the old shared trigger look, owned here per T0008). */
const triggerClasses =
  'relative flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border-[0.5px] border-line bg-orange/5 pr-[9px] pl-[30px] text-body-sm font-semibold text-cream outline-none transition-all duration-150 hover:not-disabled:border-orange hover:not-disabled:bg-orange/13 hover:not-disabled:text-orange-bright focus-visible:not-disabled:border-orange focus-visible:not-disabled:bg-orange/13 focus-visible:not-disabled:text-orange-bright aria-expanded:border-orange aria-expanded:bg-orange/13 aria-expanded:text-orange-bright disabled:cursor-default disabled:opacity-55'

/* Hover-revealed per-option delete (ADR-008-07 primary affordance). */
const deleteBtnClasses =
  'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-cream-ghost opacity-0 transition-all duration-150 group-hover/opt:opacity-100 group-data-highlighted/opt:opacity-100 hover:bg-ember/14 hover:text-ember focus-visible:bg-ember/14 focus-visible:text-ember focus-visible:opacity-100 focus-visible:outline-none'

export interface GitDropdownOption {
  value: string
  label: string
  /** Show a delete affordance on this option (requires onDelete). */
  deletable?: boolean
}

interface GitDropdownProps {
  /** Decorative icon rendered inside the trigger. */
  icon: IconName
  /** Tooltip / accessible label for the trigger. */
  title: string
  value: string
  options: GitDropdownOption[]
  disabled?: boolean
  /** Trigger text when no option matches `value`. */
  placeholder?: string
  /** Extra utilities on the trigger (width modifiers, e.g. `w-[120px]`). */
  className?: string
  /** Tooltip for per-option delete buttons. */
  deleteTitle?: string
  onSelect(value: string): void
  onDelete?(value: string): void
  /** Called when the menu opens (e.g. to refresh stale options). */
  onOpen?(): void
}

/**
 * ------------------------------------------------
 * Git toolbar dropdown (worktree/branch pickers, base-branch picker in the
 * worktree dialog) — a thin feature wrapper over `ui/Select`. Options can
 * carry a delete action: the nested button stops propagation on
 * pointerdown/mouseup/click (the three handlers Base UI's SelectItem binds —
 * verified by the T0001 spike, ADR-008-07).
 * @param {GitDropdownProps} props - Component props.
 * @returns {JSX.Element} Dropdown element.
 */
export function GitDropdown({
  icon,
  title,
  value,
  options,
  disabled,
  placeholder,
  className,
  deleteTitle,
  onSelect,
  onDelete,
  onOpen
}: GitDropdownProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next != null && next !== value) onSelect(next)
      }}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) onOpen?.()
      }}
      disabled={disabled}
      items={options.map((option) => ({ value: option.value, label: option.label }))}
    >
      <Select.Trigger variant="bare" title={title} className={cn(triggerClasses, className)}>
        <span className="pointer-events-none absolute left-2.5 flex items-center opacity-60">
          <Icon name={icon} size={14} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-left${selected ? '' : ' font-medium text-cream-ghost'}`}
        >
          {selected?.label ?? placeholder ?? ''}
        </span>
      </Select.Trigger>
      {/* z-50: this menu also opens inside the portaled NewWorktreeDialog
          popup (z-50); at the default z-40 it would land under the dialog. */}
      <Select.Popup positionerClassName="z-50">
        {options.map((option) => (
          <Select.Item
            key={option.value}
            value={option.value}
            trailing={
              option.deletable && onDelete ? (
                <button
                  type="button"
                  className={deleteBtnClasses}
                  title={deleteTitle ?? 'Delete'}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(false)
                    onDelete(option.value)
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              ) : undefined
            }
          >
            {option.label}
          </Select.Item>
        ))}
      </Select.Popup>
    </Select.Root>
  )
}
