'use client'

import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '../utils/cn'
import { Icon } from '../icons'
import { FloatingPointer } from './floatingPointer'
import {
    menuContentClasses,
    menuItemClasses,
    menuCheckableItemClasses,
    menuSubTriggerClasses,
    menuSubContentClasses,
    menuLabelClasses,
    menuSeparatorClasses,
    menuShortcutClasses,
} from './menu.styles'

namespace DropdownMenu {
    export type Root = React.ComponentProps<typeof DropdownMenuPrimitive.Root>
    export type Portal = React.ComponentProps<typeof DropdownMenuPrimitive.Portal>
    export type Trigger = React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>
    export type Content = React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
        pointer?: boolean
    }
    export type Group = React.ComponentProps<typeof DropdownMenuPrimitive.Group>
    export type Item = React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
        inset?: boolean
        variant?: 'default' | 'destructive'
    }
    export type StaticItem = React.ComponentProps<'div'>
    export type CheckboxItem = React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>
    export type RadioGroup = React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>
    export type RadioItem = React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>
    export type Label = React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
        inset?: boolean
    }
    export type Separator = React.ComponentProps<typeof DropdownMenuPrimitive.Separator>
    export type Shortcut = React.ComponentProps<'span'>
    export type Sub = React.ComponentProps<typeof DropdownMenuPrimitive.Sub>
    export type SubTrigger = React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
        inset?: boolean
    }
    export type SubContent = React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>
}

function Root(props: DropdownMenu.Root) {
    return <DropdownMenuPrimitive.Root data-slot='dropdown-menu' {...props} />
}

function Portal(props: DropdownMenu.Portal) {
    return <DropdownMenuPrimitive.Portal data-slot='dropdown-menu-portal' {...props} />
}

function Trigger(props: DropdownMenu.Trigger) {
    return <DropdownMenuPrimitive.Trigger data-slot='dropdown-menu-trigger' {...props} />
}

function Content({
    className,
    children,
    sideOffset = 4,
    arrowPadding = 10,
    pointer = true,
    ...rest
}: DropdownMenu.Content) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
                data-slot='dropdown-menu-content'
                sideOffset={sideOffset}
                arrowPadding={arrowPadding}
                className={cn(
                    menuContentClasses,
                    `max-h-(--radix-dropdown-menu-content-available-height)
                    origin-(--radix-dropdown-menu-content-transform-origin)`,
                    className,
                )}
                {...rest}
            >
                <div className='min-h-0 overflow-x-hidden overflow-y-auto'>
                    {children}
                </div>
                {pointer && (
                    <DropdownMenuPrimitive.Arrow asChild>
                        <FloatingPointer />
                    </DropdownMenuPrimitive.Arrow>
                )}
            </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
    )
}

function Group(props: DropdownMenu.Group) {
    return <DropdownMenuPrimitive.Group data-slot='dropdown-menu-group' {...props} />
}

function Item({ className, inset, variant = 'default', ...rest }: DropdownMenu.Item) {
    return (
        <DropdownMenuPrimitive.Item
            data-slot='dropdown-menu-item'
            data-inset={inset}
            data-variant={variant}
            className={cn(menuItemClasses, 'group/dropdown-menu-item', className)}
            {...rest}
        />
    )
}

function StaticItem({ className, ...rest }: DropdownMenu.StaticItem) {
    return (
        <div
            data-slot='dropdown-menu-static-item'
            className={cn(
                `border border-transparent
         gap-1.5 rounded-sm px-1.5 py-1 text-sm
         relative flex items-center select-none
         [&_svg:not([class*='size-'])]:size-4
         [&_svg]:pointer-events-none
         [&_svg]:shrink-0
         [&_svg]:text-accent-foreground/80`,
                className,
            )}
            {...rest}
        />
    )
}

function CheckboxItem({ className, children, checked, ...rest }: DropdownMenu.CheckboxItem) {
    return (
        <DropdownMenuPrimitive.CheckboxItem
            data-slot='dropdown-menu-checkbox-item'
            className={cn(menuCheckableItemClasses, className)}
            checked={checked}
            {...rest}
        >
            <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
                <DropdownMenuPrimitive.ItemIndicator>
                    <Icon name='tick' className='size-4 text-current!' />
                </DropdownMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </DropdownMenuPrimitive.CheckboxItem>
    )
}

function RadioGroup(props: DropdownMenu.RadioGroup) {
    return <DropdownMenuPrimitive.RadioGroup data-slot='dropdown-menu-radio-group' {...props} />
}

function RadioItem({ className, children, ...rest }: DropdownMenu.RadioItem) {
    return (
        <DropdownMenuPrimitive.RadioItem
            data-slot='dropdown-menu-radio-item'
            className={cn(menuCheckableItemClasses, className)}
            {...rest}
        >
            <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
                <DropdownMenuPrimitive.ItemIndicator>
                    <Icon name='full-circle' className='size-2 text-current! fill-current' />
                </DropdownMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </DropdownMenuPrimitive.RadioItem>
    )
}

function Label({ className, inset, ...rest }: DropdownMenu.Label) {
    return (
        <DropdownMenuPrimitive.Label
            data-slot='dropdown-menu-label'
            data-inset={inset}
            className={cn(menuLabelClasses, className)}
            {...rest}
        />
    )
}

function Separator({ className, ...rest }: DropdownMenu.Separator) {
    return (
        <DropdownMenuPrimitive.Separator
            data-slot='dropdown-menu-separator'
            className={cn(menuSeparatorClasses, className)}
            {...rest}
        />
    )
}

function Shortcut({ className, ...rest }: DropdownMenu.Shortcut) {
    return (
        <span
            data-slot='dropdown-menu-shortcut'
            className={cn(menuShortcutClasses, className)}
            {...rest}
        />
    )
}

function Sub(props: DropdownMenu.Sub) {
    return <DropdownMenuPrimitive.Sub data-slot='dropdown-menu-sub' {...props} />
}

function SubTrigger({ className, inset, children, ...rest }: DropdownMenu.SubTrigger) {
    return (
        <DropdownMenuPrimitive.SubTrigger
            data-slot='dropdown-menu-sub-trigger'
            data-inset={inset}
            className={cn(menuSubTriggerClasses, className)}
            {...rest}
        >
            {children}
            <Icon name='chevron-right' className='ml-auto size-4' />
        </DropdownMenuPrimitive.SubTrigger>
    )
}

function SubContent({ className, ...rest }: DropdownMenu.SubContent) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.SubContent
                data-slot='dropdown-menu-sub-content'
                className={cn(
                    menuSubContentClasses,
                    'origin-(--radix-dropdown-menu-content-transform-origin)',
                    className,
                )}
                {...rest}
            />
        </DropdownMenuPrimitive.Portal>
    )
}

export const DropdownMenu = {
    Root,
    Portal,
    Trigger,
    Content,
    Group,
    Label,
    Item,
    StaticItem,
    CheckboxItem,
    RadioGroup,
    RadioItem,
    Separator,
    Shortcut,
    Sub,
    SubTrigger,
    SubContent,
}
