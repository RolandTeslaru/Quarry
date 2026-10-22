import type { ComponentType } from 'react'
import type { SampleId, Theme } from '../catalog'
import { Preview } from './Preview'
import { blueprintControls } from './blueprint-controls'
import { blueprintOverlays } from './blueprint-overlays'
import { blueprintContent } from './blueprint-content'
import '@blueprintjs/select/lib/css/blueprint-select.css'
import '@blueprintjs/datetime/lib/css/blueprint-datetime.css'

const examples: Record<SampleId, ComponentType> = {
    ...blueprintControls,
    ...blueprintOverlays,
    ...blueprintContent,
}

interface Props {
    theme: Theme
    filter: string
}

export function BlueprintPreview({ theme, filter }: Props) {
    return <Preview library='blueprint' theme={theme} filter={filter} examples={examples} />
}
