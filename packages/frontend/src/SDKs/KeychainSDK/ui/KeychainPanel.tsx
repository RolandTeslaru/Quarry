import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import type { Keychain } from '@quarry/shared/domain'
import { KeychainSDK } from '../sdk'
import { CredentialDialog } from './CredentialDialog'
import { CredentialEditor } from './CredentialEditor'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { dateTime } from '@/utils/format'

export function KeychainPanel() {
    const [credentials, [credentialsRequest]] = KeychainSDK.useWith(
        state => state.credentials,
        query => [query.credentials],
    )

    const [templates, [templatesRequest]] = KeychainSDK.useWith(
        state => state.templates,
        query => [query.templates],
    )

    function openCreateDialog() {
        if (templates.length === 0)
            return

        DialogSDK.actions.push('new-credential', dialog => <CredentialDialog templates={templates} dialog={dialog} />)
    }

    function openEditor(credential: Keychain.Credential.Schema) {
        const template = templates.find(template => template.id === credential.templateId)

        if (!template)
            return

        DialogSDK.actions.push(`edit-credential-${credential.rid}`, dialog => (
            <CredentialEditor credential={credential} template={template} dialog={dialog} />
        ))
    }

    return (
        <>
            <PageHeader
                eyebrow='WORKSPACE SECRETS'
                title='Keychain'
                description='Store connection credentials once, then use them across your sources.'
                actions={(
                    <Button
                        intent='primary'
                        icon='add'
                        disabled={templates.length === 0}
                        onClick={openCreateDialog}
                    >
                        New credential
                    </Button>
                )}
            />

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
                <div className='table-panel'>
                    <Table.Root className='data-table'>
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
                                        <Badge variant='secondary'>{credential.templateId}</Badge>
                                    </Table.Cell>
                                    <Table.Cell>{dateTime(credential.updatedAt)}</Table.Cell>
                                    <Table.Cell className='text-right'>
                                        <Button
                                            size='sm'
                                            icon='edit'
                                            disabled={!templates.some(template => template.id === credential.templateId)}
                                            onClick={() => openEditor(credential)}
                                        >
                                            Edit values
                                        </Button>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table.Root>
                </div>
            )}
        </>
    )
}
