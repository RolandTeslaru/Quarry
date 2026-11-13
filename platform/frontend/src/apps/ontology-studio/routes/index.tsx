import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import type { Ontology } from '@quarry/shared/domain'
import { Home } from '@/AppKit'
import { OntologySDK } from '@/SDKs/OntologySDK/sdk'
import { ObjectTypeIcon } from '@/SDKs/OntologySDK/ui/ObjectTypeIcon'
import { ErrorNotice } from '@/components/ErrorNotice'
import { dateTime } from '@/utils/format'

/** The home's tabs: Object types is the default; Link types lives in `?view=link-types`. */
type HomeView = 'object-types' | 'link-types'

interface OntologyStudioSearch {
    view?: Exclude<HomeView, 'object-types'>
}

/** What backs each kind of link, as the table names it. */
const BACKING_LABELS: Record<Ontology.LinkType.Backing['kind'], string> = {
    'foreign-key': 'Foreign key',
    'dataset':     'Join dataset',
    'object':      'Intermediary object type',
}

export const Route = createFileRoute('/_shell/ontology-studio/')({
    validateSearch: (search: Record<string, unknown>): OntologyStudioSearch =>
        search.view === 'link-types' ? { view: 'link-types' } : {},
    component: OntologyStudioHome,
})

/** Ontology Studio's home: every object type you can see, or every link type. */
function OntologyStudioHome() {
    const navigate = useNavigate()
    const view: HomeView = Route.useSearch().view ?? 'object-types'

    // Link types name their object types, so both tabs read the object types.
    const [, [objectTypesRequest, linkTypesRequest]] = OntologySDK.useWith(
        () => null,
        query => [query.objectTypes, { ...query.linkTypes, enabled: view === 'link-types' }],
    )

    const listRequest = view === 'link-types' ? linkTypesRequest : objectTypesRequest

    function openView(next: string) {
        void navigate({ to: '/ontology-studio', search: next === 'link-types' ? { view: 'link-types' } : {} })
    }

    function refresh() {
        void objectTypesRequest.refetch()

        if (view === 'link-types')
            void linkTypesRequest.refetch()
    }

    return (
        <Home.Root>
            <Home.Header>
                <Home.Logo />
                <Home.PreTitle />
                <Home.Title />
                <Home.TitleDescription />
            </Home.Header>

            <Home.Content>
                <Tabs.Root value={view} onValueChange={openView} className='gap-0'>
                    <Home.Toolbar>
                        <Tabs.List aria-label='Ontology Studio home'>
                            <Tabs.Trigger value='object-types'>Object types</Tabs.Trigger>
                            <Tabs.Trigger value='link-types'>Link types</Tabs.Trigger>
                        </Tabs.List>
                        <Button
                            variant='minimal'
                            icon='refresh'
                            aria-label='Refresh'
                            loading={objectTypesRequest.isFetching || linkTypesRequest.isFetching}
                            onClick={refresh}
                        />
                        <Home.Actions>
                            <Button variant='outlined' icon='link' onClick={() => OntologySDK.dialogs.openCreateLinkType()}>
                                New link type
                            </Button>
                            <Button intent='success' icon='plus' onClick={() => OntologySDK.dialogs.openCreateObjectType()}>
                                New object type
                            </Button>
                        </Home.Actions>
                    </Home.Toolbar>

                    <div className='flex flex-col gap-3 px-6 py-5'>
                        <ErrorNotice error={objectTypesRequest.error ?? linkTypesRequest.error} />

                        {(objectTypesRequest.isPending || listRequest.isPending) && (
                            <Spinner className='size-6' role='status' aria-label='Loading' />
                        )}

                        {view === 'object-types' && objectTypesRequest.data && (
                            <ObjectTypesTable objectTypes={objectTypesRequest.data} />
                        )}

                        {view === 'link-types' && objectTypesRequest.data && linkTypesRequest.data && (
                            <LinkTypesTable linkTypes={linkTypesRequest.data} objectTypes={objectTypesRequest.data} />
                        )}
                    </div>
                </Tabs.Root>
            </Home.Content>
        </Home.Root>
    )
}

interface ObjectTypesTableProps {
    objectTypes: Ontology.ObjectType[]
}

/** Object types: what they're called in apps and in code, how many properties they have, and when they last changed. */
function ObjectTypesTable({ objectTypes }: ObjectTypesTableProps) {
    if (objectTypes.length === 0)
        return <p className='text-sm text-muted-foreground'>No object types yet.</p>

    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>API name</Table.Head>
                    <Table.Head>Properties</Table.Head>
                    <Table.Head>Last updated</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {objectTypes.map(objectType => (
                    <Table.Row key={objectType.rid}>
                        <Table.Cell>
                            <span className='flex items-center gap-2'>
                                <ObjectTypeIcon ui={objectType.ui} />
                                {objectType.name}
                            </span>
                        </Table.Cell>
                        <Table.Cell className='font-mono text-xs'>{objectType.apiName}</Table.Cell>
                        <Table.Cell>{Object.keys(objectType.properties).length}</Table.Cell>
                        <Table.Cell>{dateTime(objectType.updatedAt)}</Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table.Root>
    )
}

interface LinkTypesTableProps {
    linkTypes:   Ontology.LinkType[]
    objectTypes: Ontology.ObjectType[]
}

/** Link types: the object types they join, what backs them, and when they last changed. */
function LinkTypesTable({ linkTypes, objectTypes }: LinkTypesTableProps) {
    const byRid: Record<Ontology.ObjectType.Rid, Ontology.ObjectType> = {}

    for (const objectType of objectTypes)
        byRid[objectType.rid] = objectType

    if (linkTypes.length === 0)
        return <p className='text-sm text-muted-foreground'>No link types yet.</p>

    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>Between</Table.Head>
                    <Table.Head>Backed by</Table.Head>
                    <Table.Head>Last updated</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {linkTypes.map(linkType => (
                    <Table.Row key={linkType.rid}>
                        <Table.Cell>{linkType.name}</Table.Cell>
                        <Table.Cell>
                            <span className='flex items-center gap-2'>
                                <LinkSide side={linkType.sides.a} objectType={byRid[linkType.sides.a.objectTypeRid]} />
                                <span className='text-muted-foreground'>↔</span>
                                <LinkSide side={linkType.sides.b} objectType={byRid[linkType.sides.b.objectTypeRid]} />
                            </span>
                        </Table.Cell>
                        <Table.Cell>{BACKING_LABELS[linkType.backing.kind]}</Table.Cell>
                        <Table.Cell>{dateTime(linkType.updatedAt)}</Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table.Root>
    )
}

interface LinkSideProps {
    side:       Ontology.LinkType.Side
    objectType: Ontology.ObjectType | undefined
}

/** One end of a link: its object type, or a placeholder for one the user can't see. */
function LinkSide({ side, objectType }: LinkSideProps) {
    if (!objectType)
        return <span className='text-muted-foreground'>Hidden object type</span>

    return (
        <span className='flex items-center gap-1.5'>
            <ObjectTypeIcon ui={objectType.ui} />
            {objectType.name}
            <span className='font-mono text-xs text-muted-foreground'>.{side.apiName}</span>
        </span>
    )
}
