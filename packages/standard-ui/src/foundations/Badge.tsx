import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const badgeVariants = cva(
    'gap-1 rounded-sm border border-transparent font-medium transition-[color,opacity] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-colors overflow-hidden group/badge',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
                secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
                destructive:
                    'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
                outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
                ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
                link: 'text-primary underline-offset-4 hover:underline',
                success: 'bg-emerald-400/20 text-emerald-700 dark:bg-emerald-700/30 dark:text-emerald-300',
                active: 'bg-sky-400/20 text-sky-700 [a]:hover:bg-sky-400/30 dark:bg-sky-700/30 dark:text-sky-300',
                nightly:
                    'bg-violet-400/20 text-violet-700 [a]:hover:bg-violet-400/30 dark:bg-violet-700/30 dark:text-violet-300',
            },
            size: {
                default: 'h-5 px-2 py-0.5 text-xs [&>svg]:size-3!',
                sm: 'h-4 px-1.5 py-px text-[10px] [&>svg]:size-2.5!',
                xs: 'h-3.5 px-1 py-px text-[9px] [&>svg]:size-2!',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
)

interface BadgeProps extends React.ComponentPropsWithoutRef<'span'>, VariantProps<typeof badgeVariants> {
    asChild?: boolean
}

function Badge({
    className,
    variant,
    size,
    asChild = false,
    ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'span'

    return <Comp data-slot='badge' className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants, type BadgeProps }
