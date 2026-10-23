import type { App } from '@/AppKit'

/** Folders and projects: the workspace's file browser. */
export const libraryApp: App.Definition = {
    id:           'library',
    label:        'Library Explorer',
    glyph: {
        illustration: 'folder',
        color:        'var(--color-amber-400)',
        tile:         'bg-amber-400/15',
    },
    to:           '/library',
    inNavigation: true,
    opens: {
        project: rid => ({ to: '/library/$rid', params: { rid } }),
        folder:  rid => ({ to: '/library/$rid', params: { rid } }),
    },
}
