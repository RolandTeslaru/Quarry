import type { App } from '@/AppKit'

/** Code Workspaces: Python transforms, written in VS Code in the browser and previewed on samples. */
export const codeWorkspacesApp: App.Definition = {
    id:           'code-workspaces',
    label:        'Code Workspaces',
    description:  'Write transforms in Python — Polars, DuckDB, pandas — in VS Code in the browser, and preview them on samples of your datasets.',
    glyph: {
        icon:  'code',
        tile:  'bg-violet-500/15',
        base:  'fill-violet-600',
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
