import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Home } from '@/AppKit'
import { ForgeSDK } from '@/SDKs/ForgeSDK/sdk'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { number } from '@/utils/format'
import { BuildTable } from '../components/BuildTable'

export const Route = createFileRoute('/_workspace/forge/')({
    component: ForgeApp,
})

/** The Forge app: the builds the user can see, newest first. */
function ForgeApp() {
    const [builds, [buildsRequest]] = ForgeSDK.useWith(
        state => state.builds,
        query => [query.builds],
    )

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
                    title='Builds'
                    meta={<>{number(builds.length)} you can see</>}
                    actions={
                        <Button
                            variant='minimal'
                            icon='refresh'
                            aria-label='Refresh builds'
                            loading={buildsRequest.isFetching}
                            onClick={() => void buildsRequest.refetch()}
                        />
                    }
                >
                    <ErrorNotice error={buildsRequest.error} />

                    {buildsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

                    {buildsRequest.isSuccess && builds.length === 0 && (
                        <Empty
                            icon='build'
                            title='No builds yet'
                            description='Build a dataset and it shows here: what it built, and how it went.'
                        />
                    )}

                    {builds.length > 0 && <BuildTable builds={builds} />}
                </Home.Section>
            </Home.Content>
        </Home.Root>
    )
}
