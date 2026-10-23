import type { App } from '@/AppKit'

/** Test app: only a header and content — the unused columns collapse. Launcher only. */
export const minimalDemoApp: App.Definition = {
    id:           'minimal-demo',
    label:        'Minimal demo',
    description:  'Test app: only a header and content.',
    glyph: {
        icon:  'square',
        tile:  'bg-neutral-500/15',
        base:  'fill-neutral-500',
        parts: { 1: 'fill-neutral-200' },
    },
    to:           '/minimal-demo',
    inNavigation: false,
    opens:        {},
}
