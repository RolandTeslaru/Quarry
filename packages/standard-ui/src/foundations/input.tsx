import * as React from 'react'
import { cn } from '../utils/cn'

type InputSize = 'default' | 'sm' | 'xs'
type InputVariant = 'default' | 'ghost' | 'ghost-no-focus'

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
    size?: InputSize
    variant?: InputVariant
}

const inputSizeClasses: Record<InputSize, string> = {
    default: 'rounded-md h-8 px-2.5 py-1 text-base md:text-sm',
    sm: 'rounded-sm! h-7 px-2 py-0.5 text-sm',
    xs: 'rounded-sm! h-6 px-1.5 py-0.5 text-xs',
}

const inputVariantClasses: Record<InputVariant, string> = {
    default: `bg-input border-input-border focus-visible:border-ring focus-visible:ring-ring/50
        aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
        dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80
        border transition-colors file:h-6 file:text-sm file:font-medium
        focus-visible:ring-[2px] aria-invalid:ring-[2px] file:text-foreground placeholder:text-muted-foreground
        w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent
        disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
        inset-shadow-(--input-shadow) disabled:inset-shadow-none`,
    ghost: `bg-transparent border-transparent shadow-none
        focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]
        border transition-colors
        placeholder:text-muted-foreground
        w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent
        disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50`,
    'ghost-no-focus': `bg-transparent border-transparent shadow-none
        border transition-colors
        placeholder:text-muted-foreground
        w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent
        disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50`,
}

function Input({ className, type, size = 'default', variant = 'default', ...props }: InputProps) {
    return (
        <input
            type={type}
            data-slot='input'
            className={cn(inputVariantClasses[variant], inputSizeClasses[size], className)}
            {...props}
        />
    )
}
export { Input }
