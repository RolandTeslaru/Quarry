import React from 'react'
import { DialogSDK } from '../sdk'
import { Dialog } from '../../../foundations/dialog'
import { cn } from '../../../utils/cn'
import { useAnimationDelay, SPLIT_SHELL, DIALOG_STACK_Z_INDEX } from './motion'

const SplitHeader: DialogSDK.SplitTemplate.Header = ({ children }) => (
    <div className='grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2'>{children}</div>
)

const SplitIcon: DialogSDK.SplitTemplate.Icon = ({ icon: Icon, size = 'default' }) => (
    <Icon className={cn('shrink-0', size === 'lg' ? 'size-10' : 'size-6')} />
)

const SplitTitle: DialogSDK.SplitTemplate.Title = ({ children }) => (
    <h2 className='text-base font-semibold text-foreground'>{children}</h2>
)

const SplitDescription: DialogSDK.SplitTemplate.Description = ({ children }) => (
    <p className='col-span-2 text-xs text-muted-foreground'>{children}</p>
)

export const Template: DialogSDK.Template = ({
    children,
    entry,
    dialogsSize,
    index,
    blockTransparency,
    className,
    dismissible = true,
}) => {
    const delayStyle = useAnimationDelay(entry.isOpen)
    const scaleOffset = (index - (dialogsSize - 1)) * 8
    const verticalOffset = (index - (dialogsSize - 1)) * 40
    const finalScale = 1 + scaleOffset / 100

    const blockDismiss = dismissible ? undefined : (e: Event) => e.preventDefault()

    return (
        <Dialog.Root
            open={entry.isOpen}
            onOpenChange={(open) => {
                if (!open && dismissible) {
                    DialogSDK.actions.pop(entry.dialogId)
                }
            }}
        >
            <Dialog.Content
                style={{
                    ...delayStyle,
                    transform: `translate(-50%, -50%) translateY(${verticalOffset}px) scale(${finalScale})`,
                    zIndex: DIALOG_STACK_Z_INDEX + index,

                    filter: `brightness(${1 / (dialogsSize - index)})`,
                }}
                darkenBackground={index === 0}
                blockTransparency={blockTransparency}
                className={className}
                onInteractOutside={blockDismiss}
                onEscapeKeyDown={blockDismiss}
            >
                {children}
            </Dialog.Content>
        </Dialog.Root>
    )
}

export const UnstyledTemplate: DialogSDK.UnstyledTemplate = ({
    children,
    entry,
    dialogsSize,
    index,
    className,
    dismissible = true,
}) => {
    const delayStyle = useAnimationDelay(entry.isOpen)
    const scaleOffset = (index - (dialogsSize - 1)) * 8
    const verticalOffset = (index - (dialogsSize - 1)) * 40
    const finalScale = 1 + scaleOffset / 100

    const blockDismiss = dismissible ? undefined : (e: Event) => e.preventDefault()

    return (
        <Dialog.Root
            open={entry.isOpen}
            onOpenChange={(open) => {
                if (!open && dismissible) {
                    DialogSDK.actions.pop(entry.dialogId)
                }
            }}
        >
            <Dialog.Content
                unstyled
                style={{
                    ...delayStyle,
                    transform: `translate(-50%, -50%) translateY(${verticalOffset}px) scale(${finalScale})`,
                    zIndex: DIALOG_STACK_Z_INDEX + index,
                }}
                darkenBackground={index === 0}
                className={className}
                onInteractOutside={blockDismiss}
                onEscapeKeyDown={blockDismiss}
            >
                {children}
            </Dialog.Content>
        </Dialog.Root>
    )
}

