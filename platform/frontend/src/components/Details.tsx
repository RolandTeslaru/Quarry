import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@quarry/standard-ui/utils/cn'

/**
 * A resource's facts as label / value rows — an app sidebar's About tab.
 *
 *   <Details>
 *       <Detail label='Updated'>{dateTime(resource.updatedAt)}</Detail>
 *       <Detail label='RID'>…</Detail>
 *   </Details>
 */
export function Details({ className, ...props }: ComponentProps<'dl'>) {
    return <dl className={cn('grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2.5 text-sm', className)} {...props} />
}

interface DetailProps {
    label:    string
    children: ReactNode
}

export function Detail({ label, children }: DetailProps) {
    return (
        <>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='min-w-0'>{children}</dd>
        </>
    )
}
