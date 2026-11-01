import { Button } from '@quarry/standard-ui/foundations/button'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import type { Keychain } from '@quarry/shared/domain'
import type { KeychainSDK } from '@/SDKs/KeychainSDK/sdk'
import { dateTime } from '@/utils/format'

interface CredentialTableProps {
    credentials: Keychain.Credential.Schema[]
    templates:   KeychainSDK.State['templates']
    onEdit:      (credential: Keychain.Credential.Schema) => void
}

export function CredentialTable({ credentials, templates, onEdit }: CredentialTableProps) {
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
                            <Badge variant='secondary'>{templates[credential.templateId]?.displayName ?? credential.templateId}</Badge>
                        </Table.Cell>
                        <Table.Cell>{dateTime(credential.updatedAt)}</Table.Cell>
                        <Table.Cell className='text-right'>
                            <Button
                                size='sm'
                                icon='edit'
                                disabled={!templates[credential.templateId]}
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
