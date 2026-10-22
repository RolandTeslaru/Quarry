'use client'

import * as SelectPrimitive from '@radix-ui/react-select'

import { cn } from '../utils/cn'
import { createContext, useContext, type ComponentProps, type FC, type ReactNode } from 'react'
import { SystemIcons } from '../icons'
import { FloatingPointer } from './floatingPointer'

type SelectSize = 'default' | 'sm' | 'xs'
const SelectSizeContext = createContext<SelectSize>('default')

namespace SelectComponents {
    export type Root = FC<ComponentProps<typeof SelectPrimitive.Root>>
    export type Group = FC<ComponentProps<typeof SelectPrimitive.Group>>
    export type Value = FC<ComponentProps<typeof SelectPrimitive.Value>>
    export type Trigger = FC<
        ComponentProps<typeof SelectPrimitive.Trigger> & {
            size?: 'default' | 'sm' | 'xs'
            variant?: 'default' | 'ghost' | 'ghost-no-focus'
        }
    >
    export type ScrollUpButton = FC<ComponentProps<typeof SelectPrimitive.ScrollUpButton>>
    export type ScrollDownButton = FC<ComponentProps<typeof SelectPrimitive.ScrollDownButton>>
    export type Content = FC<
        ComponentProps<typeof SelectPrimitive.Content> & {
            position?: 'popper' | 'item-aligned'
            size?: 'default' | 'sm' | 'xs'
            pointer?: boolean
        }
    >
    export type Label = FC<ComponentProps<typeof SelectPrimitive.Label>>
    export type Item = FC<
        ComponentProps<typeof SelectPrimitive.Item> & { size?: 'default' | 'sm' | 'xs'; description?: ReactNode }
    >
    export type Separator = FC<ComponentProps<typeof SelectPrimitive.Separator>>
}

const Root: SelectComponents.Root = (props) => <SelectPrimitive.Root data-slot='select' {...props} />

const Group: SelectComponents.Group = (props) => <SelectPrimitive.Group data-slot='select-group' {...props} />

const Value: SelectComponents.Value = (props) => (
    <SelectPrimitive.Value className='text-label-primary' data-slot='select-value' {...props} />
)

const triggerVariantClasses = {
    default: `border-input-border bg-input shadow-sm shadow-black/10 rounded-md border focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`,
    ghost: `border-transparent bg-transparent hover:bg-input/30 shadow-none rounded-md border focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`,
    'ghost-no-focus': `border-transparent bg-transparent shadow-none rounded-md border`,
}

