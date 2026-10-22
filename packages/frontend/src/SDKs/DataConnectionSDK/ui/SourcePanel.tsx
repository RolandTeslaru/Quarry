import { useState } from 'react'
import { Button, Callout, Spinner, Tab, Tabs, Tag } from '@blueprintjs/core'
import type { DataConnection } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { SourceTables } from './SourceTables'
import { SyncPanel } from './SyncPanel'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { useTask } from '@/hooks/useTask'

interface Props {
    rid: DataConnection.Source.Rid
}

export function SourcePanel({ rid }: Props) {
    const [testResult, setTestResult] = useState<DataConnection.API.Source.Test.Response | null>(null)

    const [source, [sourceRequest]] = DataConnectionSDK.useWith(
        state => state.sources[rid],
        query => [query.source(rid)],
    )

    const [definitions, [definitionsRequest]] = DataConnectionSDK.useWith(
        state => state.definitions,
        query => [query.definitions],
    )

    const task = useTask()
    const definition = definitions.find(item => item.id === source?.definitionId)

    const testConnection = () => task.run(async () => {
        setTestResult(null)

        const result = await DataConnectionSDK.actions.source.test(rid)

        setTestResult(result)
    })

    if (sourceRequest.isPending || definitionsRequest.isPending)
        return <Spinner size={24} />

    if (sourceRequest.error || definitionsRequest.error) {
        return (
            <>
                <ErrorNotice error={sourceRequest.error ?? definitionsRequest.error} />
                <Button onClick={() => {
                    void sourceRequest.refetch()
                    void definitionsRequest.refetch()
                }}>
                    Try again
                </Button>
            </>
        )
    }

    if (!source || !definition)
        return <ErrorNotice error='This source type is unavailable.' />

    return (
        <>
            <PageHeader
                eyebrow={`DATA CONNECTION · ${definition.displayName.toUpperCase()}`}
                title={source.name}
                description={source.description ?? definition.description}
                actions={(
                    <Button icon='link' loading={task.pending} onClick={() => void testConnection()}>
                        Test connection
                    </Button>
                )}
            />

            <div className='resource-summary'>
                <Tag minimal icon='database'>{definition.displayName}</Tag>
                <span>{source.credentialRid ? 'Credential connected' : 'No credential required'}</span>
                <code className='resource-rid'>{source.rid}</code>
            </div>

            <ErrorNotice error={task.error} />

            {testResult && (
                <Callout
                    intent={testResult.ok ? 'success' : 'danger'}
                    className='mb-5'
                    title={testResult.ok ? 'Connection successful' : 'Connection failed'}
                >
                    {testResult.error ?? 'The source can be reached with the configured credential.'}
                </Callout>
            )}

            <Tabs id='source-tabs' renderActiveTabPanelOnly defaultSelectedTabId='syncs'>
                <Tab
                    id='syncs'
                    title='Syncs & runs'
                    panel={<SyncPanel source={source} definition={definition} />}
                />
                {definition.capabilities.explore && (
                    <Tab
                        id='tables'
                        title='Explore tables'
                        panel={<SourceTables source={source} definition={definition} />}
                    />
                )}
            </Tabs>
        </>
    )
}
