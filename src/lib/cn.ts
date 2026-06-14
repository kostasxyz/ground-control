import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'body-xs',
        'body-2xs',
        'body-sm',
        'body-sm-plus',
        'body',
        'body-md',
        'body-lg',
        'heading-2xs',
        'heading-sm',
        'heading',
        'heading-md',
        'heading-lg',
        'heading-xl',
        'heading-display'
      ]
    }
  }
})

/** Merge class names: clsx for conditionals, tailwind-merge so caller
 *  overrides win over component defaults (e.g. cn('px-2', 'px-3') → 'px-3').
 *  All ui/ primitives merge their `className` prop through this (ADR-008-04). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
