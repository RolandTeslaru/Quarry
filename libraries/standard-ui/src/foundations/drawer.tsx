'use client'

import * as React from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'
import { cn } from '../utils/cn'
import { cx } from 'class-variance-authority'

namespace DrawerComponents {
    export type Root = React.ComponentProps<typeof DrawerPrimitive.Root>
    export type Trigger = React.ComponentProps<typeof DrawerPrimitive.Trigger>
    export type Portal = React.ComponentProps<typeof DrawerPrimitive.Portal>
    export type Close = React.ComponentProps<typeof DrawerPrimitive.Close>
    export type Overlay = React.ComponentProps<typeof DrawerPrimitive.Overlay>
    export type Content = React.ComponentProps<typeof DrawerPrimitive.Content>
    export type Header = React.ComponentProps<'div'>
    export type Footer = React.ComponentProps<'div'>
    export type Title = React.ComponentProps<typeof DrawerPrimitive.Title>
    export type Description = React.ComponentProps<typeof DrawerPrimitive.Description>
}

function Root({ ...props }: DrawerComponents.Root) {
    return <DrawerPrimitive.Root data-slot='drawer' {...props} />
}

function Trigger({ ...props }: DrawerComponents.Trigger) {
    return <DrawerPrimitive.Trigger data-slot='drawer-trigger' {...props} />
}

function Portal({ ...props }: DrawerComponents.Portal) {
    return <DrawerPrimitive.Portal data-slot='drawer-portal' {...props} />
}

function Close({ ...props }: DrawerComponents.Close) {
    return <DrawerPrimitive.Close data-slot='drawer-close' {...props} />
}

function Overlay({ className, ...props }: DrawerComponents.Overlay) {
    return (
        <DrawerPrimitive.Overlay
            data-slot='drawer-overlay'
            className={cn(
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
                className,
            )}
            {...props}
        />
    )
}

function Content({ className, children, ...props }: DrawerComponents.Content) {
    return (
        <Portal data-slot='drawer-portal'>
            <Overlay />
            <DrawerPrimitive.Content
                data-slot='drawer-content'
                className={cn(
                    'group/drawer-content bg-background fixed z-50 flex h-auto flex-col',
                    'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b',
                    'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t',
                    'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm',
                    'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm',
                    className,
                )}
                {...props}
            >
                <div className='bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block' />
                {children}
            </DrawerPrimitive.Content>
        </Portal>
    )
}

function Header({ className, ...props }: DrawerComponents.Header) {
    return (
        <div
            data-slot='drawer-header'
            className={cn(
                'flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left',
                className,
            )}
            {...props}
        />
    )
}

function Footer({ className, ...props }: DrawerComponents.Footer) {
    return <div data-slot='drawer-footer' className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
}

function Title({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
    return (
        <DrawerPrimitive.Title
            data-slot='drawer-title'
            className={cn('text-foreground font-semibold', className)}
            {...props}
        />
    )
}

function Description({ className, ...props }: DrawerComponents.Description) {
    return (
        <DrawerPrimitive.Description
            data-slot='drawer-description'
            className={cn('text-muted-foreground text-sm', className)}
            {...props}
        />
    )
}

const Body = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(({ className, ...props }, ref) => {
    return <div ref={ref} className={cx('flex-1 py-4', className)} {...props} />
})

export const Drawer = {
    Root,
    Body,
    Portal,
    Overlay,
    Trigger,
    Close,
    Content,
    Header,
    Footer,
    Title,
    Description,
}
