import { createFileRoute } from '@tanstack/react-router'
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
import { CredentialTable } from '../components/CredentialTable'

export const Route = createFileRoute('/_workspace/keychain/')({
    component: KeychainApp,
})

/** The Keychain app: every credential the user can see; create one, or edit its values. */
function KeychainApp() {
    const [credentials, [credentialsRequest]] = KeychainSDK.useWith(
        state => state.credentials,
        query => [query.credentials],
    )

    const [templates, [templatesRequest]] = KeychainSDK.useWith(
        state => state.templates,
        query => [query.templates],
    )

    function openEditor(credential: Keychain.Credential.Schema) {
        const template = templates[credential.templateId]

        if (!template)
            return

        KeychainSDK.dialogs.openEditCredentialValues({ credential, template })
    }

    return (
        <App.Home.Root>
            <App.Home.Header>
                <App.Home.Logo />
                <App.Home.PreTitle />
                <App.Home.Title />
                <App.Home.TitleDescription />
            </App.Home.Header>

            <App.Home.Content>
                <App.Home.Section
                    title='Credentials'
                    meta={<>{number(credentials.length)} you can see</>}
                    actions={
                        <>
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
                                disabled={Object.keys(templates).length === 0}
                                onClick={() => KeychainSDK.dialogs.openCreateCredential({ templates })}
                            >
                                New credential
                            </Button>
                        </>
                    }
                >
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
                </App.Home.Section>
            </App.Home.Content>
        </App.Home.Root>
    )
}
