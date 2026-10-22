import * as React from 'react'
import { type FC, type ComponentProps } from 'react'
import * as MenubarPrimitive from '@radix-ui/react-menubar'

import { cn } from '../utils/cn'
import classNames from 'classnames'
import { SystemIcons } from '../icons'

namespace MenubarComponents {
    export type Root = FC<ComponentProps<typeof MenubarPrimitive.Root>>
    export type Menu = FC<ComponentProps<typeof MenubarPrimitive.Menu>>
    export type Group = FC<ComponentProps<typeof MenubarPrimitive.Group>>
    export type Portal = FC<ComponentProps<typeof MenubarPrimitive.Portal>>
    export type Sub = FC<ComponentProps<typeof MenubarPrimitive.Sub>>
    export type RadioGroup = FC<ComponentProps<typeof MenubarPrimitive.RadioGroup>>
    export type Trigger = FC<ComponentProps<typeof MenubarPrimitive.Trigger>>
    export type SubTrigger = FC<ComponentProps<typeof MenubarPrimitive.SubTrigger> & { inset?: boolean }>
    export type SubContent = FC<ComponentProps<typeof MenubarPrimitive.SubContent>>
    export type Content = FC<ComponentProps<typeof MenubarPrimitive.Content>>
    export type Item = FC<ComponentProps<typeof MenubarPrimitive.Item> & { inset?: boolean }>
    export type CheckboxItem = FC<ComponentProps<typeof MenubarPrimitive.CheckboxItem>>
    export type RadioItem = FC<ComponentProps<typeof MenubarPrimitive.RadioItem>>
    export type Label = FC<ComponentProps<typeof MenubarPrimitive.Label> & { inset?: boolean }>
    export type Separator = FC<ComponentProps<typeof MenubarPrimitive.Separator>>
    export type Shortcut = FC<React.HTMLAttributes<HTMLSpanElement>>
}

const Root: MenubarComponents.Root = ({ className, ...rest }) => (
    <MenubarPrimitive.Root
        className={cn('flex h-10 items-center space-x-1 rounded-md border border-none p-1 bg-none', className)}
        {...rest}
    />
)

const Menu: MenubarComponents.Menu = (props) => <MenubarPrimitive.Menu {...props} />

const Group: MenubarComponents.Group = (props) => <MenubarPrimitive.Group {...props} />

const Portal: MenubarComponents.Portal = (props) => <MenubarPrimitive.Portal {...props} />

const Sub: MenubarComponents.Sub = (props) => <MenubarPrimitive.Sub {...props} />

const RadioGroup: MenubarComponents.RadioGroup = (props) => <MenubarPrimitive.RadioGroup {...props} />

const Trigger: MenubarComponents.Trigger = ({ className, ...rest }) => (
    <MenubarPrimitive.Trigger
        className={classNames(
            `flex cursor-default select-none items-center rounded-lg px-3 py-1 outline-hidden border-transparent border text-xs
       antialiased font-bold text-label-primary
      focus:bg-secondary focus:text-secondary-foreground
      hover:bg-secondary

      data-[state=open]:bg-secondary
      data-[state=open]:text-secondary-foreground
      `,
            className,
        )}
        {...rest}
    />
)

const SubTrigger: MenubarComponents.SubTrigger = ({ className, inset, children, ...rest }) => (
    <MenubarPrimitive.SubTrigger
        className={classNames(
            `flex cursor-default select-none items-center rounded-lg p-2 py-1.5 text-xs font-medium outline-hidden border border-transparent
       text-label-primary
       hover:bg-secondary hover:text-secondary-foreground
       focus:bg-secondary focus:text-secondary-foreground
       data-[state=open]:bg-secondary data-[state=open]:text-secondary-foreground `,
            inset && 'pl-8',
            className,
        )}
        {...rest}
    >
        {children}
        <SystemIcons.ChevronRight className='ml-auto h-4 w-4' />
    </MenubarPrimitive.SubTrigger>
)

