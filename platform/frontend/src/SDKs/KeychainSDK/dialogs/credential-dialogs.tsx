import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Keychain, Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { JSONFieldSchemaRenderer, defaults } from '@/components/JSONFieldSchemaRenderer'
import { KeychainSDK } from '../sdk'

// The create request, with what the form says when a field is missing.
const Schema = Keychain.API.Credential.Create.Request.extend({
    name:      z.string().trim().min(1, 'Name the credential').pipe(Library.Resource.Name),
    parentRid: z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

const STEPS = [
    { id: 'system',     title: 'System',     description: 'What this credential logs in to.' },
    { id: 'details',    title: 'Details',    description: 'Its name, and where it lives in the Library.' },
    { id: 'connection', title: 'Connection', description: 'How to reach the system, and as whom.' },
] as const

type StepId = (typeof STEPS)[number]['id']

/** What each step asks for — validated before Next leaves it. */
const FIELDS: Record<StepId, (keyof FormInput)[]> = {
    system:     ['templateId'],
    details:    ['name', 'parentRid'],
    connection: ['values'],
}

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
    const template = templates[templateId]
    const submitting = form.formState.isSubmitting

    // Another system: its own fields, from their defaults.
    function selectTemplate(id: string) {
        const next = templates[id]

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
        <Form.Root {...form}>
            <DialogSDK.WizardTemplate
                {...dialog}
                title='New credential'
                steps={STEPS}
                onNext={step => form.trigger(FIELDS[step.id as StepId])}
                onSubmit={form.handleSubmit(submit)}
                submitLabel='Create'
                submitting={submitting}
                footer={<ErrorNotice error={form.formState.errors.root?.message ?? null} />}
                renderStep={step => {
                    switch (step.id as StepId) {
                        case 'system':
                            return (
                                <Form.Field control={form.control} name='templateId' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>System</Form.Label>
                                        <Select.Root value={field.value} onValueChange={selectTemplate}>
                                            <Form.Control>
                                                <Select.Trigger size='default'>
                                                    <Select.Value />
                                                </Select.Trigger>
                                            </Form.Control>
                                            <Select.Content>
                                                {Object.values(templates).map(item => (
                                                    <Select.Item key={item.id} value={item.id}>{item.displayName}</Select.Item>
                                                ))}
                                            </Select.Content>
                                        </Select.Root>
                                        <Form.Message />
                                    </Form.Item>
                                )} />
                            )

                        case 'details':
                            return (
                                <>
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
                                </>
                            )

                        case 'connection':
                            return (
                                <Form.Field control={form.control} name='values' render={({ field }) => (
                                    <JSONFieldSchemaRenderer
                                        key={template.id}
                                        schema={template.fieldsSchema}
                                        value={field.value}
                                        onChange={field.onChange}
                                    />
                                )} />
                            )
                    }
                }}
            />
        </Form.Root>
    )
}
