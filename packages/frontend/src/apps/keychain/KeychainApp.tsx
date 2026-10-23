import { Button } from '@quarry/standard-ui/foundations/button'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import type { Keychain } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { KeychainSDK } from '@/SDKs/KeychainSDK/sdk'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { dateTime, number } from '@/utils/format'
import { keychainApp } from './definition'

/** The Keychain app: every credential the user can see; create one, or edit its values. */
export function KeychainApp() {
    const [credentials, [credentialsRequest]] = KeychainSDK.useWith(
        state => state.credentials,
        query => [query.credentials],
    )

    const [templates, [templatesRequest]] = KeychainSDK.useWith(
        state => state.templates,
        query => [query.templates],
    )

    function openEditor(credential: Keychain.Credential.Schema) {
        const template = templates.find(item => item.id === credential.templateId)

        if (!template)
            return

        KeychainSDK.dialogs.openEditCredentialValues({ credential, template })
    }

    return (
        <App.Root>
            <App.Header>
                <App.Header.Icon glyph={keychainApp.glyph} />
                <App.Header.Rows>
                    <App.Header.Title>Keychain</App.Header.Title>
                    <span className='text-xs text-muted-foreground'>
                        Store connection credentials once, then use them across your sources.
                    </span>
                </App.Header.Rows>

                <App.Header.Actions>
                    <Button
                        variant='minimal'
                        icon='refresh'
                        aria-label='Refresh credentials'
                        loading={credentialsRequest.isFetching}
                        onClick={() => void credentialsRequest.refetch()}
                    />
                    <Button
                        intent='primary'
                        icon='add'
                        disabled={templates.length === 0}
                        onClick={() => KeychainSDK.dialogs.openCreateCredential({ templates })}
                    >
                        New credential
                    </Button>
                </App.Header.Actions>
            </App.Header>

            <App.Content>
                <App.Content.Toolbar>
                    <span className='text-sm font-medium'>Credentials</span>
                    <span className='text-xs text-muted-foreground'>{number(credentials.length)} you can see</span>
                </App.Content.Toolbar>

                <div className='p-4'>
                    <ErrorNotice error={credentialsRequest.error ?? templatesRequest.error} />

                    {credentialsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

                    {credentialsRequest.isSuccess && credentials.length === 0 && (
                        <Empty
                            icon='key'
                            title='A secure home for your connections'
                            description='Add a credential to connect a source. Viewers can use it without revealing its values.'
                        />
                    )}

                    {credentials.length > 0 && (
                        <CredentialTable
                            credentials={credentials}
                            templates={templates}
                            onEdit={openEditor}
                        />
                    )}
                </div>
            </App.Content>
        </App.Root>
    )
}

interface CredentialTableProps {
    credentials: Keychain.Credential.Schema[]
    templates:   Keychain.Credential.Template.Schema[]
    onEdit:      (credential: Keychain.Credential.Schema) => void
}

function CredentialTable({ credentials, templates, onEdit }: CredentialTableProps) {
    const templateOf = (credential: Keychain.Credential.Schema) =>
        templates.find(template => template.id === credential.templateId)

    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>System</Table.Head>
                    <Table.Head>Updated</Table.Head>
                    <Table.Head />
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {credentials.map(credential => (
                    <Table.Row key={credential.rid}>
                        <Table.Cell className='font-medium'>{credential.name}</Table.Cell>
                        <Table.Cell>
                            <Badge variant='secondary'>{templateOf(credential)?.displayName ?? credential.templateId}</Badge>
                        </Table.Cell>
                        <Table.Cell>{dateTime(credential.updatedAt)}</Table.Cell>
                        <Table.Cell className='text-right'>
                            <Button
                                size='sm'
                                icon='edit'
                                disabled={!templateOf(credential)}
                                onClick={() => onEdit(credential)}
                            >
                                Edit values
                            </Button>
                        </Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table.Root>
    )
}
