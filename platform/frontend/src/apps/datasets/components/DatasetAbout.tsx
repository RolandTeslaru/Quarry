import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Icon } from '@quarry/standard-ui/icons'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { cn } from '@quarry/standard-ui/utils/cn'
import { Foundations, type Catalog, type Dataset, type Forge, type Identity, type Library } from '@quarry/shared/domain'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { ForgeSDK } from '@/SDKs/ForgeSDK/sdk'
import { IdentitySDK } from '@/SDKs/IdentitySDK/sdk'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { Detail, Details } from '@/components/Details'
import { resourceRoute } from '@/routes/shell.layout/components/apps'
import { ago, dateTime, fileSize, number } from '@/utils/format'

interface Props {
    dataset: Dataset
    view:    Dataset.View | undefined
}

/** The About tab: what the dataset is, where it lives, when and how it last changed, and whether it's up to date. */
export function DatasetAbout({ dataset, view }: Props) {
    const [path] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, dataset.rid),
        query => [query.path(dataset.rid)],
    )

    const [, [usersRequest]] = IdentitySDK.useWith(() => null, query => [query.users])

    // Stats are only read here, never fetched: a full read, it runs when asked (Calculate row count, or the Columns tab).
    const [, [latestRequest, statsRequest]] = CatalogSDK.useWith(
        () => null,
        query => [query.latestTransaction(dataset.rid), { ...query.columnStats(dataset.rid), enabled: false }],
    )

    const [, [recipeRequest, stalenessRequest]] = ForgeSDK.useWith(
        () => null,
        query => [query.currentRecipe(dataset.rid), query.staleness([dataset.rid], Foundations.MAIN_BRANCH)],
    )

    const users = usersRequest.data ?? {}
    const latest = latestRequest.data?.transaction ?? null
    const recipe = recipeRequest.data?.recipe ?? null
    const staleness = stalenessRequest.data?.staleness[dataset.rid]
    const rowCount = view?.rowCount ?? statsRequest.data?.rowCount ?? null

    function userName(rid: Identity.User.Rid | null): string {
        if (!rid)
            return 'the system'

        return users[rid]?.displayName ?? 'someone'
    }

    return (
        <div className='flex flex-col gap-4 py-4'>
            <p className='text-sm text-muted-foreground'>{dataset.description || 'No description.'}</p>

            <Details>
                <Detail label='Updated'>
                    {latest?.finishedAt
                        ? <span title={dateTime(latest.finishedAt)}>{ago(latest.finishedAt)} by {userName(latest.startedBy)}</span>
                        : <span className='text-muted-foreground'>No data yet</span>}
                </Detail>

                <Detail label='Created'>
                    <span title={dateTime(dataset.createdAt)}>{ago(dataset.createdAt)} by {userName(dataset.createdBy)}</span>
                </Detail>

                <Detail label='Location'>
                    <span className='flex min-w-0 flex-wrap items-center gap-x-1'>
                        {path.slice(0, -1).map(ancestor => (
                            <Fragment key={ancestor.rid}>
                                <span className='text-muted-foreground'>/</span>
                                <Link {...resourceRoute(ancestor.type, ancestor.rid)} className='truncate hover:underline'>
                                    {ancestor.name}
                                </Link>
                            </Fragment>
                        ))}
                    </span>
                </Detail>

                <Detail label='Type'>{recipe ? 'Derived dataset' : 'Raw dataset'}</Detail>

                {recipe && (
                    <Detail label='Computed by'>
                        <ProducerLink rid={recipe.producerRid} />
                    </Detail>
                )}

                <Detail label='Freshness'>
                    {recipeRequest.isPending || stalenessRequest.isPending
                        ? <span className='text-muted-foreground'>Checking…</span>
                        : <Freshness staleness={staleness} recipe={recipe} />}
                </Detail>

                <Detail label='Size'>
                    <span className='flex flex-col'>
                        <span>{view ? sizeSummary(view) : '—'}</span>
                        {rowCount !== null
                            ? <span>{number(rowCount)} rows</span>
                            : (
                                <button
                                    type='button'
                                    className='w-fit text-left text-primary hover:underline disabled:opacity-60'
                                    disabled={statsRequest.isFetching || !view?.files.length}
                                    onClick={() => void CatalogSDK.fetch(CatalogSDK.query.columnStats(dataset.rid))}
                                >
                                    {statsRequest.isFetching ? 'Counting rows…' : 'Calculate row count'}
                                </button>
                            )}
                    </span>
                </Detail>

                <Detail label='Updated via'>
                    <UpdatedVia transaction={latest} />
                </Detail>

                <Detail label='Version'>
                    {view ? `${number(view.sequence)} on ${view.branch}` : '—'}
                </Detail>

                <Detail label='RID'>
                    <span className='flex min-w-0 items-center gap-1'>
                        <span className='truncate font-mono text-xs' title={dataset.rid}>{dataset.rid}</span>
                        <Button
                            minimal
                            size='icon-xxs'
                            icon='duplicate'
                            aria-label='Copy RID'
                            onClick={() => {
                                void navigator.clipboard.writeText(dataset.rid)
                                NotificationSDK.toast.success('RID copied')
                            }}
                        />
                    </span>
                </Detail>
            </Details>
        </div>
    )
}

