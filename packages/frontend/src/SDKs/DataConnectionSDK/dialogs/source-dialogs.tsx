import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Textarea } from '@quarry/standard-ui/foundations/textarea'
import { cn } from '@quarry/standard-ui/utils/cn'
import { DataConnection, Keychain, Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { KeychainSDK } from '@/SDKs/KeychainSDK/sdk'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { useSearch } from '@/hooks/useSearch'
import { JSONFieldSchemaRenderer, defaults, type Schema } from '@/components/JSONFieldSchemaRenderer'
import { resourceRoute } from '@/shell/apps'
import { ResourceIcon } from '@/components/ResourceIcon'
import { DataConnectionSDK } from '../sdk'

type Definitions = DataConnectionSDK.State['definitions']

/**
 * The create request, with the form's messages — and the credential required
 * exactly when the chosen source type logs in with one (its definition says).
 */
const schemaFor = (definitions: Definitions) => DataConnection.API.Source.Create.Request
    .extend({
        definitionId:    z.string().min(1, 'Choose a source type').pipe(DataConnection.Source.DefinitionId),
        name:            z.string().trim().min(1, 'Name the source').pipe(Library.Resource.Name),
        parentRid:       z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
        description:     z.string().trim().transform(value => value || null),
        credentialRid:   z.string().transform(value => value || null).pipe(Keychain.Credential.Rid.nullable()),
        outputFolderRid: Library.Resource.Rid.nullable(),
    })
    .superRefine((values, context) => {
        if (definitions[values.definitionId]?.credentialTemplateId && !values.credentialRid)
            context.addIssue({ code: 'custom', path: ['credentialRid'], message: 'Choose a credential' })
    })

type FormInput  = z.input<ReturnType<typeof schemaFor>>
type FormOutput = z.output<ReturnType<typeof schemaFor>>

type StepId = 'type' | 'details' | 'connection' | 'credential' | 'output'

const STEP: Record<StepId, DialogSDK.WizardTemplate.Step> = {
    type:       { id: 'type',       title: 'Source type', description: 'What kind of system you’re connecting to.' },
    details:    { id: 'details',    title: 'Details',     description: 'Its name, where it lives in the Library, and what it’s for.' },
    connection: { id: 'connection', title: 'Connection',  description: 'How to reach it.' },
    credential: { id: 'credential', title: 'Credential',  description: 'The login it connects with, from Keychain.' },
    output:     { id: 'output',     title: 'Output',      description: 'Where its syncs write their datasets, unless a sync says otherwise.' },
}

/** What each step asks for — validated before Next leaves it. */
const FIELDS: Record<StepId, (keyof FormInput)[]> = {
    type:       ['definitionId'],
    details:    ['name', 'parentRid', 'description'],
    connection: ['config'],
    credential: ['credentialRid'],
    output:     ['outputFolderRid'],
}

interface Props {
    /** Where it goes, if known (the Library folder it was started from); chosen in the wizard otherwise. */
    parentRid?: Library.Resource.Rid
    dialog:     DialogSDK.TemplateProps
}

/** Connect a new source: its type, details, connection, credential and output. Opens it when it's created. */
export function openCreateSourceDialog(args: { parentRid?: Library.Resource.Rid } = {}) {
    DialogSDK.actions.push('create-source', dialog => (
        <NewSourceDialog parentRid={args.parentRid} dialog={dialog} />
    ))
}

/** The source types and credentials load first; the wizard opens once they're there. */
function NewSourceDialog({ parentRid, dialog }: Props) {
    const [definitions, [definitionsRequest]] = DataConnectionSDK.useWith(
        state => state.definitions,
        query => [query.definitions],
    )

    const [credentials, [credentialsRequest]] = KeychainSDK.useWith(
        state => state.credentials,
        query => [query.credentials],
    )

    const error = definitionsRequest.error ?? credentialsRequest.error
    const isPending = definitionsRequest.isPending || credentialsRequest.isPending

    if (isPending || error || Object.keys(definitions).length === 0) {
        return (
            <DialogSDK.Template {...dialog} className='w-[min(520px,calc(100vw-32px))]'>
                <Dialog.Header>
                    <Dialog.Title>Connect a source</Dialog.Title>
                </Dialog.Header>
                <Dialog.Description className='sr-only'>Loading the source types you can connect.</Dialog.Description>
                <Dialog.Body>
                    {isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}
                    <ErrorNotice error={error} />
                    {!isPending && !error && <p>No source types are available.</p>}
                    {error && (
                        <Button onClick={() => { void definitionsRequest.refetch(); void credentialsRequest.refetch() }}>
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

    return <SourceWizard definitions={definitions} credentials={credentials} parentRid={parentRid} dialog={dialog} />
}

interface SourceWizardProps extends Props {
    definitions: Definitions
    credentials: Keychain.Credential.Schema[]
}

function SourceWizard({ definitions, credentials, parentRid, dialog }: SourceWizardProps) {
    const navigate = useNavigate()

    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(schemaFor(definitions)),
        defaultValues: {
            definitionId:    '',
            name:            '',
            parentRid,
            description:     '',
            config:          {},
            credentialRid:   '',
            outputFolderRid: null,
        },
    })

    const definition = definitions[form.watch('definitionId')]
    const submitting = form.formState.isSubmitting

    // Only the steps the chosen type has: connection fields if its Config has any (Postgres's are all in
    // its credential), a credential if it logs in with one.
    const hasConnectionFields = definition !== undefined && hasFields(definition.configSchema as Schema)

    const steps = [
        STEP.type,
        STEP.details,
        ...(hasConnectionFields ? [STEP.connection] : []),
        ...(definition?.credentialTemplateId ? [STEP.credential] : []),
        STEP.output,
    ]

    // Another source type: its own connection fields from their defaults, and a credential of its kind.
    function selectDefinition(id: string) {
        const next = definitions[id]

        if (!next)
            return

        form.setValue('definitionId', next.id, { shouldValidate: true })
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
        <Form.Root {...form}>
            <DialogSDK.WizardTemplate
                {...dialog}
                title='Connect a source'
                steps={steps}
                onNext={step => form.trigger(FIELDS[step.id as StepId])}
                onSubmit={form.handleSubmit(submit)}
                submitLabel='Connect source'
                submitting={submitting}
                footer={<ErrorNotice error={form.formState.errors.root?.message ?? null} />}
                renderStep={step => {
                    switch (step.id as StepId) {
                        case 'type':
                            return <SourceTypeStep definitions={definitions} onSelect={selectDefinition} />

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

                                    <Form.Field control={form.control} name='description' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Description</Form.Label>
                                            <Form.Control>
                                                <Textarea {...field} value={field.value ?? ''} placeholder='Optional' />
                                            </Form.Control>
                                            <Form.Message />
                                        </Form.Item>
                                    )} />
                                </>
                            )

                        case 'connection':
                            return definition && (
                                <Form.Field control={form.control} name='config' render={({ field }) => (
                                    <JSONFieldSchemaRenderer
                                        key={definition.id}
                                        schema={definition.configSchema}
                                        value={field.value}
                                        onChange={field.onChange}
                                    />
                                )} />
                            )

                        case 'credential':
                            return definition && (
                                <CredentialStep
                                    definition={definition}
                                    credentials={credentials}
                                    onKeychain={() => DialogSDK.actions.pop(dialog.entry.dialogId)}
                                />
                            )

                        case 'output':
                            return (
                                <Form.Field control={form.control} name='outputFolderRid' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>Output folder</Form.Label>
                                        <Form.Description>Optional. Without one, its syncs write next to the source.</Form.Description>
                                        <Form.Control>
                                            <ResourceInput
                                                value={(field.value as Library.Resource.Rid | null | undefined) ?? null}
                                                onChange={folder => field.onChange(folder.rid)}
                                                accept={['project', 'folder']}
                                                placeholder='Same folder as the source'
                                            />
                                        </Form.Control>
                                        <Form.Message />
                                    </Form.Item>
                                )} />
                            )
                    }
                }}
            />
        </Form.Root>
    )
}

