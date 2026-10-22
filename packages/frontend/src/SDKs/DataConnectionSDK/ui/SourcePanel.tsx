import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Callout } from '@quarry/standard-ui/foundations/callout'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { Icon } from '@quarry/standard-ui/icons'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
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

    function retry() {
        void sourceRequest.refetch()
        void definitionsRequest.refetch()
    }

    if (sourceRequest.isPending || definitionsRequest.isPending)
        return <Spinner className='size-6' role='status' aria-label='Loading' />

    if (sourceRequest.error || definitionsRequest.error) {
        return (
            <>
                <ErrorNotice error={sourceRequest.error ?? definitionsRequest.error} />
                <Button onClick={retry}>
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
                <Badge variant='secondary'>
                    <Icon name='database' />
                    {definition.displayName}
                </Badge>
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

            <Tabs.Root defaultValue='syncs'>
                <Tabs.List className='self-start' aria-label='Source sections'>
                    <Tabs.Trigger value='syncs'>Syncs &amp; runs</Tabs.Trigger>
                    {definition.capabilities.explore && (
                        <Tabs.Trigger value='tables'>Explore tables</Tabs.Trigger>
                    )}
                </Tabs.List>
                <Tabs.Content value='syncs'>
                    <SyncPanel source={source} definition={definition} />
                </Tabs.Content>
                {definition.capabilities.explore && (
                    <Tabs.Content value='tables'>
                        <SourceTables source={source} definition={definition} />
                    </Tabs.Content>
                )}
            </Tabs.Root>
        </>
    )
}
