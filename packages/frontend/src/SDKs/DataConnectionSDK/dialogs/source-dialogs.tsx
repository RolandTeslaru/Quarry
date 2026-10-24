import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Link, useNavigate } from '@tanstack/react-router'
import { DataConnection, Keychain, Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { DataConnectionSDK } from '../sdk'
import { KeychainSDK } from '@/SDKs/KeychainSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { resourceRoute } from '@/shell/apps'
import { SchemaFields, defaults } from '@/components/SchemaFields'

type Definitions = DataConnectionSDK.State['definitions']

/**
 * The create request, with the form's messages — and the credential required
 * exactly when the chosen system logs in with one (its definition says).
 */
const schemaFor = (definitions: Definitions) => DataConnection.API.Source.Create.Request
    .extend({
        name:          z.string().trim().min(1, 'Name the source').pipe(Library.Resource.Name),
        credentialRid: z.string().transform(value => value || null).pipe(Keychain.Credential.Rid.nullable()),
    })
    .superRefine((values, context) => {
        if (definitions[values.definitionId]?.credentialTemplateId && !values.credentialRid)
            context.addIssue({ code: 'custom', path: ['credentialRid'], message: 'Choose a credential' })
    })

type FormInput  = z.input<ReturnType<typeof schemaFor>>
type FormOutput = z.output<ReturnType<typeof schemaFor>>

interface Props {
    parentRid: Library.Resource.Rid
    dialog:    DialogSDK.TemplateProps
}

/** A new source in this folder; opens it in Data Connection when it's created. */
export function openCreateSourceDialog(args: { parentRid: Library.Resource.Rid }) {
    DialogSDK.actions.push(`create-source-${args.parentRid}`, dialog => (
        <NewSourceDialog parentRid={args.parentRid} dialog={dialog} />
    ))
}

function NewSourceDialog({ parentRid, dialog }: Props) {
    const [definitions, [definitionsRequest]] = DataConnectionSDK.useWith(
        state => state.definitions,
        query => [query.definitions],
    )

    const [credentials, [credentialsRequest]] = KeychainSDK.useWith(
        state => state.credentials,
        query => [query.credentials],
    )

    const first = Object.values(definitions)[0]
    const error = definitionsRequest.error ?? credentialsRequest.error
    const isPending = definitionsRequest.isPending || credentialsRequest.isPending

    function retry() {
        void definitionsRequest.refetch()
        void credentialsRequest.refetch()
    }

    if (isPending || error || !first) {
        return (
            <DialogSDK.Template {...dialog} className='w-[min(520px,calc(100vw-32px))]'>
                <Dialog.Header>
                    <Dialog.Title>Connect a source</Dialog.Title>
                </Dialog.Header>
                <Dialog.Description className='sr-only'>
                    Choose a system and configure its connection.
                </Dialog.Description>
                <Dialog.Body>
                    {isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}
                    <ErrorNotice error={error} />

                    {!isPending && !first && <p>No source types are available.</p>}

                    {error && (
                        <Button onClick={retry}>
                            Try again
                        </Button>
                    )}
                </Dialog.Body>
                <Dialog.Footer>
                    <Dialog.Cancel>Cancel</Dialog.Cancel>
                </Dialog.Footer>
            </DialogSDK.Template>
        )
    }

    return (
        <SourceForm
            first={first}
            definitions={definitions}
            credentials={credentials}
            parentRid={parentRid}
            dialog={dialog}
        />
    )
}

interface SourceFormProps extends Props {
    first:       DataConnection.Source.Definition.Schema
    definitions: Definitions
    credentials: Keychain.Credential.Schema[]
}

function SourceForm({ first, definitions, credentials, parentRid, dialog }: SourceFormProps) {
    const navigate = useNavigate()

    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(schemaFor(definitions)),
        defaultValues: {
            parentRid,
            definitionId:  first.id,
            name:          '',
            credentialRid: '',
            config:        defaults(first.configSchema),
        },
    })

    const definitionId = form.watch('definitionId')
    const definition = definitions[definitionId] ?? first
    const matchingCredentials = credentials.filter(item => item.templateId === definition.credentialTemplateId)
    const submitting = form.formState.isSubmitting

    // Another system: its own config from its defaults, and a credential of its kind.
    function selectDefinition(id: string) {
        const next = definitions[id]

        if (!next)
            return

        form.setValue('definitionId', next.id)
        form.setValue('config', defaults(next.configSchema))
        form.setValue('credentialRid', '')
    }

    async function submit(values: FormOutput) {
        try {
            const source = await DataConnectionSDK.actions.source.create(values)

            NotificationSDK.toast.success(`Created source ${source.name}`)
            DialogSDK.actions.pop(dialog.entry.dialogId)

            await navigate(resourceRoute('source', source.rid))
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
                <Dialog.Title>Connect a source</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose connect source.
            </Dialog.Description>

            <Form.Root {...form}>
                <form onSubmit={form.handleSubmit(submit)} autoComplete='off' className='flex min-h-0 flex-col'>
                    <Dialog.Body>
                        <fieldset disabled={submitting} className='flex flex-col gap-4'>
                            <Form.Field control={form.control} name='definitionId' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>System</Form.Label>
                                    <Select.Root value={field.value} onValueChange={selectDefinition}>
                                        <Form.Control>
                                            <Select.Trigger size='default'>
                                                <Select.Value />
                                            </Select.Trigger>
                                        </Form.Control>
                                        <Select.Content className='z-[100]'>
                                            {Object.values(definitions).map(item => (
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

                            {definition.credentialTemplateId && (
                                <Form.Field control={form.control} name='credentialRid' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>Credential</Form.Label>
                                        <Select.Root value={field.value ?? ''} onValueChange={field.onChange}>
                                            <Form.Control>
                                                <Select.Trigger size='default'>
                                                    <Select.Value placeholder='Choose a credential…' />
                                                </Select.Trigger>
                                            </Form.Control>
                                            <Select.Content className='z-[100]'>
                                                {matchingCredentials.map(credential => (
                                                    <Select.Item key={credential.rid} value={credential.rid}>
                                                        {credential.name}
                                                    </Select.Item>
                                                ))}
                                            </Select.Content>
                                        </Select.Root>
                                        <Form.Message />

                                        {matchingCredentials.length === 0 && (
                                            <p className='mt-2 text-xs'>
                                                Create a {definition.displayName} credential in{' '}
                                                <Link to='/keychain' onClick={() => DialogSDK.actions.pop(dialog.entry.dialogId)}>
                                                    Keychain
                                                </Link>{' '}
                                                first.
                                            </p>
                                        )}
                                    </Form.Item>
                                )} />
                            )}

                            <Form.Field control={form.control} name='config' render={({ field }) => (
                                <SchemaFields
                                    key={definition.id}
                                    schema={definition.configSchema}
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
                            Connect source
                        </Dialog.Action>
                    </Dialog.Footer>
                </form>
            </Form.Root>
        </DialogSDK.Template>
    )
}
