import { Button } from '@quarry/standard-ui/foundations/button'
import { App } from '@/AppKit'
import { Empty } from '@/components/Empty'
import { pipelineBuilderApp } from './definition'

/** Pipeline Builder's home. Scaffold: the app frame and an empty state; pipelines aren't built yet. */
export function PipelineBuilderHome() {
    return (
        <App.Root>
            <App.Header>
                <App.Header.Icon glyph={pipelineBuilderApp.glyph} />
                <App.Header.Rows>
                    <App.Header.Title>Pipeline Builder</App.Header.Title>
                    <span className='text-xs text-muted-foreground'>
                        Turn raw datasets into clean ones: join, filter, reshape, and write new datasets.
                    </span>
                </App.Header.Rows>
                <App.Header.Actions>
                    <Button intent='success' icon='add' disabled>
                        New pipeline
                    </Button>
                </App.Header.Actions>
            </App.Header>

            <App.Content>
                <div className='p-6'>
                    <Empty
                        icon='one-to-many'
                        title='No pipelines yet'
                        description='Pipelines read datasets, transform them step by step, and write the results as new datasets. Coming soon.'
                    />
                </div>
            </App.Content>
        </App.Root>
    )
}
