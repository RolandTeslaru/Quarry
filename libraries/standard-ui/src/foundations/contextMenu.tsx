import * as React from 'react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { cn } from '../utils/cn'
import { Icon } from '../icons'

namespace ContextMenuComponents {
    export type Root = React.ComponentProps<typeof ContextMenuPrimitive.Root>
    export type Trigger = React.ComponentProps<typeof ContextMenuPrimitive.Trigger>
    export type Group = React.ComponentProps<typeof ContextMenuPrimitive.Group>
    export type Portal = React.ComponentProps<typeof ContextMenuPrimitive.Portal>
    export type Sub = React.ComponentProps<typeof ContextMenuPrimitive.Sub>
    export type RadioGroup = React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>
    export type SubContent = React.ComponentProps<typeof ContextMenuPrimitive.SubContent>
    export type Content = React.ComponentProps<typeof ContextMenuPrimitive.Content>
    export type CheckboxItem = React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>
    export type RadioItem = React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>
    export type Separator = React.ComponentProps<typeof ContextMenuPrimitive.Separator>
    export type Shortcut = React.ComponentProps<'span'>

    export type SubTrigger = React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
        inset?: boolean
        icon?: React.ReactNode
    }
    export type Item = React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
        inset?: boolean
        variant?: 'default' | 'destructive' | 'warning'
        preventClose?: boolean
        icon?: React.ReactNode
    }
    export type Label = React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
        inset?: boolean
    }
}

function Root(props: ContextMenuComponents.Root) {
    return <ContextMenuPrimitive.Root data-slot='context-menu' {...props} />
}

function Trigger(props: ContextMenuComponents.Trigger) {
    return <ContextMenuPrimitive.Trigger data-slot='context-menu-trigger' {...props} />
}

function Group(props: ContextMenuComponents.Group) {
    return <ContextMenuPrimitive.Group data-slot='context-menu-group' {...props} />
}

function Portal(props: ContextMenuComponents.Portal) {
    return <ContextMenuPrimitive.Portal data-slot='context-menu-portal' {...props} />
}

function Sub(props: ContextMenuComponents.Sub) {
    return <ContextMenuPrimitive.Sub data-slot='context-menu-sub' {...props} />
}

function RadioGroup(props: ContextMenuComponents.RadioGroup) {
    return <ContextMenuPrimitive.RadioGroup data-slot='context-menu-radio-group' {...props} />
}

function Content({ className, ...rest }: ContextMenuComponents.Content) {
    return (
        <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.Content
                data-slot='context-menu-content'
                className={cn(
                    `bg-popover/80 text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out
          data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95
          data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2
          data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2
          z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem]
          origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto
          rounded-lg border border-popover-border p-1
          shadow-xl backdrop-blur-sm
          dark:shadow-black/50
          light:shadow-neutral-950/50`,
                    className,
                )}
                {...rest}
            />
        </ContextMenuPrimitive.Portal>
    )
}

function SubTrigger({ className, inset, children, icon, ...rest }: ContextMenuComponents.SubTrigger) {
    return (
        <ContextMenuPrimitive.SubTrigger
            data-slot='context-menu-sub-trigger'
            data-inset={inset}
            className={cn(
                `focus:bg-secondary focus:text-secondary-foreground
        border border-transparent

        data-[state=open]:bg-secondary

        data-[state=open]:text-secondary-foreground
        not-data-[variant=destructive]:focus:**:text-secondary-foreground
        gap-1.5 rounded-sm px-1.5 py-1 text-sm
        [&_svg:not([class*='size-'])]:size-4
        flex cursor-default items-center outline-hidden select-none
        data-[inset]:pl-8
        [&_svg]:pointer-events-none
        [&_svg]:shrink-0
        [&_svg]:text-accent-foreground`,
                className,
            )}
            {...rest}
        >
            {icon}
            {children}
            <Icon name='chevron-right' className='ml-auto size-4' />
        </ContextMenuPrimitive.SubTrigger>
    )
}

function SubContent({ className, ...rest }: ContextMenuComponents.SubContent) {
    return (
        <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.SubContent
                data-slot='context-menu-sub-content'
                className={cn(
                    `bg-popover/80 text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out
           data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95
           data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2
           data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem]
           origin-(--radix-context-menu-content-transform-origin) backdrop-blur-md
           overflow-hidden rounded-lg border border-popover-border p-1 shadow-lg`,
                    className,
                )}
                {...rest}
            />
        </ContextMenuPrimitive.Portal>
    )
}

