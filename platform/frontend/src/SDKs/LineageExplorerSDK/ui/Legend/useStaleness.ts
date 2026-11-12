import { ForgeSDK } from '@/SDKs/ForgeSDK/sdk'
import { LineageExplorerSDK } from '../../sdk'

/** Forge's staleness for the canvas's datasets on its branch, read only while the nodes are coloured by it. */
export function useStaleness() {
    // Its own subscription: an array of rids compares shallowly, but not inside a tuple.
    const datasetRids = LineageExplorerSDK.useDocument(d => d.selectors.legend.getDatasetRids(d))
    const [branch, isShown] = LineageExplorerSDK.useDocument(d => [d.branch, d.legend.type === 'staleness'])

    const [, [stalenessRequest]] = ForgeSDK.useWith(
        () => null,
        query => {
            const staleness = query.staleness(datasetRids, branch)

            return [{ ...staleness, enabled: staleness.enabled && isShown }]
        },
    )

    return stalenessRequest
}
