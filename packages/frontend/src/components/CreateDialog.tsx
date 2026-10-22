import type { FormEvent, ReactNode } from 'react'
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'
import { useTask } from '@/hooks/useTask'
import { ErrorNotice } from './ErrorNotice'

interface Props {
    title:        string
    onClose:      () => void
    onSubmit:     () => Promise<unknown>
    children:     ReactNode
    submitLabel?: string
    disabled?:    boolean
}

export function CreateDialog({
    title,
    onClose,
    onSubmit,
    children,
    submitLabel = 'Create',
    disabled = false,
}: Props) {
    const task = useTask()

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (task.pending)
            return

        void task.run(async () => {
            await onSubmit()

            onClose()
        })
    }

    return (
        <Dialog
            isOpen
            title={title}
            onClose={task.pending ? undefined : onClose}
            canEscapeKeyClose={!task.pending}
            canOutsideClickClose={!task.pending}
            className='quarry-dialog'
        >
            <form onSubmit={submit}>
                <DialogBody>
                    <fieldset disabled={task.pending}>
                        {children}
                    </fieldset>

                    <ErrorNotice error={task.error} />
                </DialogBody>

                <DialogFooter
                    actions={(
                        <>
                            <Button onClick={onClose} disabled={task.pending}>
                                Cancel
                            </Button>

                            <Button
                                type='submit'
                                intent='primary'
                                loading={task.pending}
                                disabled={disabled}
                            >
                                {submitLabel}
                            </Button>
                        </>
                    )}
                />
            </form>
        </Dialog>
    )
}