interface SourceTypeStepProps {
    definitions: Definitions
    onSelect:    (id: string) => void
}

/** The source types (definitions), searchable; choosing one is the form's `definitionId`. */
function SourceTypeStep({ definitions, onSelect }: SourceTypeStepProps) {
    const search = useSearch(Object.values(definitions), item => `${item.displayName} ${item.description}`)

    return (
        <Form.Field name='definitionId' render={({ field }) => (
            <Form.Item>
                <Input {...search.input} autoFocus placeholder='Search source types…' aria-label='Search source types' />

                <div role='radiogroup' aria-label='Source type' className='mt-2 flex flex-col gap-1'>
                    {search.results.map(item => (
                        <button
                            key={item.id}
                            type='button'
                            role='radio'
                            aria-checked={field.value === item.id}
                            onClick={() => onSelect(item.id)}
                            className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left',
                                field.value === item.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent/50',
                            )}
                        >
                            <ResourceIcon type='source' size={20} />
                            <span className='flex min-w-0 flex-col'>
                                <span className='text-sm font-medium text-foreground'>{item.displayName}</span>
                                <span className='truncate text-xs text-muted-foreground'>{item.description}</span>
                            </span>
                        </button>
                    ))}

                    {search.results.length === 0 && (
                        <p className='px-1 py-2 text-sm text-muted-foreground'>No source type matches “{search.query}”.</p>
                    )}
                </div>

                <Form.Message />
            </Form.Item>
        )} />
    )
}

interface CredentialStepProps {
    definition:  DataConnection.Source.Definition.Schema
    credentials: Keychain.Credential.Schema[]
    onKeychain:  () => void
}

/** A credential of the source type's template, from Keychain. */
function CredentialStep({ definition, credentials, onKeychain }: CredentialStepProps) {
    const matching = credentials.filter(item => item.templateId === definition.credentialTemplateId)

    return (
        <Form.Field name='credentialRid' render={({ field }) => (
            <Form.Item>
                <Form.Label>Credential</Form.Label>
                <Select.Root value={field.value ?? ''} onValueChange={field.onChange}>
                    <Form.Control>
                        <Select.Trigger size='default'>
                            <Select.Value placeholder='Choose a credential…' />
                        </Select.Trigger>
                    </Form.Control>
                    <Select.Content>
                        {matching.map(credential => (
                            <Select.Item key={credential.rid} value={credential.rid}>
                                {credential.name}
                            </Select.Item>
                        ))}
                    </Select.Content>
                </Select.Root>
                <Form.Message />

                {matching.length === 0 && (
                    <p className='mt-2 text-xs'>
                        No {definition.displayName} credential yet. Create one in{' '}
                        <Link to='/keychain' onClick={onKeychain}>Keychain</Link>{' '}
                        first.
                    </p>
                )}
            </Form.Item>
        )} />
    )
}

/** Whether a JSON Schema form has anything to fill in: properties of its own, or variants to choose between. */
function hasFields(schema: Schema): boolean {
    return Object.keys(schema.properties ?? {}).length > 0 || (schema.oneOf?.length ?? 0) > 0 || (schema.anyOf?.length ?? 0) > 0
}
