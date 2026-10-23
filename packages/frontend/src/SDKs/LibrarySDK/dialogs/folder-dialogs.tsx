import { useId, useState, type FormEvent } from 'react'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Input } from '@quarry/standard-ui/foundations/input'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { useTask } from '@/hooks/useTask'

/** A new folder in this project or folder. */
export function openCreateFolderDialog(args: { parentRid: Library.Resource.Rid }) {
    DialogSDK.actions.push(`create-folder-${args.parentRid}`, dialog => (
        <NewFolderDialog parentRid={args.parentRid} dialog={dialog} />
    ))
}

interface DialogProps {
    dialog: DialogSDK.TemplateProps
}

interface NewFolderDialogProps extends DialogProps {
    parentRid: Library.Resource.Rid
}

function NewFolderDialog({ parentRid, dialog }: NewFolderDialogProps) {
    const formId = useId()
    const [task, withTask] = useTask()

    const [name, setName] = useState('')

    const submit = withTask(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        await LibrarySDK.actions.folder.create({ parentRid, name, description: null })

        DialogSDK.actions.pop(dialog.entry.dialogId)
    })

    return (
        <DialogSDK.Template {...dialog} dismissible={!task.pending} className='w-[min(520px,calc(100vw-32px))]'>
            <Dialog.Header>
                <Dialog.Title>New folder</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>Complete the fields below, then choose create.</Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='folder-name'>Name</Field.Label>
                            <Input
                                id='folder-name'
                                autoFocus
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>
                    </Field.Set>
                    <ErrorNotice error={task.error} />
                </form>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.Cancel disabled={task.pending}>Cancel</Dialog.Cancel>
                <Dialog.Action type='submit' form={formId} intent='primary' loading={task.pending}>
                    Create
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}