export const SplitTemplate: DialogSDK.SplitTemplate = Object.assign(
    ({
        children,
        sidebarClassName,
        contentClassName,
        sidebarRenderer,
        surfaceStyle,
        entry,
        dialogsSize,
        index,
        className,
        dismissible = true,
    }: DialogSDK.SplitTemplate.Props) => {
        const delayStyle = useAnimationDelay(entry.isOpen)
        const scaleOffset = (index - (dialogsSize - 1)) * 8
        const verticalOffset = (index - (dialogsSize - 1)) * 40
        const finalScale = 1 + scaleOffset / 100

        const blockDismiss = dismissible ? undefined : (e: Event) => e.preventDefault()

        return (
            <Dialog.Root
                open={entry.isOpen}
                onOpenChange={(open) => {
                    if (!open && dismissible) {
                        DialogSDK.actions.pop(entry.dialogId)
                    }
                }}
            >
                <Dialog.Content
                    unstyled
                    style={{
                        ...delayStyle,
                        transform: `translate(-50%, -50%) translateY(${verticalOffset}px) scale(${finalScale})`,
                        zIndex: DIALOG_STACK_Z_INDEX + index,
                    }}
                    darkenBackground={index === 0}
                    className={cn(SPLIT_SHELL, className)}
                    onInteractOutside={blockDismiss}
                    onEscapeKeyDown={blockDismiss}
                >
                    <div
                        className={cn(
                            'surface-elevated-sidebar rounded-l-2xl border border-r-separator min-w-[200px] pb-4 px-6 pt-5 flex flex-col gap-2 ',
                            sidebarClassName,
                        )}
                        style={{ ...surfaceStyle, ...delayStyle }}
                    >
                        {sidebarRenderer()}
                    </div>
                    <div
                        className={cn(
                            'relative surface-elevated rounded-r-2xl border-y border-r flex flex-col h-full gap-4 p-3 flex-1  min-h-[150px] ',
                            contentClassName,
                        )}
                        style={{ ...surfaceStyle, ...delayStyle }}
                    >
                        {children}
                    </div>
                </Dialog.Content>
            </Dialog.Root>
        )
    },
    {
        Header: SplitHeader,
        Icon: SplitIcon,
        Title: SplitTitle,
        Description: SplitDescription,
    },
)

export const TripleSplitTemplate: DialogSDK.TripleSplitTemplate = ({
    children,
    leftSidebarClassName,
    rightSidebarClassName,
    contentClassName,
    leftSidebarRenderer,
    rightSidebarRenderer,
    surfaceStyle,
    entry,
    dialogsSize,
    index,
    className,
    dismissible = true,
}) => {
    const delayStyle = useAnimationDelay(entry.isOpen)
    const scaleOffset = (index - (dialogsSize - 1)) * 8
    const verticalOffset = (index - (dialogsSize - 1)) * 40
    const finalScale = 1 + scaleOffset / 100

    const blockDismiss = dismissible ? undefined : (e: Event) => e.preventDefault()

    return (
        <Dialog.Root
            open={entry.isOpen}
            onOpenChange={(open) => {
                if (!open && dismissible) {
                    DialogSDK.actions.pop(entry.dialogId)
                }
            }}
        >
            <Dialog.Content
                unstyled
                style={{
                    ...delayStyle,
                    transform: `translate(-50%, -50%) translateY(${verticalOffset}px) scale(${finalScale})`,
                    zIndex: DIALOG_STACK_Z_INDEX + index,
                }}
                darkenBackground={index === 0}
                className={cn(SPLIT_SHELL, className)}
                onInteractOutside={blockDismiss}
                onEscapeKeyDown={blockDismiss}
            >
                <div
                    className={cn(
                        'surface-elevated-sidebar rounded-l-2xl border border-r-separator min-w-[200px] p-4 pt-5 flex flex-col gap-2 ',
                        leftSidebarClassName,
                    )}
                    style={{ ...surfaceStyle, ...delayStyle }}
                >
                    {leftSidebarRenderer()}
                </div>
                <div
                    className={cn(
                        'surface-elevated border-y flex flex-col h-full gap-4 p-3 flex-1  min-h-[150px] ',
                        contentClassName,
                    )}
                    style={{ ...surfaceStyle, ...delayStyle }}
                >
                    {children}
                </div>
                <div
                    className={cn(
                        'surface-elevated-sidebar rounded-r-2xl border border-l-separator min-w-[200px] p-4 pt-5 flex flex-col gap-2 ',
                        rightSidebarClassName,
                    )}
                    style={{ ...surfaceStyle, ...delayStyle }}
                >
                    {rightSidebarRenderer()}
                </div>
            </Dialog.Content>
        </Dialog.Root>
    )
}
