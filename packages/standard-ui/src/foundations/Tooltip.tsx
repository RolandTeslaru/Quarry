'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../utils/cn'

namespace Tooltip {
    export type Provider = React.ComponentProps<typeof TooltipPrimitive.Provider>
    export type Root = React.ComponentProps<typeof TooltipPrimitive.Root>
    export type Trigger = React.ComponentProps<typeof TooltipPrimitive.Trigger>
    export type Content = React.ComponentProps<typeof TooltipPrimitive.Content>
}

function Provider({ delayDuration = 0, ...props }: Tooltip.Provider) {
    return <TooltipPrimitive.Provider data-slot='tooltip-provider' delayDuration={delayDuration} {...props} />
}

function Root({ ...props }: Tooltip.Root) {
    return (
        <Provider>
            <TooltipPrimitive.Root data-slot='tooltip' {...props} />
        </Provider>
    )
}

function Trigger({ ...props }: Tooltip.Trigger) {
    return <TooltipPrimitive.Trigger data-slot='tooltip-trigger' {...props} />
}

function Content({ className, sideOffset = 0, children, ...props }: Tooltip.Content) {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                data-slot='tooltip-content'
                sideOffset={sideOffset}
                className={cn(
                    `bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black animate-in fade-in-0 zoom-in-95
           shadow-lg shadow-black/20
           data-[state=closed]:animate-out
           data-[state=closed]:fade-out-0
           data-[state=closed]:zoom-out-95
           data-[side=bottom]:slide-in-from-top-2
           data-[side=left]:slide-in-from-right-2
           data-[side=right]:slide-in-from-left-2
           data-[side=top]:slide-in-from-bottom-2
           z-50 w-fit
           origin-(--radix-tooltip-content-transform-origin)
           rounded-md px-3 py-1.5 text-xs text-balance`,
                    className,
                )}
                {...props}
            >
                {children}
                <TooltipPrimitive.Arrow className='bg-neutral-900 fill-neutral-900 dark:bg-neutral-100 dark:fill-neutral-100 z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]' />
            </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    )
}

export const Tooltip = {
    Provider,
    Root,
    Trigger,
    Content,
}
