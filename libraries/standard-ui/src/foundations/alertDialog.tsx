import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import type { ComponentProps, FC } from 'react'

import { Button, type ButtonProps } from './button'
import { cn } from '../utils/cn'

namespace AlertDialogComponents {
    export type Root = FC<ComponentProps<typeof AlertDialogPrimitive.Root>>
    export type Trigger = FC<ComponentProps<typeof AlertDialogPrimitive.Trigger>>
    export type Portal = FC<ComponentProps<typeof AlertDialogPrimitive.Portal>>
    export type Overlay = FC<ComponentProps<typeof AlertDialogPrimitive.Overlay>>
    export type Content = FC<
        ComponentProps<typeof AlertDialogPrimitive.Content> & {
            darkenBackground?: boolean
            blockTransparency?: boolean
            showTriangle?: boolean
            // Skip the default surface (background / blur) entirely so the caller draws its own.
            unstyled?: boolean
            theme?: 'dark' | 'light'
        }
    >
    export type Header = FC<React.HTMLAttributes<HTMLDivElement>>
    export type Footer = FC<React.HTMLAttributes<HTMLDivElement>>
    export type Title = FC<ComponentProps<typeof AlertDialogPrimitive.Title>>
    export type Description = FC<ComponentProps<typeof AlertDialogPrimitive.Description>>
    export type Action = FC<ComponentProps<typeof AlertDialogPrimitive.Action> & ButtonProps>
    export type Cancel = FC<ComponentProps<typeof AlertDialogPrimitive.Cancel> & ButtonProps>
}

const Root: AlertDialogComponents.Root = (props) => <AlertDialogPrimitive.Root data-slot='alert-dialog' {...props} />

const Trigger: AlertDialogComponents.Trigger = (props) => (
    <AlertDialogPrimitive.Trigger data-slot='alert-dialog-trigger' {...props} />
)

const Portal: AlertDialogComponents.Portal = (props) => (
    <AlertDialogPrimitive.Portal data-slot='alert-dialog-portal' {...props} />
)

const Overlay: AlertDialogComponents.Overlay = ({ className, ...props }) => (
    <AlertDialogPrimitive.Overlay
        className={cn(
            'fixed inset-0 z-50 bg-black/30 dark:bg-black/70  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            className,
        )}
        {...props}
    />
)

const Content: AlertDialogComponents.Content = ({
    darkenBackground = true,
    blockTransparency = false,
    unstyled = false,
    theme,
    style,
    className,
    children,
    ...rest
}) => (
    <Portal>
        {darkenBackground && <Overlay />}
        <AlertDialogPrimitive.Content
            data-slot='alert-dialog-content'
            className={cn(
                `${theme || ''} fixed left-[50%] top-[50%] z-50
         outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0
         transition-[opacity,transform,filter] duration-400 ease-in-out
         `,
                // Unstyled animates transform only: keyframes touching opacity would blank descendant backdrop blurs.
                unstyled
                    ? `data-[state=open]:animate-[dialog-zoom-in_150ms_ease-in-out]
             data-[state=closed]:animate-[dialog-zoom-out_150ms_ease-in-out_both]`
                    : cn(
                          `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-70
               data-[state=open]:zoom-in-70 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2
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
        </AlertDialogPrimitive.Content>
    </Portal>
)

const Header: AlertDialogComponents.Header = ({ className, ...rest }) => (
    <div className={cn('flex flex-col space-y-2 text-center sm:text-left ', className)} {...rest} />
)

const Footer: AlertDialogComponents.Footer = ({ className, ...rest }) => (
    <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-4', className)} {...rest} />
)

const Title: AlertDialogComponents.Title = ({ className, ...rest }) => (
    <AlertDialogPrimitive.Title
        className={cn('text-lg  text-foreground antialiased font-semibold font-roboto-mono', className)}
        {...rest}
    />
)

const Description: AlertDialogComponents.Description = ({ className, ...rest }) => (
    <AlertDialogPrimitive.Description
        className={cn('text-sm text-muted-foreground max-w-[500px] font-inter', className)}
        {...rest}
    />
)

const Action: AlertDialogComponents.Action = ({ asChild = false, children, ...props }) => (
    <AlertDialogPrimitive.Action asChild>
        <Button asChild={asChild} {...props}>
            {children}
        </Button>
    </AlertDialogPrimitive.Action>
)

const Cancel: AlertDialogComponents.Cancel = ({ asChild = false, variant = 'minimal', children, ...props }) => (
    <AlertDialogPrimitive.Cancel asChild>
        <Button asChild={asChild} variant={variant} {...props}>
            {children}
        </Button>
    </AlertDialogPrimitive.Cancel>
)

export const AlertDialog = {
    Root,
    Trigger,
    Portal,
    Overlay,
    Content,
    Header,
    Footer,
    Title,
    Description,
    Action,
    Cancel,
}
