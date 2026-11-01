import type { App } from '@/AppKit'

/** Pipelines: datasets in, transforms, datasets out. Scaffold — no pipelines yet. */
export const pipelineBuilderApp: App.Definition = {
    id:           'pipeline-builder',
    label:        'Pipeline Builder',
    description:  'Turn raw datasets into clean ones: join, filter, reshape, and write new datasets.',
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
    home: {
        tint: '--color-teal-600',
        wave: { speed: 0.03, frequency: 1.2, amplitude: 0.2 },
    },
    opens:        {},
}
