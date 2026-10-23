import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { App } from '@/AppKit'
import { Empty } from '@/components/Empty'

export const Route = createFileRoute('/_workspace/pipeline-builder/')({
    component: PipelineBuilderHome,
})

/** Pipeline Builder's home. Scaffold: the app frame and an empty state; pipelines aren't built yet. */
function PipelineBuilderHome() {
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
                    title='Pipelines'
                    actions={
                        <Button intent='success' icon='add' disabled>
                            New pipeline
                        </Button>
                    }
                >
                    <Empty
                        icon='one-to-many'
                        title='No pipelines yet'
                        description='Pipelines read datasets, transform them step by step, and write the results as new datasets. Coming soon.'
                    />
                </App.Home.Section>
            </App.Home.Content>
        </App.Home.Root>
    )
}
