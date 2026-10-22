'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'

import { cn } from '../utils/cn'
import { Icon } from '../icons'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
    return (
        <CheckboxPrimitive.Root
            data-slot='checkbox'
            className={cn(
                `peer cursor-pointer border border-border bg-input
                data-[state=checked]:bg-primary!
                data-[state=checked]:text-white
                data-[state=checked]:border-primary-accent
                focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
                size-4 shrink-0 rounded-sm transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50`,
                className,
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator
                data-slot='checkbox-indicator'
                className='flex items-center justify-center text-current transition-none'
            >
                <Icon name='tick' className='size-3.5' />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    )
}

export { Checkbox }