const SubContent: MenubarComponents.SubContent = ({ className, ...rest }) => (
    <MenubarPrimitive.Portal>
        <MenubarPrimitive.SubContent
            className={classNames(
                `z-50 min-w-[12rem] backdrop-blur-sm  rounded-xl border p-1 shadow-md shadow-black/50
       data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
       data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2
       border-border-background bg-background text-label-primary`,
                className,
            )}
            {...rest}
        />
    </MenubarPrimitive.Portal>
)

const Content: MenubarComponents.Content = ({
    className,
    align = 'start',
    alignOffset = -4,
    sideOffset = 8,
    ...props
}) => (
    <MenubarPrimitive.Portal>
        <MenubarPrimitive.Content
            align={align}
            alignOffset={alignOffset}
            sideOffset={sideOffset}
            className={classNames(
                ` bg-background border-border-background shadow-md shadow-black/50
        z-50 min-w-[12rem] backdrop-blur-sm rounded-xl border p-1
         data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
         data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2
          text-neutral-50`,
                className,
            )}
            {...props}
        />
    </MenubarPrimitive.Portal>
)

const Item: MenubarComponents.Item = ({ className, inset, ...props }) => (
    <MenubarPrimitive.Item
        className={classNames(
            `relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-xs outline-hidden border border-transparent
      data-disabled:pointer-events-none data-disabled:opacity-50 text-label-primary font-medium
      focus:bg-secondary focus:text-secondary-foreground `,
            inset && 'pl-8',
            className,
        )}
        {...props}
    />
)

const CheckboxItem: MenubarComponents.CheckboxItem = ({ className, children, checked, ...props }) => (
    <MenubarPrimitive.CheckboxItem
        className={cn(
            `relative flex cursor-default select-none items-center rounded-xs py-1.5 pl-8 pr-2 text-sm outline-hidden
            not-data-[state=checked]:focus:bg-secondary not-data-[state=checked]:focus:text-secondary-foreground
            data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground
            data-disabled:pointer-events-none data-disabled:opacity-50`,
            className,
        )}
        checked={checked}
        {...props}
    >
        <span className='absolute left-2 flex h-3.5 w-3.5 items-center justify-center'>
            <MenubarPrimitive.ItemIndicator>
                <SystemIcons.Check className='h-4 w-4' />
            </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
    </MenubarPrimitive.CheckboxItem>
)

const RadioItem: MenubarComponents.RadioItem = ({ className, children, ...props }) => (
    <MenubarPrimitive.RadioItem
        className={cn(
            `relative flex cursor-default select-none items-center rounded-xs py-1.5 pl-8 pr-2 text-sm outline-hidden
            not-data-[state=checked]:focus:bg-secondary not-data-[state=checked]:focus:text-secondary-foreground
            data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground
            data-disabled:pointer-events-none data-disabled:opacity-50`,
            className,
        )}
        {...props}
    >
        <span className='absolute left-2 flex h-3.5 w-3.5 items-center justify-center'>
            <MenubarPrimitive.ItemIndicator>
                <SystemIcons.Circle className='h-2 w-2 fill-current' />
            </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
    </MenubarPrimitive.RadioItem>
)

const Label: MenubarComponents.Label = ({ className, inset, ...rest }) => (
    <MenubarPrimitive.Label className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)} {...rest} />
)

const Separator: MenubarComponents.Separator = ({ className, ...rest }) => (
    <MenubarPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-neutral-400/25', className)} {...rest} />
)

const Shortcut: MenubarComponents.Shortcut = ({ className, ...rest }) => (
    <span className={cn('ml-auto text-xs tracking-widest text-neutral-400', className)} {...rest} />
)

export const Menubar = {
    Root,
    Menu,
    Group,
    Portal,
    Sub,
    RadioGroup,
    Trigger,
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
