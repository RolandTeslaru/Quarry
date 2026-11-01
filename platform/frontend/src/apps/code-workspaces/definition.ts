import type { App } from '@/AppKit'

/** The flat `</>` — Code Workspaces' resources at xs (rows, links, the tree): ResourceIcon. */
export const codeWorkspaceFlatGlyph: App.Glyph = {
    icon:  'code',
    tile:  'bg-violet-500/15',
    base:  'fill-violet-600',
}

/** Code Workspaces: Python transforms, written in VS Code in the browser and previewed on samples. */
export const codeWorkspacesApp: App.Definition = {
    id:           'code-workspaces',
    label:        'Code Workspaces',
    description:  'Write transforms in Python — Polars, DuckDB, pandas — in VS Code in the browser, and preview them on samples of your datasets.',
    // The isometric brick — launchpad, sidebar, header, home (Typology's icon).
    glyph: {
        illustration: 'codeWorkspace',
        tile:         'bg-violet-500/15',
        share:        0.9,
    },
    to:           '/code-workspaces',
    inNavigation: true,
    home: {
        tint: '--color-violet-600',
        wave: { speed: 0.04, frequency: 1.5, amplitude: 0.22 },
    },
    opens: {
        workspace: rid => ({ to: '/code-workspaces/$rid', params: { rid } }),
    },
}
