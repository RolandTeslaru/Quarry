import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Home } from '@/AppKit'
import { Empty } from '@/components/Empty'

export const Route = createFileRoute('/_workspace/pipeline-builder/')({
    component: PipelineBuilderHome,
})

/** Pipeline Builder's home. Scaffold: the app frame and an empty state; pipelines aren't built yet. */
function PipelineBuilderHome() {
    return (
        <Home.Root>
            <Home.Header>
                <Home.Logo />
                <Home.PreTitle />
                <Home.Title />
                <Home.TitleDescription />
            </Home.Header>

            <Home.Content>
                <Home.Section
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
                </Home.Section>
            </Home.Content>
        </Home.Root>
    )
}
