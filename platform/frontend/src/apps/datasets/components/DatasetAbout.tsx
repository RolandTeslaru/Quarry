import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import { Accordion } from '@quarry/standard-ui/foundations/accordion'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
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

/** Rows the skeleton draws: as many as the Details section usually has. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]

/**
 * The About tab: what the dataset is, where it lives, when and how it last changed, and whether it's up to date.
 * It shows once everything it reads has answered — a skeleton until then, never rows popping in one by one.
 */
export function DatasetAbout({ dataset, view }: Props) {
    const [path, [pathRequest]] = LibrarySDK.useWith(
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

    // The producer is read once the recipe names it: a derived dataset's page waits for both.
    const producerRid = recipeRequest.data?.recipe?.producerRid ?? null

    const [producerPath, [producerRequest]] = LibrarySDK.useWith(
        state => producerRid ? LibrarySDK.selectors.path(state, producerRid) : [],
        query => producerRid ? [query.path(producerRid)] : [],
    )

    const loading = pathRequest.isPending
        || usersRequest.isPending
        || latestRequest.isPending
        || recipeRequest.isPending
        || stalenessRequest.isPending
        || (producerRequest?.isPending ?? false)

    if (loading)
        return <AboutSkeleton />

    const users = usersRequest.data ?? {}
    const latest = latestRequest.data?.transaction ?? null
    const recipe = recipeRequest.data?.recipe ?? null
    const producer = producerPath.at(-1)
    const staleness = stalenessRequest.data?.staleness[dataset.rid]
    const rowCount = view?.rowCount ?? statsRequest.data?.rowCount ?? null

    function userName(rid: Identity.User.Rid | null): string {
        if (!rid)
            return 'the system'

        return users[rid]?.displayName ?? 'someone'
    }

    return (
        <div className='flex flex-col'>
            <p className='px-3 py-3 text-sm text-muted-foreground'>{dataset.description || 'No description.'}</p>

            <Accordion.Root type='multiple' defaultValue={['details', 'transaction']} className='border-t border-border'>
                <Accordion.Item value='details'>
                    <Accordion.Trigger className='px-3'>Details</Accordion.Trigger>
                    <Accordion.Content className='px-3 pb-3'>
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
                                    <ProducerLink producer={producer} />
                                </Detail>
                            )}

                            <Detail label='Freshness'>
                                <Freshness staleness={staleness} recipe={recipe} />
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

                            <Detail label='Format'>{view?.schema ? formatSummary(view.schema) : '—'}</Detail>

                            <Detail label='RID'>
                                <Copyable value={dataset.rid} what='RID' />
                            </Detail>
                        </Details>
                    </Accordion.Content>
                </Accordion.Item>

                <Accordion.Item value='transaction'>
                    <Accordion.Trigger className='px-3'>Last transaction</Accordion.Trigger>
                    <Accordion.Content className='px-3 pb-3'>
                        {latest
                            ? <LastTransaction transaction={latest} userName={userName} />
                            : <p className='text-sm text-muted-foreground'>Nothing committed yet.</p>}
                    </Accordion.Content>
                </Accordion.Item>
            </Accordion.Root>
        </div>
    )
}

interface LastTransactionProps {
    transaction: Catalog.Transaction
    userName:    (rid: Identity.User.Rid | null) => string
}

/** The transaction that made the latest version: its kind, who started it, when and for how long, and what wrote it. */
function LastTransaction({ transaction, userName }: LastTransactionProps) {
    const buildRid = transaction.provenance.buildRid
    const jobRid = transaction.provenance.jobRid

    return (
        <Details>
            <Detail label='Version'>{transaction.sequence !== null ? `${number(transaction.sequence)} on ${transaction.branch}` : '—'}</Detail>
            <Detail label='Kind'><span className='capitalize'>{transaction.type}</span></Detail>
            <Detail label='Written by'><UpdatedVia transaction={transaction} /></Detail>
            <Detail label='Started'>
                <span title={dateTime(transaction.startedAt)}>{ago(transaction.startedAt)} by {userName(transaction.startedBy)}</span>
            </Detail>
            <Detail label='Committed'>
                {transaction.finishedAt
                    ? <span title={dateTime(transaction.finishedAt)}>{ago(transaction.finishedAt)} · took {duration(transaction.startedAt, transaction.finishedAt)}</span>
                    : '—'}
            </Detail>
            {typeof buildRid === 'string' && <Detail label='Build'><Copyable value={buildRid} what='Build RID' /></Detail>}
            {typeof jobRid === 'string' && <Detail label='Job'><Copyable value={jobRid} what='Job RID' /></Detail>}
            <Detail label='RID'><Copyable value={transaction.rid} what='Transaction RID' /></Detail>
        </Details>
    )
}

/** A RID, truncated, with a button copying it whole. */
function Copyable({ value, what }: { value: string; what: string }) {
    return (
        <span className='flex min-w-0 items-center gap-1'>
            <span className='truncate font-mono text-xs' title={value}>{value}</span>
            <Button
                minimal
                size='icon-xxs'
                icon='duplicate'
                aria-label={`Copy ${what}`}
                onClick={() => {
                    void navigator.clipboard.writeText(value)
                    NotificationSDK.toast.success(`${what} copied`)
                }}
            />
        </span>
    )
}

/** The resource that publishes the dataset's recipe — a workspace or a source — linked to its app. */
function ProducerLink({ producer }: { producer: Library.Resource.Base | undefined }) {
    if (!producer)
        return <span className='text-muted-foreground'>—</span>

    return (
        <Link {...resourceRoute(producer.type, producer.rid)} className='flex min-w-0 items-center gap-1 hover:underline'>
            <Icon name={producer.type === 'workspace' ? 'code' : 'data-connection'} size={12} className='shrink-0 text-muted-foreground' />
            <span className='truncate'>{producer.name}</span>
        </Link>
    )
}

/** The tab's shape while it loads: a description line, then the Details section's label / value rows. */
function AboutSkeleton() {
    return (
        <div className='flex flex-col' role='status' aria-label='Loading details'>
            <div className='px-3 py-3'>
                <Skeleton className='h-4 w-40' />
            </div>

            <div className='border-t border-border px-3 py-2'>
                <Skeleton className='h-4 w-16' />
            </div>

            <Details className='px-3 pb-3'>
                {SKELETON_ROWS.map(row => (
                    <Fragment key={row}>
                        <Skeleton className='h-4 w-16' />
                        <Skeleton className='h-4 w-40' />
                    </Fragment>
                ))}
            </Details>
        </div>
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

/** "CSV · comma-separated, quoted with \"" or "Parquet" */
function formatSummary(schema: Catalog.ColumnSchema): string {
    if (schema.reader.format === 'parquet')
        return 'Parquet'

    let delimiter = `"${schema.reader.delimiter}"`

    if (schema.reader.delimiter === ',')
        delimiter = 'comma'

    if (schema.reader.delimiter === '\t')
        delimiter = 'tab'

    if (!schema.reader.quote)
        return `CSV · ${delimiter}-separated, not quoted`

    return `CSV · ${delimiter}-separated, quoted with ${schema.reader.quote}`
}

/** "850 ms", "12 s", "3 min 20 s" */
function duration(from: Date, to: Date): string {
    const ms = to.getTime() - from.getTime()

    if (ms < 1000)
        return `${ms} ms`

    const seconds = Math.round(ms / 1000)

    if (seconds < 60)
        return `${seconds} s`

    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
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
