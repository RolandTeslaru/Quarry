'use client'

import * as Popover from '@radix-ui/react-popover'
import * as React from 'react'
import { cn } from '../utils/cn'
import { cva } from 'class-variance-authority'
// import { useLocalWindowContext } from "../SDKs/WindowSDK/localContext"

const shortcutStyles = cn(
    'hidden h-6 select-none items-center justify-center rounded-md bg-gray-800 px-2 font-mono text-xs text-gray-400 ring-1 ring-inset ring-gray-700 transition sm:flex',
)

interface CommandBarProps extends React.PropsWithChildren {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    defaultOpen?: boolean
    disableAutoFocus?: boolean
}

const CommandBar = ({
    open = false,
    onOpenChange,
    defaultOpen = false,
    disableAutoFocus = true,
    children,
}: CommandBarProps) => {
    // const { externalContainer } = useLocalWindowContext()

    return (
        <Popover.Root open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
            <Popover.Anchor className={cn('fixed inset-x-0 bottom-12 mx-auto w-fit items-center')} />
            {/* <Popover.Portal container={externalContainer}> */}
            <Popover.Portal>
                <Popover.Content
                    side='top'
                    sideOffset={0}
                    onOpenAutoFocus={(e) => {
                        if (disableAutoFocus) {
                            e.preventDefault()
                        }
                    }}
                    className={cn(
                        ` z-50 rounded-xl p-3 border-[1px] border-popover-border bg-popover text-popover-foreground shadow-xl shadow-black/40 backdrop-blur-xs outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2`,
                    )}
                >
                    <div className='-m-2'>{children}</div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
CommandBar.displayName = 'CommandBar'

const CommandBarValue = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
    ({ className, ...props }, ref) => {
        return <div ref={ref} className={cn(' text-sm tabular-nums text-gray-300', className)} {...props} />
    },
)
CommandBarValue.displayName = 'CommandBar.Value'

const CommandBarBar = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
    ({ className, ...props }, ref) => {
        return <div ref={ref} className={cn('relative flex items-center', className)} {...props} />
    },
)
CommandBarBar.displayName = 'CommandBarBar'

const CommandBarSeperator = React.forwardRef<HTMLDivElement, Omit<React.ComponentPropsWithoutRef<'div'>, 'children'>>(
    ({ className, ...props }, ref) => {
        return <div ref={ref} className={cn('h-4 w-px bg-gray-700', className)} {...props} />
    },
)
CommandBarSeperator.displayName = 'CommandBar.Seperator'

const commandBarCommandVariants = cva(
    'cursor-pointer relative gap-2 px-2 py-0.5 rounded-lg flex text-sm border border-transparent w-full items-center justify-between',
    {
        variants: {
            variant: {
                default: `text-label-primary hover:bg-secondary hover:text-secondary-foreground
                    focus:bg-secondary focus:text-secondary-foreground `,
                disabled: 'text-gray-500 cursor-not-allowed',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
)

interface CommandProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children' | 'onClick'> {
    action: () => void | Promise<void>
    label: string
    shortcut: { shortcut: string; label?: string }
}

const CommandBarCommand = React.forwardRef<HTMLButtonElement, CommandProps>(
    ({ className, type = 'button', label, action, shortcut, disabled, ...props }: CommandProps, ref) => {
        React.useEffect(() => {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === shortcut.shortcut) {
                    event.preventDefault()
                    event.stopPropagation()
                    action()
                }
            }

            if (!disabled) {
                document.addEventListener('keydown', handleKeyDown)
            }

            return () => {
                document.removeEventListener('keydown', handleKeyDown)
            }
        }, [action, shortcut, disabled])

        return (
            <button
                ref={ref}
                type={type}
                onClick={action}
                disabled={disabled}
                className={cn(commandBarCommandVariants({ variant: disabled ? 'disabled' : 'default' }), className)}
                {...props}
            >
                <span className='text-xs font-roboto-mono'>{label}</span>
                <span className={shortcutStyles}>
                    {shortcut.label ? shortcut.label.toUpperCase() : shortcut.shortcut.toUpperCase()}
                </span>
            </button>
        )
    },
)
CommandBarCommand.displayName = 'CommandBar.Command'

export { CommandBar, CommandBarBar, CommandBarCommand, CommandBarSeperator, CommandBarValue }
