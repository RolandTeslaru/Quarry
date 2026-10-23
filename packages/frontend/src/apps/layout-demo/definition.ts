import type { App } from '@/AppKit'

/** Test app: every AppKit part, no backend. */
export const layoutDemoApp: App.Definition = {
    id:           'layout-demo',
    label:        'Layout demo',
    description:  'Test app: every AppKit part, with no backend.',
    glyph: {
        icon:  'page-layout',
        tile:  'bg-indigo-500/15',
        base:  'fill-indigo-600',
        parts: {
            1: 'fill-indigo-300',                            // left pane
            2: 'fill-indigo-100',                            // content
            3: 'fill-indigo-400',                            // header
        },
    },
    to:           '/layout-demo',
    inNavigation: true,
    opens:        {},
}
