import type { App } from '@/AppKit'

/** Folders and projects: the workspace's file browser. */
export const libraryApp: App.Definition = {
    id:           'library',
    label:        'Library Explorer',
    description:  "The workspace's files: projects and folders, and everything kept in them.",
    glyph: {
        illustration: 'folder',
        color:        'var(--color-amber-400)',
        tile:         'bg-amber-400/15',
    },
    to:           '/library',
    inNavigation: true,
    home: {
        tint: '--color-sky-800',
        wave: { speed: 0.035, frequency: 1.3, amplitude: 0.22 },
    },
    opens: {
        project: rid => ({ to: '/library/$rid', params: { rid } }),
        folder:  rid => ({ to: '/library/$rid', params: { rid } }),
    },
}
