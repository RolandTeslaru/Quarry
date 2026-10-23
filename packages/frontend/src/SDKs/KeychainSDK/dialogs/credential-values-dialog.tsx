import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import type { Keychain } from '@quarry/shared/domain'
import { KeychainSDK } from '../sdk'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { ErrorNotice } from '@/components/ErrorNotice'
import { SchemaFields, type Values } from '@/components/SchemaFields'
import { useTask } from '@/hooks/useTask'

interface Props {
    credential: Keychain.Credential.Schema
    template:   Keychain.Credential.Template.Schema
    dialog:     DialogSDK.TemplateProps
}

/** Edit a credential's values (revealed on request), with its template's form. */
export function openEditCredentialValuesDialog(args: Omit<Props, 'dialog'>) {
    DialogSDK.actions.push(`edit-credential-${args.credential.rid}`, dialog => (
        <CredentialEditor {...args} dialog={dialog} />
    ))
}

function CredentialEditor({ credential, template, dialog }: Props) {
    const formId = useId()
    const [saveTask, withSaveTask] = useTask()

    const [values, setValues] = useState<Values | null>(null)

    const [task, withTask] = useTask()

    const reveal = withTask(async () => {
        const result = await KeychainSDK.actions.credential.reveal(credential.rid)

        setValues(result.values)
    })

    const save = async () => {
        if (!values)
            return

        await KeychainSDK.actions.credential.update(credential.rid, values)
    }

    const submit = withSaveTask(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (!values)
            return

        await save()

        NotificationSDK.toast.success(`Updated ${credential.name}`)

        DialogSDK.actions.pop(dialog.entry.dialogId)
    })

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!saveTask.pending}
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>{`Edit ${credential.name}`}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose save values.
            </Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={saveTask.pending}>
                        {values ? (
                            <SchemaFields schema={template.fieldsSchema} value={values} onChange={setValues} />
                        ) : (
                            <>
                                <p>Load this credential’s values to edit them. This requires write access and is logged.</p>
                                <Button icon='unlock' loading={task.pending} onClick={reveal}>
                                    Load values
                                </Button>
                            </>
                        )}

                        <ErrorNotice error={task.error} />
                    </Field.Set>
                    <ErrorNotice error={saveTask.error} />
                </form>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.Cancel disabled={saveTask.pending}>Cancel</Dialog.Cancel>
                <Dialog.Action
                    type='submit'
                    form={formId}
                    intent='primary'
                    loading={saveTask.pending}
                    disabled={!values}
                >
                    Save values
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}