function Item({
    className,
    children,
    icon,
    inset,
    variant = 'default',
    preventClose = false,
    ...rest
}: ContextMenuComponents.Item) {
    return (
        <ContextMenuPrimitive.Item
            data-slot='context-menu-item'
            data-inset={inset}
            data-variant={variant}
            className={cn(
                `focus:bg-secondary
        cursor-pointer
        border border-transparent

        focus:text-secondary-foreground
        data-[variant=destructive]:text-destructive

        data-[variant=destructive]:focus:text-destructive
        data-[variant=destructive]:*:[svg]:text-destructive
        data-[variant=warning]:text-yellow-500

        data-[variant=warning]:focus:text-yellow-500
        data-[variant=warning]:*:[svg]:text-yellow-500
        not-data-[variant=destructive]:not-data-[variant=warning]:focus:**:text-secondary-foreground
        gap-1.5 rounded-sm px-1.5 py-1 text-sm
        [&_svg:not([class*='size-'])]:size-4 group/context-menu-item
        relative flex items-center outline-hidden select-none
        data-[disabled]:pointer-events-none
        data-[disabled]:opacity-50
        data-[inset]:pl-8
        [&_svg]:pointer-events-none
        [&_svg]:shrink-0
        [&_svg]:text-accent-foreground`,
                preventClose && 'pointer-events-none!',
                className,
            )}
            {...rest}
        >
            {icon}
            {children}
        </ContextMenuPrimitive.Item>
    )
}

function CheckboxItem({ className, children, checked, ...rest }: ContextMenuComponents.CheckboxItem) {
    return (
        <ContextMenuPrimitive.CheckboxItem
            data-slot='context-menu-checkbox-item'
            className={cn(
                `not-data-[state=checked]:focus:bg-secondary border border-transparent
        not-data-[state=checked]:focus:text-secondary-foreground
        data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground
        data-[state=checked]:**:text-foreground
        relative flex cursor-default items-center gap-2 rounded-sm
        py-1 pr-2 pl-8 text-sm outline-hidden select-none
        data-[disabled]:pointer-events-none data-[disabled]:opacity-50
        [&_svg]:pointer-events-none [&_svg]:shrink-0
        [&_svg:not([class*='size-'])]:size-4
        [&_svg]:text-accent-foreground`,
                className,
            )}
            checked={checked}
            {...rest}
        >
            <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
                <ContextMenuPrimitive.ItemIndicator>
                    <Icon name='tick' className='size-4 text-current!' />
                </ContextMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </ContextMenuPrimitive.CheckboxItem>
    )
}

function RadioItem({ className, children, ...rest }: ContextMenuComponents.RadioItem) {
    return (
        <ContextMenuPrimitive.RadioItem
            data-slot='context-menu-radio-item'
            className={cn(
                `not-data-[state=checked]:focus:bg-secondary border border-transparent
        not-data-[state=checked]:focus:text-secondary-foreground
        data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground
        data-[state=checked]:**:text-foreground
        relative flex cursor-default items-center gap-2 rounded-sm
        py-1 pr-2 pl-8 text-sm outline-hidden select-none
        data-[disabled]:pointer-events-none data-[disabled]:opacity-50
        [&_svg]:pointer-events-none
        [&_svg]:shrink-0
        [&_svg:not([class*='size-'])]:size-4
        [&_svg]:text-accent-foreground`,
                className,
            )}
            {...rest}
        >
            <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
                <ContextMenuPrimitive.ItemIndicator>
                    <Icon name='full-circle' className='size-2 text-current! fill-current' />
                </ContextMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </ContextMenuPrimitive.RadioItem>
    )
}

function Label({ className, inset, ...rest }: ContextMenuComponents.Label) {
    return (
        <ContextMenuPrimitive.Label
            data-slot='context-menu-label'
            data-inset={inset}
            className={cn('text-muted-foreground px-1.5 py-1 text-xs font-medium data-[inset]:pl-8', className)}
            {...rest}
        />
    )
}

function Separator({ className, ...rest }: ContextMenuComponents.Separator) {
    return (
        <ContextMenuPrimitive.Separator
            data-slot='context-menu-separator'
            className={cn('bg-border  my-1 h-px', className)}
            {...rest}
        />
    )
}

function Shortcut({ className, ...rest }: ContextMenuComponents.Shortcut) {
    return (
        <span
            data-slot='context-menu-shortcut'
            className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
            {...rest}
        />
    )
}

export const ContextMenu = {
    Root,
    Trigger,
    Group,
    Portal,
    Sub,
    RadioGroup,
    SubTrigger,
    SubContent,
    Content,
    Item,
    CheckboxItem,
    RadioItem,
    Label,
    Separator,
    Shortcut,
}
