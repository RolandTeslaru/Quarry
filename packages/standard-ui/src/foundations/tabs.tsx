'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { useCallback, useEffect, useRef } from 'react'

import { cn } from '../utils/cn'

import { cva } from 'class-variance-authority'

const listVars = cva(
    `group/list rounded-lg inline-flex h-auto items-center justify-center text-muted-foreground relative
   
  `,
    {
        variants: {
            variant: {
                primary: 'bg-input/30 text-foreground',
                accent: 'bg-accent/30 text-foreground',
                sidebar:
                    'flex flex-col items-stretch justify-start w-full border-0 bg-transparent shadow-none rounded-none text-foreground',
            },
            size: {
                xxs: 'p-0 gap-0',
                xs: 'p-px gap-px',
                sm: 'py-0.5 px-[3px] gap-0.5',
                default: 'p-0.5 gap-1',
                lg: 'p-0.5 gap-1.5',
            },
        },
        defaultVariants: {
            size: 'default',
            variant: 'primary',
        },
    },
)

const triggerVars = cva(
    'inline-flex items-center z-10 justify-center whitespace-nowrap font-semibold text-label-primary! transition-all border border-transparent cursor-pointer outline-none focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 group-data-[variant=primary]/list:data-[state=active]:text-white!',
    {
        variants: {
            size: {
                xxs: 'rounded-sm px-1 py-px text-[10px]',
                xs: 'rounded-sm px-1.5 py-0.5 text-xs',
                sm: 'rounded-sm px-2 py-0.5 text-xs',
                default: 'rounded-md px-3 py-1.5 text-sm',
                lg: 'rounded-lg px-4 py-2 text-base',
            },
            variant: {
                primary: '',
                accent: '',
                sidebar:
                    'w-full justify-start gap-2 rounded-md px-2 py-1 text-sm font-normal hover:bg-accent/30  data-[state=active]:bg-input',
            },
        },
        defaultVariants: {
            size: 'default',
            variant: 'primary',
        },
    },
)

const indicatorVars = cva('absolute z-0 pointer-events-none! border transition-all duration-300 ease-out shadow-sm', {
    variants: {
        variant: {
            primary: 'bg-primary border-primary-accent shadow-black/20',
            accent: 'bg-input dark:border-neutral-500/60 dark:bg-neutral-600 border-white',
        },
        size: {
            xxs: 'rounded-sm',
            xs: 'rounded-sm',
            sm: 'rounded-md',
            default: 'rounded-md',
            lg: 'rounded-md',
        },
    },
    defaultVariants: {
        size: 'default',
        variant: 'primary',
    },
})

function Root({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
    return <TabsPrimitive.Root data-slot='tabs' className={cn('flex flex-col gap-2', className)} {...props} />
}

type TabsSize = 'xxs' | 'xs' | 'sm' | 'default' | 'lg'
type TabsVariant = 'primary' | 'accent' | 'sidebar'

const TabsSizeContext = React.createContext<TabsSize>('default')
const TabsVariantContext = React.createContext<TabsVariant>('primary')

const List = ({
    className,
    children,
    variant = 'accent',
    size = 'default',
    ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
    variant?: TabsVariant
    size?: TabsSize
}) => {
    const indicatorRef = useRef<null | HTMLDivElement>(null)
    const listRef = useRef<null | HTMLDivElement>(null)

    const updateIndicatorToActiveTab = useCallback(() => {
        if (!indicatorRef.current || !listRef.current) {
            return
        }

        const activeTab = listRef.current.querySelector<HTMLElement>('[data-state="active"]')
        if (!activeTab) {
            return
        }

        indicatorRef.current.style.width = `${activeTab.offsetWidth}px`
        indicatorRef.current.style.height = `${activeTab.offsetHeight}px`
        indicatorRef.current.style.left = `${activeTab.offsetLeft}px`
        indicatorRef.current.style.top = `${activeTab.offsetTop}px`
    }, [])

    // Update indicator on mount and when tabs change
    useEffect(() => {
        updateIndicatorToActiveTab()

        // Use MutationObserver to detect when data-state changes on triggers
        if (!listRef.current) {
            return
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.attributeName === 'data-state') {
                    updateIndicatorToActiveTab()
                    break
                }
            }
        })

        // Observe all trigger children for attribute changes
        const triggers = listRef.current.querySelectorAll('[data-slot="tabs-trigger"]')
        triggers.forEach((trigger) => {
            observer.observe(trigger, { attributes: true, attributeFilter: ['data-state'] })
        })

        return () => observer.disconnect()
    }, [updateIndicatorToActiveTab])

    return (
        <TabsSizeContext.Provider value={size}>
            <TabsVariantContext.Provider value={variant}>
                <TabsPrimitive.List
                    ref={listRef}
                    data-slot='tabs-list'
                    data-variant={variant}
                    className={cn(listVars({ variant, size }), className)}
                    {...props}
                >
                    {children}
                    {/* Animated indicator — the sidebar highlights the row in place instead. */}
                    {variant !== 'sidebar' && (
                        <div ref={indicatorRef} className={cn(indicatorVars({ variant, size }))} />
                    )}
                </TabsPrimitive.List>
            </TabsVariantContext.Provider>
        </TabsSizeContext.Provider>
    )
}
List.displayName = TabsPrimitive.List.displayName

function Trigger({
    className,
    size,
    variant,
    ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
    size?: TabsSize
    variant?: TabsVariant
}) {
    const contextSize = React.useContext(TabsSizeContext)
    const contextVariant = React.useContext(TabsVariantContext)

    const resolvedSize = size ?? contextSize
    const resolvedVariant = variant ?? contextVariant

    return (
        <TabsPrimitive.Trigger
            data-slot='tabs-trigger'
            className={cn(triggerVars({ size: resolvedSize, variant: resolvedVariant }), className)}
            {...props}
        />
    )
}

function Content({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content
            data-slot='tabs-content'
            className={cn(
                'mt-2 outline-none focus-visible:outline-none',
                'data-[state=inactive]:hidden',
                className,
            )}
            {...props}
        />
    )
}

export const Tabs = {
    Root,
    List,
    Trigger,
    Content,
}
