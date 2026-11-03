import type { ComponentProps } from 'react'
import { cn } from '@quarry/standard-ui/utils/cn'

/** An elevated surface floating over an app's background: the nav's pieces, the sidebars. */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='overlay-panel'
            className={cn('surface-elevated overflow-hidden border shadow-xs shadow-black/5', className)}
            {...props}
        />
    )
}
