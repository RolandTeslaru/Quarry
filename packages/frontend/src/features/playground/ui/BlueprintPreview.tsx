import type { ComponentType } from 'react'
import type { SampleId, Theme } from '../catalog'
import { Preview, type PreviewExampleProps } from './Preview'
import { BlueprintColorSheet } from './BlueprintColorSheet'
import { blueprintControls } from './blueprint-controls'
import { blueprintOverlays } from './blueprint-overlays'
import { blueprintContent } from './blueprint-content'
import { Icons } from '@blueprintjs/icons'
import { loadIconPaths } from '@quarry/standard-ui/icons'
import blueprintStyles from './blueprint.css?inline'

Icons.setLoaderOptions({
    loader: async (name, grid) => {
        const paths = await loadIconPaths(name, grid)

        return [...paths]
    },
})

const examples: Record<SampleId, ComponentType<PreviewExampleProps>> = {
    colors: BlueprintColorSheet,
    ...blueprintControls,
    ...blueprintOverlays,
    ...blueprintContent,
}

interface Props {
    theme: Theme
    filter: string
}

export function BlueprintPreview({ theme, filter }: Props) {
    return (
        <>
            <style>{blueprintStyles}</style>
            <Preview library='blueprint' theme={theme} filter={filter} examples={examples} />
        </>
    )
}