/** The resource that publishes the dataset's recipe — a workspace or a source — linked to its app. */
function ProducerLink({ rid }: { rid: Library.Resource.Rid }) {
    const [path] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, rid),
        query => [query.path(rid)],
    )

    const producer = path.at(-1)

    if (!producer)
        return <span className='text-muted-foreground'>—</span>

    return (
        <Link {...resourceRoute(producer.type, producer.rid)} className='flex min-w-0 items-center gap-1 hover:underline'>
            <Icon name={producer.type === 'workspace' ? 'code' : 'data-connection'} size={12} className='shrink-0 text-muted-foreground' />
            <span className='truncate'>{producer.name}</span>
        </Link>
    )
}

interface FreshnessProps {
    staleness: Library.Lineage.Staleness | undefined
    recipe:    Forge.Recipe | null
}

/** Up to date, out of date (and why), out of date further up, or never built — as Foundry's lineage colours it. */
function Freshness({ staleness, recipe }: FreshnessProps) {
    if (!recipe)
        return <FreshnessLabel tone='fresh' icon='tick-circle'>Up to date · raw data</FreshnessLabel>

    if (!staleness)
        return <span className='text-muted-foreground'>—</span>

    if (staleness.reasons.includes('never-built'))
        return <FreshnessLabel tone='muted' icon='circle'>Never built</FreshnessLabel>

    if (staleness.reasons.length > 0) {
        const why: string[] = []

        if (staleness.reasons.includes('logic-changed'))
            why.push('new logic')

        if (staleness.reasons.includes('inputs-changed'))
            why.push(`new data in ${staleness.changedInputs.length} ${staleness.changedInputs.length === 1 ? 'input' : 'inputs'}`)

        return <FreshnessLabel tone='stale' icon='warning-sign'>Out of date · {why.join(', ')}</FreshnessLabel>
    }

    if (staleness.distance !== null) {
        const steps = staleness.distance === 1 ? '1 step up' : `${staleness.distance} steps up`

        return <FreshnessLabel tone='upstream' icon='outdated'>Out of date upstream · {steps}</FreshnessLabel>
    }

    return <FreshnessLabel tone='fresh' icon='tick-circle'>Up to date</FreshnessLabel>
}

interface FreshnessLabelProps {
    tone:     'fresh' | 'stale' | 'upstream' | 'muted'
    icon:     'tick-circle' | 'warning-sign' | 'outdated' | 'circle'
    children: ReactNode
}

function FreshnessLabel({ tone, icon, children }: FreshnessLabelProps) {
    return (
        <span
            className={cn(
                'flex items-center gap-1.5',
                tone === 'fresh' && 'text-(--success-foreground)',
                tone === 'stale' && 'text-destructive',
                tone === 'upstream' && 'text-(--warning-foreground)',
                tone === 'muted' && 'text-muted-foreground',
            )}
        >
            <Icon name={icon} size={12} className='shrink-0' />
            {children}
        </span>
    )
}

/** How the latest version was written: an upload, a build (linked to Forge), or a schema edit. */
function UpdatedVia({ transaction }: { transaction: Catalog.Transaction | null }) {
    if (!transaction)
        return <span className='text-muted-foreground'>—</span>

    if (transaction.provenance.schemaEdit)
        return <span>Schema edit</span>

    if (transaction.provenance.jobRid)
        return <Link to='/forge' className='hover:underline'>Build</Link>

    return <span>Upload</span>
}

/** "5 columns • 1 file • 229 KB" */
function sizeSummary(view: Dataset.View): string {
    const columns = view.schema?.columns.length ?? 0
    const files = view.files.length
    let bytes = 0

    for (const file of view.files)
        bytes += file.bytes

    return `${number(columns)} columns • ${files} ${files === 1 ? 'file' : 'files'} • ${fileSize(bytes)}`
}
