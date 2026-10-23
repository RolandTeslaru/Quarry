import type { App } from '@/AppKit'

/** Pipelines: datasets in, transforms, datasets out. Scaffold — no pipelines yet. */
export const pipelineBuilderApp: App.Definition = {
    id:           'pipeline-builder',
    label:        'Pipeline Builder',
    glyph: {
        icon:  'one-to-many',
        tile:  'bg-teal-500/15',
        base:  'fill-teal-600',
        parts: {
            2: 'fill-teal-200',                              // the input node
            0: 'fill-cyan-300',                              // the output nodes
            3: 'fill-cyan-300',
        },
    },
    to:           '/pipeline-builder',
    inNavigation: true,
    opens:        {},
}
