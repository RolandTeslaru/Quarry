import { useEffect, type ComponentType } from 'react'
import type { SampleId, Theme } from '../catalog'
import { Preview, type PreviewExampleProps } from './Preview'
import { StandardColorSheet } from './StandardColorSheet'
import { standardControls } from './standard-controls'
import { standardOverlays } from './standard-overlays'
import { standardContent } from './standard-content'
import '@quarry/standard-ui/index.css'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'

const examples: Record<SampleId, ComponentType<PreviewExampleProps>> = {
    colors: StandardColorSheet,
    ...standardControls,
    ...standardOverlays,
    ...standardContent,
}

interface Props {
    theme: Theme
    filter: string
}

export function StandardPreview({ theme, filter }: Props) {
    useEffect(() => () => DialogSDK.cleanup(), [])

    return (
        <>
            <Preview library='standard' theme={theme} filter={filter} examples={examples} />
            <DialogSDK.UIOverlay />
        </>
    )
}
