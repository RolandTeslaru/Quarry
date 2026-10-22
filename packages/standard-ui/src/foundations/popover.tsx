import type { FC, ReactNode, ComponentProps } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '../utils/cn'
import { cva } from 'class-variance-authority'
import { FloatingPointer } from './floatingPointer'
// import { useLocalWindowContext } from "../SDKs/WindowSDK/localContext"

namespace PopoverComponents {
    export type Root = FC<ComponentProps<typeof PopoverPrimitive.Root>>
    export type Trigger = FC<
        ComponentProps<typeof PopoverPrimitive.Trigger> & {
            disableStyling?: boolean
            className?: string
            icon?: ReactNode
        }
    >
    export type Anchor = FC<ComponentProps<typeof PopoverPrimitive.Anchor>>
    export type Content = FC<
        ComponentProps<typeof PopoverPrimitive.Content> & {
            pointer?: boolean
        }
    >
    export type Item = FC<
        React.HTMLAttributes<HTMLDivElement> & {
            children?: ReactNode
            icon?: ReactNode
            variant?: 'default' | 'destructive'
        }
    >
}

const Root: PopoverComponents.Root = (props) => {
    return <PopoverPrimitive.Root {...props} />
}

const Anchor: PopoverComponents.Anchor = (props) => {
    return <PopoverPrimitive.Anchor {...props} />
}

const Trigger: PopoverComponents.Trigger = ({ ref, children, icon, disableStyling, ...rest }) => {
    return (
        <PopoverPrimitive.Trigger ref={ref} {...rest}>
            {children}
        </PopoverPrimitive.Trigger>
    )
}

const Content: PopoverComponents.Content = ({
    ref,
    className,
    children,
    sideOffset = 1,
    align = 'center',
    side = 'bottom',
    arrowPadding = 10,
    pointer = true,
    ...rest
}) => {
    // const { externalContainer } = useLocalWindowContext()
    return (
        // <PopoverPrimitive.Portal container={externalContainer}>
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                ref={ref}
                align={align}
                side={side}
                sideOffset={sideOffset}
                arrowPadding={arrowPadding}
                className={cn(
                    `standard-popup-motion z-50 outline-none backdrop-blur-lg bg-popover/80
                    border border-popover-border rounded-lg p-1 shadow-black/15 dark:shadow-black/50 shadow-xl
                    origin-(--radix-popover-content-transform-origin)`,
                    className,
                )}
                {...rest}
            >
                {children}
                {pointer && (
                    <PopoverPrimitive.Arrow asChild>
                        <FloatingPointer />
                    </PopoverPrimitive.Arrow>
                )}
            </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
    )
}
Content.displayName = PopoverPrimitive.Content.displayName

const popoverItemVariants = cva(
    'cursor-pointer font-roboto-mono relative gap-2 px-2 py-[6px] rounded-lg flex text-xs border border-transparent ',
    {
        variants: {
            variant: {
                default: `text-label-primary hover:bg-secondary hover:text-secondary-foreground
                    focus:bg-secondary focus:text-secondary-foreground `,
                destructive: `text-destructive hover:bg-secondary
                    focus:bg-secondary `,
            },
        },
    },
)

const Item: PopoverComponents.Item = ({ children, className, icon, variant = 'default', ...rest }) => {
    return (
        <div className={popoverItemVariants({ variant }) + ' ' + className} {...rest}>
            <div className='absolute top-1/2 -translate-y-1/2 '>{icon}</div>
            <div className={`${icon && 'pl-7'} text-sm`}>{children}</div>
        </div>
    )
}

export const Popover = { Root, Trigger, Item, Content, Anchor }
