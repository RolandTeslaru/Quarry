import { type Dataset, type Library, LineageExplorer } from '@quarry/shared/domain'
import { RESOURCE_TYPE_LABELS, resourceTint } from '@/routes/shell.layout/components/apps'

type Tint = `--color-${string}`

type Staleness = Record<Dataset.Rid, Library.Lineage.Staleness> | undefined

/** One way of colouring the nodes: each node's colour, and the legend's entries. */
export interface LegendDefinition {
    label: string

    /** `staleness`: Forge's answer for the canvas, which only the `staleness` legend reads. */
    getTint: (resource: Library.Resource.Base, staleness: Staleness) => Tint

    /** How many nodes each entry covers, by entry key. Numbers only, so a subscription to it compares shallowly. */
    getCounts: (document: LineageExplorer.Document, staleness: Staleness) => Partial<Record<string, number>>

    describe: (key: string) => {
        label: string
        tint:  Tint
    }
}

const STALENESS_ENTRIES: Record<LineageExplorer.Legend.Staleness.Key, { label: string; tint: Tint }> = {
    'never-built':    { label: 'Never built', tint: '--color-violet-500' },
    'logic-changed':  { label: 'Logic changed', tint: '--color-red-500' },
    'inputs-changed': { label: 'Inputs changed', tint: '--color-orange-500' },
    'stale-upstream': { label: 'Stale upstream', tint: '--color-yellow-400' },
    'fresh':          { label: 'Fresh', tint: '--color-emerald-500' },
    'checking':       { label: 'Checking', tint: '--color-neutral-300' },
    'not-a-dataset':  { label: 'Not a dataset', tint: '--color-neutral-500' },
}

export const LEGENDS: Record<LineageExplorer.Legend.Type, LegendDefinition> = {
    'resource-type': {
        label:     'Resource types',
        getTint:   resource => resourceTint(resource.type),
        getCounts: d => d.selectors.legend.getResourceTypeCounts(d),
        describe:  key => ({
            label: RESOURCE_TYPE_LABELS[key as Library.Resource.Type],
            tint:  resourceTint(key as Library.Resource.Type),
        }),
    },

    'staleness': {
        label:     'Staleness',
        getTint:   (resource, staleness) => STALENESS_ENTRIES[LineageExplorer.Legend.Staleness.getKey(resource, staleness)].tint,
        getCounts: (d, staleness) => d.selectors.legend.getStalenessCounts(d, staleness),
        describe:  key => STALENESS_ENTRIES[key as LineageExplorer.Legend.Staleness.Key],
    },
}
