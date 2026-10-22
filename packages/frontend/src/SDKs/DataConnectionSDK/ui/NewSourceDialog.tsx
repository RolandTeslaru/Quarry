import { useState } from 'react'
import { Button, Dialog, DialogBody, FormGroup, HTMLSelect, InputGroup, Spinner } from '@blueprintjs/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { DataConnection, Keychain, type Library } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { KeychainSDK } from '@/SDKs/KeychainSDK/sdk'
import { CreateDialog } from '@/components/CreateDialog'
import { ErrorNotice } from '@/components/ErrorNotice'
import { SchemaFields, defaults, type Values } from '@/components/SchemaFields'

interface Props {
    parentRid: Library.Resource.Rid
    onClose:   () => void
}

export function NewSourceDialog({ parentRid, onClose }: Props) {
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

    if (isPending || error || !definition) {
        return (
            <Dialog isOpen title='Connect a source' onClose={onClose}>
                <DialogBody>
                    {isPending && <Spinner size={24} />}
                    <ErrorNotice error={error} />

                    {!isPending && !definition && <p>No source types are available.</p>}

                    {error && (
                        <Button onClick={() => {
                            void definitionsRequest.refetch()
                            void credentialsRequest.refetch()
                        }}>
                            Try again
                        </Button>
                    )}
                </DialogBody>
            </Dialog>
        )
    }

    return (
        <SourceForm
            key={definition.id}
            definition={definition}
            definitions={definitions}
            credentials={credentials}
            parentRid={parentRid}
            onClose={onClose}
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
    onClose,
    onDefinitionChange,
}: SourceFormProps) {
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

        await navigate({ to: '/resources/$rid', params: { rid: source.rid } })
    }

    return (
        <CreateDialog
            title='Connect a source'
            submitLabel='Connect source'
            onClose={onClose}
            onSubmit={create}
            disabled={Boolean(definition.credentialTemplateId) && !credentialRid}
        >
            <FormGroup label='System' labelFor='source-system'>
                <HTMLSelect
                    id='source-system'
                    fill
                    value={definition.id}
                    options={definitions.map(item => ({ value: item.id, label: item.displayName }))}
                    onChange={event => onDefinitionChange(event.target.value)}
                />
            </FormGroup>

            <FormGroup label='Name' labelFor='source-name'>
                <InputGroup
                    id='source-name'
                    autoFocus
                    required
                    placeholder='Production database'
                    value={name}
                    onChange={event => setName(event.target.value)}
                />
            </FormGroup>

            {definition.credentialTemplateId && (
                <FormGroup label='Credential' labelFor='source-credential'>
                    <HTMLSelect
                        id='source-credential'
                        fill
                        required
                        value={credentialRid}
                        onChange={event => setCredentialRid(event.target.value)}
                    >
                        <option value=''>Choose a credential…</option>
                        {matchingCredentials.map(credential => (
                            <option key={credential.rid} value={credential.rid}>
                                {credential.name}
                            </option>
                        ))}
                    </HTMLSelect>

                    {matchingCredentials.length === 0 && (
                        <p className='text-xs mt-2'>
                            Create a {definition.displayName} credential in <Link to='/keychain'>Keychain</Link> first.
                        </p>
                    )}
                </FormGroup>
            )}

            <SchemaFields schema={definition.configSchema} value={config} onChange={setConfig} />
        </CreateDialog>
    )
}
