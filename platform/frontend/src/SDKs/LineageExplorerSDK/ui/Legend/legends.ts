import type { Library, LineageExplorer } from '@quarry/shared/domain'
import { RESOURCE_TYPE_LABELS, resourceTint } from '@/routes/shell.layout/components/apps'

type Tint = `--color-${string}`

/** One way of colouring the nodes: each node's colour, and the legend's entries. */
export interface LegendDefinition {
    label: string

    getTint: (resource: Library.Resource.Base) => Tint

    /** How many nodes each entry covers, by entry key. Numbers only, so a subscription to it compares shallowly. */
    getCounts: (document: LineageExplorer.Document) => Partial<Record<string, number>>

    describe: (key: string) => {
        label: string
        tint:  Tint
    }
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
}
