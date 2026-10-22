'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps, FC } from 'react'
import { cn } from '../utils/cn'
import classNames from 'classnames'
import { ScrollArea } from './scrollArea'
import { Button, type ButtonProps } from './button'

namespace DialogComponents {
    export type Root = FC<ComponentProps<typeof DialogPrimitive.Root>>
    export type Trigger = FC<ComponentProps<typeof DialogPrimitive.Trigger>>
    export type Portal = FC<ComponentProps<typeof DialogPrimitive.Portal>>
    export type Close = FC<ComponentProps<typeof DialogPrimitive.Close>>
    export type Overlay = FC<ComponentProps<typeof DialogPrimitive.Overlay>>
    export type Content = FC<
        ComponentProps<typeof DialogPrimitive.Content> & {
            darkenBackground?: boolean
            blockTransparency?: boolean
            // Skip the default surface (background / blur) entirely so the caller draws its own.
            unstyled?: boolean
            theme?: 'dark' | 'light'
        }
    >
    export type Header = FC<React.HTMLAttributes<HTMLDivElement>>
    export type Footer = FC<React.HTMLAttributes<HTMLDivElement>>
    export type Title = FC<ComponentProps<typeof DialogPrimitive.Title>>
    export type Description = FC<ComponentProps<typeof DialogPrimitive.Description>>
    export type FloatingHeader = FC<{
        title: React.ReactNode
        icon?: React.ReactNode
        children?: React.ReactNode
    }>
    export type MaskedScrollArea = FC<{
        className?: string
        children?: React.ReactNode
        scroll?: boolean
    }>
    export type FloatingFooter = FC<{ children?: React.ReactNode }>
    export type Action = FC<ComponentProps<'button'> & ButtonProps>
    export type Cancel = FC<ComponentProps<'button'> & ButtonProps>
}

const Root: DialogComponents.Root = (props) => <DialogPrimitive.Root {...props} />

const Trigger: DialogComponents.Trigger = (props) => <DialogPrimitive.Trigger {...props} />

const Portal: DialogComponents.Portal = (props) => <DialogPrimitive.Portal {...props} />

const Close: DialogComponents.Close = (props) => <DialogPrimitive.Close {...props} />

const Overlay: DialogComponents.Overlay = ({ className, ...rest }) => (
    <DialogPrimitive.Overlay
        className={cn(
            `fixed inset-0 z-50 bg-black/40 dark:bg-black/70
      data-[state=open]:animate-in
      data-[state=closed]:animate-out
      data-[state=closed]:fade-out-0
      data-[state=open]:fade-in-0`,
            className,
        )}
        {...rest}
    />
)

const Content: DialogComponents.Content = ({
    children,
    style,
    className,
    blockTransparency = false,
    darkenBackground = true,
    unstyled = false,
    theme,
    ...rest
}) => (
    <Portal>
        {/* Always mounted: the overlay carries the scroll lock that lets this dialog's content wheel-scroll. */}
        <Overlay className={darkenBackground ? undefined : 'bg-transparent dark:bg-transparent'} />
        <DialogPrimitive.Content
            // Nothing inside is auto-focused on open, so no control opens wearing a focus ring.
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={classNames(
                `${theme || ''} fixed top-[50%] left-[50%] z-50 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0
         transition-[transform] duration-400 ease-in-out
         `,
                // Unstyled animates transform only: keyframes touching opacity would blank descendant backdrop blurs.
                unstyled
                    ? `data-[state=open]:animate-[dialog-zoom-in_150ms_ease-in-out]
             data-[state=closed]:animate-[dialog-zoom-out_150ms_ease-in-out_both]`
                    : classNames(
                          `data-[state=open]:animate-in
               data-[state=closed]:animate-out
               data-[state=open]:fade-in-0
               data-[state=closed]:fade-out-0
               data-[state=closed]:zoom-out-70
               data-[state=open]:zoom-in-70
               data-[state=closed]:slide-out-to-left-1/2
               data-[state=closed]:slide-out-to-top-[48%]
               data-[state=open]:slide-in-from-left-1/2
               data-[state=open]:slide-in-from-top-[48%]
               `,
                          'surface-elevated rounded-2xl border shadow-2xl shadow-neutral-500/60 dark:shadow-black/60',
                          blockTransparency && '[--material-opacity:100%] backdrop-blur-none!',
                      ),
                className,
            )}
            style={{
                // boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.5)",
                ...style,
            }}
            {...rest}
        >
            {children}
        </DialogPrimitive.Content>
    </Portal>
)

const Header: DialogComponents.Header = ({ className, ...props }) => (
    <div className={cn('flex flex-col space-y-1.5 gap-1 text-center sm:text-left', className)} {...props} />
)

const Footer: DialogComponents.Footer = ({ className, ...rest }) => (
    <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...rest} />
)

function Title({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
    return (
        <DialogPrimitive.Title
            className={cn(
                'text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
                className,
            )}
            {...props}
        />
    )
}

function Description({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description
            className={cn(
                'text-muted-foreground *:[a]:hover:text-foreground text-sm text-balance md:text-pretty *:[a]:underline *:[a]:underline-offset-3',
                className,
            )}
            {...props}
        />
    )
}

const SCROLL_MASK =
    '[mask-image:linear-gradient(to_bottom,transparent_0,black_80px,black_calc(100%_-_80px),transparent_100%)]'

const FloatingHeader: DialogComponents.FloatingHeader = ({ title, icon, children }) => (
    <div className='pointer-events-none absolute top-0 left-0 z-90 w-full flex flex-row items-center gap-2 px-4 pt-5 pb-4'>
        {icon && <span className='flex shrink-0 [&>*]:size-5'>{icon}</span>}
        <Title className='text-sm font-semibold text-foreground'>{title}</Title>
        {children}
    </div>
)

const MaskedScrollArea: DialogComponents.MaskedScrollArea = ({ className, children, scroll = true }) => {
    if (!scroll) {
        return <div className={cn('h-full', SCROLL_MASK, className)}>{children}</div>
    }

    return (
        <ScrollArea.Root className={cn(SCROLL_MASK, className)}>
            <div className='relative min-h-full pt-16 pb-20 px-4 flex flex-col gap-3'>{children}</div>
        </ScrollArea.Root>
    )
}

const FloatingFooter: DialogComponents.FloatingFooter = ({ children }) => (
    <div className='pointer-events-none absolute bottom-0 left-0 right-0 w-full flex flex-row justify-end gap-2 px-4 pt-2 pb-4 [&>*]:pointer-events-auto'>
        {children}
    </div>
)

const Action: DialogComponents.Action = ({ className, ...rest }) => (
    <Button className={cn('rounded-md', className)} {...rest} />
)

const Cancel: DialogComponents.Cancel = ({ className, variant = 'minimal', type = 'button', ...rest }) => (
    <DialogPrimitive.Close asChild>
        <Button type={type} variant={variant} className={cn('rounded-md', className)} {...rest} />
    </DialogPrimitive.Close>
)

export const Dialog = {
    Root,
    Trigger,
    Portal,
    Close,
    Overlay,
    Content,
    Header,
    Footer,
    Title,
    Description,
    FloatingHeader,
    MaskedScrollArea,
    FloatingFooter,
    Action,
    Cancel,
}
