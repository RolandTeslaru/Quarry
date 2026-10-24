import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Keychain, Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { SchemaFields, defaults } from '@/components/SchemaFields'
import { KeychainSDK } from '../sdk'

// The create request, with what the form says when a field is missing.
const Schema = Keychain.API.Credential.Create.Request.extend({
    name:      z.string().trim().min(1, 'Name the credential').pipe(Library.Resource.Name),
    parentRid: z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

interface Props {
    templates: KeychainSDK.State['templates']
    dialog:    DialogSDK.TemplateProps
}

/** A new credential, of one of these templates. */
export function openCreateCredentialDialog(args: { templates: KeychainSDK.State['templates'] }) {
    DialogSDK.actions.push('create-credential', dialog => (
        <CredentialDialog templates={args.templates} dialog={dialog} />
    ))
}

function CredentialDialog({ templates, dialog }: Props) {
    const first = Object.values(templates)[0]

    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: {
            templateId: first.id,
            name:       '',
            values:     defaults(first.fieldsSchema),
        },
    })

    const templateId = form.watch('templateId')
    const template = templates[templateId] ?? first
    const submitting = form.formState.isSubmitting

    // Another system: its own fields, from their defaults.
    function selectTemplate(id: string) {
        const next = templates[id]

        if (!next)
            return

        form.setValue('templateId', next.id)
        form.setValue('values', defaults(next.fieldsSchema))
    }

    async function submit(values: FormOutput) {
        try {
            const credential = await KeychainSDK.actions.credential.create(values)

            NotificationSDK.toast.success(`Saved credential ${credential.name}`)
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
                <Dialog.Title>New credential</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose create.
            </Dialog.Description>

            <Form.Root {...form}>
                <form onSubmit={form.handleSubmit(submit)} autoComplete='off' className='flex min-h-0 flex-col'>
                    <Dialog.Body>
                        <fieldset disabled={submitting} className='flex flex-col gap-4'>
                            <Form.Field control={form.control} name='templateId' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>System</Form.Label>
                                    <Select.Root value={field.value} onValueChange={selectTemplate}>
                                        <Form.Control>
                                            <Select.Trigger size='default'>
                                                <Select.Value />
                                            </Select.Trigger>
                                        </Form.Control>
                                        <Select.Content className='z-[100]'>
                                            {Object.values(templates).map(item => (
                                                <Select.Item key={item.id} value={item.id}>{item.displayName}</Select.Item>
                                            ))}
                                        </Select.Content>
                                    </Select.Root>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <Form.Field control={form.control} name='name' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Name</Form.Label>
                                    <Form.Control>
                                        <Input {...field} autoFocus placeholder='Production database' />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <Form.Field control={form.control} name='parentRid' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Location</Form.Label>
                                    <Form.Control>
                                        <ResourceInput
                                            value={(field.value as Library.Resource.Rid | undefined) ?? null}
                                            onChange={location => field.onChange(location.rid)}
                                            accept={['project', 'folder']}
                                            placeholder='Choose a project or folder…'
                                        />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <div className='form-divider'>CONNECTION DETAILS</div>

                            <Form.Field control={form.control} name='values' render={({ field }) => (
                                <SchemaFields
                                    key={template.id}
                                    schema={template.fieldsSchema}
                                    value={field.value}
                                    onChange={field.onChange}
                                />
                            )} />
                        </fieldset>

                        <ErrorNotice error={form.formState.errors.root?.message ?? null} />
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Dialog.Cancel disabled={submitting}>Cancel</Dialog.Cancel>
                        <Dialog.Action type='submit' intent='primary' loading={submitting}>
                            Create
                        </Dialog.Action>
                    </Dialog.Footer>
                </form>
            </Form.Root>
        </DialogSDK.Template>
    )
}
