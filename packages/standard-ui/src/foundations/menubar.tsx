import type { FC, ComponentProps, HTMLAttributes } from 'react'
import * as MenubarPrimitive from '@radix-ui/react-menubar'
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
    export type Content = FC<ComponentProps<typeof MenubarPrimitive.Content> & { pointer?: boolean }>
    export type Item = FC<ComponentProps<typeof MenubarPrimitive.Item> & {
        inset?: boolean
        variant?: 'default' | 'destructive'
    }>
    export type CheckboxItem = FC<ComponentProps<typeof MenubarPrimitive.CheckboxItem>>
    export type RadioItem = FC<ComponentProps<typeof MenubarPrimitive.RadioItem>>
    export type Label = FC<ComponentProps<typeof MenubarPrimitive.Label> & { inset?: boolean }>
    export type Separator = FC<ComponentProps<typeof MenubarPrimitive.Separator>>
    export type Shortcut = FC<HTMLAttributes<HTMLSpanElement>>
}

const Root: MenubarComponents.Root = ({ className, ...props }) => (
    <MenubarPrimitive.Root
        data-slot='menubar'
        className={cn('flex w-fit items-center gap-1', className)}
        {...props}
    />
)

const Menu: MenubarComponents.Menu = props => <MenubarPrimitive.Menu {...props} />

const Group: MenubarComponents.Group = props => <MenubarPrimitive.Group data-slot='menubar-group' {...props} />

const Portal: MenubarComponents.Portal = props => <MenubarPrimitive.Portal {...props} />

const Sub: MenubarComponents.Sub = props => <MenubarPrimitive.Sub {...props} />

const RadioGroup: MenubarComponents.RadioGroup = props => (
    <MenubarPrimitive.RadioGroup data-slot='menubar-radio-group' {...props} />
)

const Trigger: MenubarComponents.Trigger = ({ className, ...props }) => (
    <MenubarPrimitive.Trigger
        data-slot='menubar-trigger'
        className={cn(
            `flex h-7 cursor-pointer select-none items-center rounded-md border border-transparent
            px-2 text-sm font-medium text-foreground outline-hidden
            hover:bg-secondary hover:text-secondary-foreground
            focus:bg-secondary focus:text-secondary-foreground
            data-[state=open]:bg-secondary data-[state=open]:text-secondary-foreground
            data-[disabled]:pointer-events-none data-[disabled]:opacity-50`,
            className,
        )}
        {...props}
    />
)

const Content: MenubarComponents.Content = ({
    className,
    children,
    align = 'start',
    alignOffset = 0,
    sideOffset = 4,
    arrowPadding = 10,
    pointer = true,
    ...props
}) => (
    <MenubarPrimitive.Portal>
        <MenubarPrimitive.Content
            data-slot='menubar-content'
            align={align}
            alignOffset={alignOffset}
            sideOffset={sideOffset}
            arrowPadding={arrowPadding}
            className={cn(
                menuContentClasses,
                `max-h-(--radix-menubar-content-available-height)
                origin-(--radix-menubar-content-transform-origin)`,
                className,
            )}
            {...props}
        >
            <div className='min-h-0 overflow-x-hidden overflow-y-auto'>
                {children}
            </div>
            {pointer && (
                <MenubarPrimitive.Arrow asChild>
                    <FloatingPointer />
                </MenubarPrimitive.Arrow>
            )}
        </MenubarPrimitive.Content>
    </MenubarPrimitive.Portal>
)

const Item: MenubarComponents.Item = ({ className, inset, variant = 'default', ...props }) => (
    <MenubarPrimitive.Item
        data-slot='menubar-item'
        data-inset={inset}
        data-variant={variant}
        className={cn(menuItemClasses, 'group/menubar-item', className)}
        {...props}
    />
)

const CheckboxItem: MenubarComponents.CheckboxItem = ({ className, children, checked, ...props }) => (
    <MenubarPrimitive.CheckboxItem
        data-slot='menubar-checkbox-item'
        className={cn(menuCheckableItemClasses, className)}
        checked={checked}
        {...props}
    >
        <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
            <MenubarPrimitive.ItemIndicator>
                <Icon name='tick' className='size-4 text-current!' />
            </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
    </MenubarPrimitive.CheckboxItem>
)

const RadioItem: MenubarComponents.RadioItem = ({ className, children, ...props }) => (
    <MenubarPrimitive.RadioItem
        data-slot='menubar-radio-item'
        className={cn(menuCheckableItemClasses, className)}
        {...props}
    >
        <span className='pointer-events-none absolute left-2 flex size-3.5 items-center justify-center'>
            <MenubarPrimitive.ItemIndicator>
                <Icon name='full-circle' className='size-2 text-current! fill-current' />
            </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
    </MenubarPrimitive.RadioItem>
)

const Label: MenubarComponents.Label = ({ className, inset, ...props }) => (
    <MenubarPrimitive.Label
        data-slot='menubar-label'
        data-inset={inset}
        className={cn(menuLabelClasses, className)}
        {...props}
    />
)

const Separator: MenubarComponents.Separator = ({ className, ...props }) => (
    <MenubarPrimitive.Separator
        data-slot='menubar-separator'
        className={cn(menuSeparatorClasses, className)}
        {...props}
    />
)

const Shortcut: MenubarComponents.Shortcut = ({ className, ...props }) => (
    <span data-slot='menubar-shortcut' className={cn(menuShortcutClasses, className)} {...props} />
)

const SubTrigger: MenubarComponents.SubTrigger = ({ className, inset, children, ...props }) => (
    <MenubarPrimitive.SubTrigger
        data-slot='menubar-sub-trigger'
        data-inset={inset}
        className={cn(menuSubTriggerClasses, className)}
        {...props}
    >
        {children}
        <Icon name='chevron-right' className='ml-auto size-4' />
    </MenubarPrimitive.SubTrigger>
)

const SubContent: MenubarComponents.SubContent = ({ className, ...props }) => (
    <MenubarPrimitive.Portal>
        <MenubarPrimitive.SubContent
            data-slot='menubar-sub-content'
            className={cn(
                menuSubContentClasses,
                'origin-(--radix-menubar-content-transform-origin)',
                className,
            )}
            {...props}
        />
    </MenubarPrimitive.Portal>
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
