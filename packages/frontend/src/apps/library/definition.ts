import type { App } from '@/AppKit'

/** Folders and projects: the workspace's file browser. */
export const libraryApp: App.Definition = {
    id:           'library',
    label:        'Projects & data',
    icon:         'projects',
    to:           '/library',
    inNavigation: true,
    opens: {
        project: rid => ({ to: '/resources/$rid', params: { rid } }),
        folder:  rid => ({ to: '/resources/$rid', params: { rid } }),
    },
}
