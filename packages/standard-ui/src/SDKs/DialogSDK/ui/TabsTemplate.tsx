import React, { useState } from 'react'
import { DialogSDK } from '../sdk'
import { Dialog } from '../../../foundations/dialog'
import { Tabs } from '../../../foundations/tabs'
import { ScrollArea } from '../../../foundations/scrollArea'
import { cn } from '../../../utils/cn'
import { DialogIcon } from './DialogIcon'
import { useAnimationDelay, SPLIT_SHELL } from './motion'

export const TabsTemplate: DialogSDK.TabsTemplate = ({
    children,
    items,
    defaultValue,
    empty,
    sidebarClassName,
    contentClassName,
    header,
    sidebarBottomRenderer,
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

    const [value, setValue] = useState(defaultValue ?? '')

    const active = items.find((item) => item.id === value)

    return (
        <Dialog.Root
            open={entry.isOpen}
            onOpenChange={(open) => {
                if (!open && dismissible) {
                    DialogSDK.actions.pop(entry.dialogId)
                }
            }}
        >
            <Tabs.Root orientation='vertical' activationMode='manual' value={value} onValueChange={setValue}>
                <Dialog.Content
                    unstyled
                    style={{
                        ...delayStyle,
                        transform: `translate(-50%, -50%) translateY(${verticalOffset}px) scale(${finalScale})`,
                    }}
                    darkenBackground={index === 0}
                    className={cn(SPLIT_SHELL, className)}
                    onInteractOutside={blockDismiss}
                    onEscapeKeyDown={blockDismiss}
                >
                    {children}
                    <div
                        className={cn(
                            'surface-elevated-sidebar rounded-l-2xl border border-r-separator min-w-[200px] p-2 pt-3 flex flex-col gap-2 ',
                            sidebarClassName,
                        )}
                        style={{ ...surfaceStyle, ...delayStyle }}
                    >
                        {header && (
                            <div className='inline-flex items-center px-1'>
                                <DialogIcon icon={header.icon} className='size-4 m-2' />
                                <p className='font-semibold w-35 text-sm text-ellipsis text-nowrap overflow-hidden'>
                                    {header.title}
                                </p>
                            </div>
                        )}

                        <Tabs.List variant='sidebar' className='py-2 pt-4 px-1 gap-1'>
                            {items.map((item) => (
                                <Tabs.Trigger
                                    key={item.id}
                                    value={item.id}
                                    className={cn(
                                        item.tone === 'destructive' &&
                                            'text-destructive data-[state=active]:bg-destructive/10',
                                    )}
                                >
                                    <DialogIcon icon={item.icon} className='size-4' />
                                    {item.label}
                                </Tabs.Trigger>
                            ))}
                        </Tabs.List>

                        {sidebarBottomRenderer && <div className='mt-auto w-full'>{sidebarBottomRenderer()}</div>}
                    </div>
                    <ScrollArea.Root
                        style={{ ...surfaceStyle, ...delayStyle }}
                        className={cn(
                            'surface-elevated rounded-r-2xl border-y border-r flex flex-col h-[600px] gap-4 px-3 w-full ',
                            contentClassName,
                        )}
                    >
                        <div className='inline-flex z-100 items-center absolute w-full top-0 left-4 gap-2 h-9 mt-2 shrink-0'>
                            <p className='text-md font-semibold'>{active?.label}</p>
                        </div>
                        {items.map((item) => (
                            <Tabs.Content key={item.id} value={item.id}>
                                {/* Clears the header floating above the scroll area. */}
                                <div className='h-12' />
                                {item.panel}
                            </Tabs.Content>
                        ))}

                        {!active && empty && (
                            <div className='absolute top-1/2 -translate-1/2 left-1/2 w-[300px] flex flex-col gap-2 p-6 h-full justify-center items-center text-center'>
                                {empty.icon}
                                <p className='text-sm font-medium'>{empty.title}</p>
                                <p className='text-xs text-muted-foreground max-w-55'>{empty.description}</p>
                            </div>
                        )}
                    </ScrollArea.Root>
                </Dialog.Content>
            </Tabs.Root>
        </Dialog.Root>
    )
}
