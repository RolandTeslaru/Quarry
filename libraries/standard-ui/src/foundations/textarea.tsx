import * as React from 'react'
import { cn } from '../utils/cn'

type TextareaSize = 'default' | 'sm' | 'xs'

type TextareaProps = Omit<React.ComponentProps<'textarea'>, 'size'> & {
    size?: TextareaSize
}

const textareaSizeClasses: Record<TextareaSize, string> = {
    default: 'min-h-16 rounded-md px-3 py-2 text-base md:text-sm',
    sm: 'min-h-14 rounded-md px-2.5 py-1.5 text-sm',
    xs: 'min-h-10 rounded-md px-2 py-1 text-xs',
}

const textareaBaseClasses = `border-input-border placeholder:text-muted-foreground
  focus-visible:border-ring focus-visible:ring-ring/50
  aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
  aria-invalid:border-destructive
  bg-input flex field-sizing-content w-full overflow-x-hidden border
  inset-shadow-(--input-shadow) disabled:inset-shadow-none transition-[color,box-shadow] outline-none focus-visible:ring-[3px]
  disabled:cursor-not-allowed disabled:opacity-50`

function Textarea({ className, size = 'default', ...props }: TextareaProps) {
    return (
        <textarea
            data-slot='textarea'
            className={cn(textareaBaseClasses, textareaSizeClasses[size], className)}
            {...props}
        />
    )
}

export { Textarea }