const Trigger: SelectComponents.Trigger = ({ className, children, size = 'sm', variant = 'default', ...props }) => {
    return (
        <SelectPrimitive.Trigger
            data-slot='select-trigger'
            data-size={size}
            className={cn(
                `cursor-pointer
        data-[placeholder]:text-muted-foreground
        [&_svg:not([class*='text-'])]:text-muted-foreground
        aria-invalid:ring-destructive/20
        dark:aria-invalid:ring-destructive/40
        aria-invalid:border-destructive
        flex w-full min-w-0 items-center
        justify-between gap-2
        whitespace-nowrap
        transition-[color,box-shadow]
        outline-none disabled:cursor-not-allowed
        disabled:opacity-50
        data-[size=default]:h-8 data-[size=default]:px-2.5 data-[size=default]:py-1 data-[size=default]:text-sm
        data-[size=sm]:h-7 data-[size=sm]:px-2 data-[size=sm]:py-0.5 data-[size=sm]:text-sm
        data-[size=xs]:h-6 data-[size=xs]:px-1.5 data-[size=xs]:py-0.5 data-[size=xs]:text-xs
        *:data-[slot=select-value]:truncate *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:block [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
                triggerVariantClasses[variant],
                className,
            )}
            {...props}
        >
            {children}
            <SelectPrimitive.Icon asChild>
                <SystemIcons.ChevronDown className='size-4 opacity-50' />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    )
}

const ScrollUpButton: SelectComponents.ScrollUpButton = ({ className, ...rest }) => (
    <SelectPrimitive.ScrollUpButton
        className={cn('flex cursor-default items-center justify-center py-1', className)}
        {...rest}
    >
        <SystemIcons.ChevronUp className='h-4 w-4' />
    </SelectPrimitive.ScrollUpButton>
)

const ScrollDownButton: SelectComponents.ScrollDownButton = ({ className, ...rest }) => (
    <SelectPrimitive.ScrollDownButton
        className={cn('flex cursor-default items-center justify-center py-1', className)}
        {...rest}
    >
        <SystemIcons.ChevronDown className='h-4 w-4' />
    </SelectPrimitive.ScrollDownButton>
)

const Content: SelectComponents.Content = ({
    className,
    children,
    position = 'popper',
    size = 'default',
    arrowPadding = 10,
    pointer = true,
    ...rest
}) => {
    return (
        <SelectPrimitive.Portal>
            <SelectSizeContext.Provider value={size}>
                <SelectPrimitive.Content
                    className={cn(
                        `standard-popup-motion bg-popover/80 backdrop-blur-sm text-popover-foreground min-w-[8rem]
                        rounded-lg border border-popover-border
                        shadow-xl dark:shadow-black/30 light:shadow-neutral-950/30 relative z-50
                        max-h-(--radix-select-content-available-height)
                        origin-(--radix-select-content-transform-origin)`,
                        position === 'popper' &&
                            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
                        className,
                    )}
                    position={position}
                    arrowPadding={arrowPadding}
                    {...rest}
                >
                    <ScrollUpButton />
                    <SelectPrimitive.Viewport
                        className={cn(
                            'min-h-0 rounded-[inherit]',
                            position === 'popper' &&
                                ' p-1 h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1',
                        )}
                    >
                        {children}
                    </SelectPrimitive.Viewport>
                    <ScrollDownButton />
                    {pointer && position === 'popper' && (
                        <SelectPrimitive.Arrow asChild>
                            <FloatingPointer />
                        </SelectPrimitive.Arrow>
                    )}
                </SelectPrimitive.Content>
            </SelectSizeContext.Provider>
        </SelectPrimitive.Portal>
    )
}

const Label: SelectComponents.Label = ({ className, ...props }) => (
    <SelectPrimitive.Label className={cn('py-1.5 pl-8 pr-2 text-xs font-semibold', className)} {...props} />
)

const itemSizeClasses: Record<'default' | 'sm' | 'xs', string> = {
    default: 'py-1.5 pr-8 pl-2 text-sm',
    sm: 'py-1 pr-7 pl-2 text-sm',
    xs: 'py-0.5 pr-6 pl-1.5 text-xs',
}

const itemIndicatorClasses: Record<'default' | 'sm' | 'xs', string> = {
    default: 'right-2 h-3.5 w-3.5',
    sm: 'right-1.5 h-3.5 w-3.5',
    xs: 'right-1 h-3 w-3',
}

const Item: SelectComponents.Item = ({ className, children, size, description, ...props }) => {
    const contextSize = useContext(SelectSizeContext)
    const resolvedSize = size ?? contextSize
    return (
        <SelectPrimitive.Item
            className={cn(
                `not-data-[state=checked]:focus:bg-secondary not-data-[state=checked]:focus:text-secondary-foreground
        data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground
        data-[state=checked]:**:text-foreground
        data-[state=checked]:[&_svg]:text-foreground!
       border border-transparent
       relative flex w-full cursor-pointer items-center gap-2
       rounded-sm outline-hidden select-none
       data-[disabled]:pointer-events-none
       data-[disabled]:opacity-50

       [&_svg:not([class*='text-'])]:text-muted-foreground
       [&_svg]:pointer-events-none
       [&_svg]:shrink-0
       [&_svg:not([class*='size-'])]:size-4
       *:[span]:last:flex
       *:[span]:last:items-center
       *:[span]:last:gap-2
       `,
                itemSizeClasses[resolvedSize],
                className,
            )}
            {...props}
        >
            <span
                className={cn(
                    'absolute flex items-center justify-center text-label-primary',
                    itemIndicatorClasses[resolvedSize],
                )}
            >
                <SelectPrimitive.ItemIndicator>
                    <SystemIcons.Check className={resolvedSize === 'xs' ? 'size-3' : 'size-4'} />
                </SelectPrimitive.ItemIndicator>
            </span>

            {description ? (
                // Description lives OUTSIDE ItemText so it shows only in the dropdown list,
                // not mirrored into the closed trigger via Select.Value.
                <div className='flex min-w-0 flex-col gap-0.5'>
                    <SelectPrimitive.ItemText>
                        <span>{children}</span>
                    </SelectPrimitive.ItemText>
                    <span className='text-muted-foreground text-xs font-normal whitespace-normal'>{description}</span>
                </div>
            ) : (
                <SelectPrimitive.ItemText>
                    <span>{children}</span>
                </SelectPrimitive.ItemText>
            )}
        </SelectPrimitive.Item>
    )
}

const Separator: SelectComponents.Separator = ({ className, ...props }) => (
    <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-neutral-400/20', className)} {...props} />
)

export const Select = {
    Root,
    Group,
    Value,
    Trigger,
    ScrollUpButton,
    ScrollDownButton,
    Content,
    Label,
    Item,
    Separator,
}
