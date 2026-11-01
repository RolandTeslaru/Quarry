import type { ComponentProps, ReactNode } from 'react'
import { Icon, type IconName } from '../icons'
import { cn } from '../utils/cn'

type CalloutIntent = 'none' | 'primary' | 'success' | 'warning' | 'danger'

interface CalloutProps extends Omit<ComponentProps<'div'>, 'title'> {
    intent?: CalloutIntent
    title?: ReactNode
    icon?: IconName | false
}

const intentClasses: Record<CalloutIntent, string> = {
    none: 'bg-secondary/50 text-secondary-foreground',
    primary: 'bg-primary/10 text-sky-800 dark:text-sky-200',
    success: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
    warning: 'bg-yellow-500/10 text-yellow-900 dark:text-yellow-200',
    danger: 'bg-destructive/10 text-red-800 dark:text-red-200',
}

const intentIcons: Record<CalloutIntent, IconName> = {
    none: 'info-sign',
    primary: 'info-sign',
    success: 'tick-circle',
    warning: 'warning-sign',
    danger: 'error',
}

export function Callout({ intent = 'none', title, icon, children, className, ...props }: CalloutProps) {
    const resolvedIcon = icon ?? intentIcons[intent]

    return (
        <div
            data-slot='callout'
            data-intent={intent}
            className={cn('flex items-start gap-3 rounded-lg p-4 text-sm', intentClasses[intent], className)}
            {...props}
        >
            {resolvedIcon && <Icon name={resolvedIcon} className='mt-0.5' />}

            <div className='min-w-0 flex-1 space-y-1'>
                {title && <div className='font-semibold'>{title}</div>}
                {children}
            </div>
        </div>
    )
}
