import { useTask } from '@/hooks/useTask'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { useId, useState, type FormEvent } from 'react'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Link, useNavigate } from '@tanstack/react-router'
import { DataConnection, Keychain, type Library } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { KeychainSDK } from '@/SDKs/KeychainSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { resourceRoute } from '@/shell/apps'
import { SchemaFields, defaults, type Values } from '@/components/SchemaFields'

interface Props {
    parentRid: Library.Resource.Rid
    dialog:    DialogSDK.TemplateProps
}

export function NewSourceDialog({ parentRid, dialog }: Props) {
    const [definitionId, setDefinitionId] = useState('')

    const [definitions, [definitionsRequest]] = DataConnectionSDK.useWith(
        state => state.definitions,
        query => [query.definitions],
    )

    const [credentials, [credentialsRequest]] = KeychainSDK.useWith(
        state => state.credentials,
        query => [query.credentials],
    )

    const definition = definitions.find(item => item.id === definitionId) ?? definitions[0]
    const error = definitionsRequest.error ?? credentialsRequest.error
    const isPending = definitionsRequest.isPending || credentialsRequest.isPending

    function retry() {
        void definitionsRequest.refetch()
        void credentialsRequest.refetch()
    }

    if (isPending || error || !definition) {
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

                    {!isPending && !definition && <p>No source types are available.</p>}

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
            key={definition.id}
            definition={definition}
            definitions={definitions}
            credentials={credentials}
            parentRid={parentRid}
            dialog={dialog}
            onDefinitionChange={setDefinitionId}
        />
    )
}

interface SourceFormProps extends Props {
    definition:         DataConnection.Source.Definition.Schema
    definitions:        DataConnection.Source.Definition.Schema[]
    credentials:        Keychain.Credential.Schema[]
    onDefinitionChange: (id: string) => void
}

function SourceForm({
    definition,
    definitions,
    credentials,
    parentRid,
    dialog,
    onDefinitionChange,
}: SourceFormProps) {
    const formId = useId()
    const task = useTask()

    const [name, setName] = useState('')
    const [credentialRid, setCredentialRid] = useState('')
    const [config, setConfig] = useState<Values>(() => defaults(definition.configSchema))

    const navigate = useNavigate()
    const matchingCredentials = credentials.filter(item => item.templateId === definition.credentialTemplateId)

    const create = async () => {
        const source = await DataConnectionSDK.actions.source.create({
            parentRid,
            name,
            description: null,
            definitionId: definition.id,
            credentialRid: credentialRid ? Keychain.Credential.Rid.parse(credentialRid) : null,
            config,
        })

        await navigate(resourceRoute('source', source.rid))
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (task.pending || Boolean(definition.credentialTemplateId) && !credentialRid)
            return

        void task.run(async () => {
            await create()

            DialogSDK.actions.pop(dialog.entry.dialogId)
        })
    }

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!task.pending}
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>Connect a source</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose connect source.
            </Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='source-system'>System</Field.Label>
                            <Select.Root value={definition.id} onValueChange={onDefinitionChange}>
                                <Select.Trigger id='source-system' size='default'>
                                    <Select.Value />
                                </Select.Trigger>
                                <Select.Content className='z-[100]'>
                                    {definitions.map(item => (
                                        <Select.Item key={item.id} value={item.id}>{item.displayName}</Select.Item>
                                    ))}
                                </Select.Content>
                            </Select.Root>
                        </Field.Root>

                        <Field.Root>
                            <Field.Label htmlFor='source-name'>Name</Field.Label>
                            <Input
                                id='source-name'
                                autoFocus
                                required
                                placeholder='Production database'
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>

                        {definition.credentialTemplateId && (
                            <Field.Root>
                                <Field.Label htmlFor='source-credential'>Credential</Field.Label>
                                <Select.Root value={credentialRid} onValueChange={setCredentialRid} required>
                                    <Select.Trigger id='source-credential' size='default'>
                                        <Select.Value placeholder='Choose a credential…' />
                                    </Select.Trigger>
                                    <Select.Content className='z-[100]'>
                                        {matchingCredentials.map(credential => (
                                            <Select.Item key={credential.rid} value={credential.rid}>
                                                {credential.name}
                                            </Select.Item>
                                        ))}
                                    </Select.Content>
                                </Select.Root>

                                {matchingCredentials.length === 0 && (
                                    <p className='text-xs mt-2'>
                                        Create a {definition.displayName} credential in{' '}
                                        <Link to='/keychain' onClick={() => DialogSDK.actions.pop(dialog.entry.dialogId)}>
                                            Keychain
                                        </Link>{' '}
                                        first.
                                    </p>
                                )}
                            </Field.Root>
                        )}

                        <SchemaFields schema={definition.configSchema} value={config} onChange={setConfig} />
                    </Field.Set>
                    <ErrorNotice error={task.error} />
                </form>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.Cancel disabled={task.pending}>Cancel</Dialog.Cancel>
                <Dialog.Action
                    type='submit'
                    form={formId}
                    intent='primary'
                    loading={task.pending}
                    disabled={Boolean(definition.credentialTemplateId) && !credentialRid}
                >
                    Connect source
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}
