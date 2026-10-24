import { DialogSDK } from '../sdk'
import { cn } from '../../../utils/cn'
import { AlertDialog } from '../../../foundations/alertDialog'
import { Icon } from '../../../icons'
import { useAnimationDelay } from './motion'

export const AlertTemplate: DialogSDK.AlertTemplate = ({
    children,
    entry,
    dialogsSize,
    index,
    blockTransparency,
    className,
    onCancel,
    onApprove,
    cancelLabel = 'Cancel',
    approveLabel = 'Approve',
    approveDisabled = false,
    type = 'warning',
    dismissible = true,
}) => {
    const delayStyle = useAnimationDelay(entry.isOpen)
    const scaleOffset = (index - (dialogsSize - 1)) * 8
    const verticalOffset = (index - (dialogsSize - 1)) * 40
    const finalScale = 1 + scaleOffset / 100

    const isWarning = type === 'warning'
    const isDanger = type === 'danger'

    const blockDismiss = dismissible ? undefined : (e: Event) => e.preventDefault()

    return (
        <AlertDialog.Root
            open={entry.isOpen}
            onOpenChange={(open) => {
                if (!open && dismissible) {
                    DialogSDK.actions.pop(entry.dialogId)
                }
            }}
        >
            <AlertDialog.Content
                style={{
                    ...delayStyle,
                    transform: `translate(-50%, -50%) translateY(${verticalOffset}px) scale(${finalScale})`,
                    filter: `brightness(${1 / -(index - dialogsSize)})`,
                }}
                darkenBackground={index === 0}
                blockTransparency={blockTransparency}
                className={cn('flex flex-row max-w-[600px]', className)}
                onEscapeKeyDown={blockDismiss}
            >
                {type === 'danger' && (
                    <div className='relative pl-9 pr-5 pt-9 mb-auto'>
                        <div className='relative'>
                            <Icon name='warning-sign' size={60} className={'text-destructive!'} />
                            <Icon name='warning-sign'
                                size={60}
                                className={`animate-ping absolute top-0 left-0 !text-destructive`}
                            />
                        </div>
                    </div>
                )}
                {type === 'warning' && (
                    <div className='relative pl-9 pr-5 pt-9 mb-auto'>
                        <div className='relative'>
                            <Icon name='warning-sign' size={60} className={'!text-yellow-400'} />
                            <Icon name='warning-sign'
                                size={60}
                                className={`animate-ping absolute top-0 left-0 !text-yellow-400`}
                            />
                        </div>
                    </div>
                )}
                <div className='flex flex-col h-full gap-4 p-3 w-full  min-h-[150px]'>
                    <div className={cn('h-full mb-auto', (isWarning || isDanger) && 'pt-3')}>{children}</div>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel onClick={(event) => onCancel?.(event, entry, dialogsSize, index)}>
                            {cancelLabel}
                        </AlertDialog.Cancel>
                        <AlertDialog.Action
                            onClick={(event) => onApprove?.(event, entry, dialogsSize, index)}
                            intent={type === 'default' ? 'none' : type}
                            disabled={approveDisabled}
                        >
                            {approveLabel}
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </div>
            </AlertDialog.Content>
        </AlertDialog.Root>
    )
}
