import { useForm } from 'react-hook-form'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import type { Keychain } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ErrorNotice } from '@/components/ErrorNotice'
import { JSONFieldSchemaRenderer, type Values } from '@/components/JSONFieldSchemaRenderer'
import { useTask } from '@/hooks/useTask'
import { KeychainSDK } from '../sdk'

interface Props {
    credential: Keychain.Credential.Schema
    template:   Keychain.Credential.Template.Schema
    dialog:     DialogSDK.TemplateProps
}

/** The form: the credential's values — none until they're revealed. Validated by the server, against the template. */
interface FormValues {
    values?: Values
}

/** Edit a credential's values (revealed on request), with its template's form. */
export function openEditCredentialValuesDialog(args: Omit<Props, 'dialog'>) {
    DialogSDK.actions.push(`edit-credential-${args.credential.rid}`, dialog => (
        <CredentialEditor {...args} dialog={dialog} />
    ))
}

function CredentialEditor({ credential, template, dialog }: Props) {
    const form = useForm<FormValues>()

    const values = form.watch('values')
    const submitting = form.formState.isSubmitting

    // Loading the values is a button, not the form: it fills the form once they arrive.
    const [revealTask, withRevealTask] = useTask()

    const reveal = withRevealTask(async () => {
        const result = await KeychainSDK.actions.credential.reveal(credential.rid)

        form.reset({ values: result.values })
    })

    async function submit({ values: edited }: FormValues) {
        if (!edited)
            return

        try {
            await KeychainSDK.actions.credential.update(credential.rid, edited)

            NotificationSDK.toast.success(`Updated ${credential.name}`)
            DialogSDK.actions.pop(dialog.entry.dialogId)
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!submitting}
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>{`Edit ${credential.name}`}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose save values.
            </Dialog.Description>

            <Form.Root {...form}>
                <form onSubmit={form.handleSubmit(submit)} autoComplete='off' className='flex min-h-0 flex-col'>
                    <Dialog.Body>
                        <fieldset disabled={submitting} className='flex flex-col gap-4'>
                            {values ? (
                                <Form.Field control={form.control} name='values' render={({ field }) => (
                                    <JSONFieldSchemaRenderer schema={template.fieldsSchema} value={field.value ?? {}} onChange={field.onChange} />
                                )} />
                            ) : (
                                <>
                                    <p>Load this credential’s values to edit them. This requires write access and is logged.</p>
                                    <Button icon='unlock' loading={revealTask.pending} onClick={reveal}>
                                        Load values
                                    </Button>
                                </>
                            )}

                            <ErrorNotice error={revealTask.error} />
                        </fieldset>

                        <ErrorNotice error={form.formState.errors.root?.message ?? null} />
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Dialog.Cancel disabled={submitting}>Cancel</Dialog.Cancel>
                        <Dialog.Action type='submit' intent='primary' loading={submitting} disabled={!values}>
                            Save values
                        </Dialog.Action>
                    </Dialog.Footer>
                </form>
            </Form.Root>
        </DialogSDK.Template>
    )
}
