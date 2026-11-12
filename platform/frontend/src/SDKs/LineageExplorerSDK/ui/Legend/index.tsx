import type { LineageExplorer } from '@quarry/shared/domain'
import { Select } from '@quarry/standard-ui/foundations/select'
import { App } from '@/AppKit'
import { ErrorNotice } from '@/components/ErrorNotice'
import { LineageExplorerSDK } from '../../sdk'
import { LEGENDS } from './legends'
import { useStaleness } from './useStaleness'

const LEGEND_TYPES = Object.keys(LEGENDS) as LineageExplorer.Legend.Type[]

/** The key to the nodes' colours, and what they're coloured by: a panel at the right, toggled from the nav. */
export function LineageLegend() {
    const type = LineageExplorerSDK.useDocument(d => d.legend.type)
    const stalenessRequest = useStaleness()
    // Its own subscription: a record of numbers compares shallowly, but not inside an array.
    const counts = LineageExplorerSDK.useDocument(d => LEGENDS[d.legend.type].getCounts(d, stalenessRequest.data?.staleness))

    const legend = LEGENDS[type]

    // Most nodes first.
    const keys = Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))

    return (
        <App.RightSidebar className='flex flex-col gap-3 self-start p-3'>
            <Select.Root value={type} onValueChange={value => LineageExplorerSDK.actions.legend.setType(value as LineageExplorer.Legend.Type)}>
                <Select.Trigger size='default' aria-label='Colour nodes by'>
                    <Select.Value />
                </Select.Trigger>
                <Select.Content>
                    {LEGEND_TYPES.map(legendType => (
                        <Select.Item key={legendType} value={legendType}>
                            {LEGENDS[legendType].label}
                        </Select.Item>
                    ))}
                </Select.Content>
            </Select.Root>

            {type === 'staleness' && <ErrorNotice error={stalenessRequest.error} />}

            {keys.length === 0 && (
                <p className='text-xs text-muted-foreground'>Nothing on the canvas yet.</p>
            )}

            <ul className='grid grid-cols-2 gap-x-3 gap-y-2'>
                {keys.map(key => {
                    const entry = legend.describe(key)

                    return (
                        <li key={key} className='flex min-w-0 items-center gap-2 text-xs'>
                            <span className='size-3 shrink-0 rounded-xs' style={{ backgroundColor: `var(${entry.tint})` }} />
                            <span className='truncate'>
                                {entry.label} <span className='text-muted-foreground'>({counts[key]})</span>
                            </span>
                        </li>
                    )
                })}
            </ul>
        </App.RightSidebar>
    )
}
