import { useState } from 'react'
import { Button, HTMLTable, Spinner, Tag } from '@blueprintjs/core'
import type { Keychain } from '@quarry/shared/domain'
import { KeychainSDK } from '../sdk'
import { CredentialDialog } from './CredentialDialog'
import { CredentialEditor } from './CredentialEditor'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { dateTime } from '@/utils/format'

export function KeychainPanel() {
    const [isCreating, setIsCreating] = useState(false)
    const [editing, setEditing] = useState<Keychain.Credential.Schema | null>(null)

    const [credentials, [credentialsRequest]] = KeychainSDK.useWith(
        state => state.credentials,
        query => [query.credentials],
    )

    const [templates, [templatesRequest]] = KeychainSDK.useWith(
        state => state.templates,
        query => [query.templates],
    )

    const selectedTemplate = templates.find(template => template.id === editing?.templateId)

    return (
        <>
            <PageHeader
                eyebrow='WORKSPACE SECRETS'
                title='Keychain'
                description='Store connection credentials once, then use them across your sources.'
                actions={(
                    <Button
                        intent='primary'
                        icon='plus'
                        disabled={templates.length === 0}
                        onClick={() => setIsCreating(true)}
                    >
                        New credential
                    </Button>
                )}
            />

            <ErrorNotice error={credentialsRequest.error ?? templatesRequest.error} />

            {credentialsRequest.isPending && <Spinner size={24} />}

            {credentialsRequest.isSuccess && credentials.length === 0 && (
                <Empty
                    icon='key'
                    title='A secure home for your connections'
                    description='Add a credential to connect a source. Viewers can use it without revealing its values.'
                />
            )}

            {credentials.length > 0 && (
                <div className='table-panel'>
                    <HTMLTable striped className='data-table'>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>System</th>
                                <th>Updated</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {credentials.map(credential => (
                                <tr key={credential.rid}>
                                    <td className='font-medium'>{credential.name}</td>
                                    <td>
                                        <Tag minimal>{credential.templateId}</Tag>
                                    </td>
                                    <td>{dateTime(credential.updatedAt)}</td>
                                    <td className='text-right'>
                                        <Button
                                            size='small'
                                            icon='edit'
                                            disabled={!templates.some(template => template.id === credential.templateId)}
                                            onClick={() => setEditing(credential)}
                                        >
                                            Edit values
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </HTMLTable>
                </div>
            )}

            {isCreating && (
                <CredentialDialog templates={templates} onClose={() => setIsCreating(false)} />
            )}

            {editing && selectedTemplate && (
                <CredentialEditor
                    credential={editing}
                    template={selectedTemplate}
                    onClose={() => setEditing(null)}
                />
            )}
        </>
    )
}
