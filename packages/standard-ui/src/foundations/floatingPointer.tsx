import type { ComponentProps } from 'react'
import { cn } from '../utils/cn'

export type FloatingPointerProps = Omit<ComponentProps<'svg'>, 'children'>

export function FloatingPointer({ className, ...props }: FloatingPointerProps) {
    return (
        <svg
            {...props}
            className={cn('floating-pointer', className)}
            data-slot='floating-pointer'
            viewBox='0 0 28 10'
            preserveAspectRatio='none'
            aria-hidden='true'
            focusable='false'
        >
            <path
                className='floating-pointer-fill'
                d='M0 -1H28V0C23 0 21 2 19 4L15.4 7.6Q14 9 12.6 7.6L9 4C7 2 5 0 0 0Z'
            />
            <path
                className='floating-pointer-border'
                d='M0 0C5 0 7 2 9 4L12.6 7.6Q14 9 15.4 7.6L19 4C21 2 23 0 28 0'
                vectorEffect='non-scaling-stroke'
            />
        </svg>
    )
}
