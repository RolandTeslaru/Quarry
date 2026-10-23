import { createFileRoute } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { minimalDemoApp } from '../definition'

export const Route = createFileRoute('/_workspace/minimal-demo/')({
    component: MinimalDemoApp,
})

/** Test app: header and content only — the left nav and sidebars are left out, so their columns collapse. */
function MinimalDemoApp() {
    return (
        <>
            <App.Header>
                <App.Header.Icon glyph={minimalDemoApp.glyph} />
                <App.Header.Rows>
                    <App.Header.Title>Minimal demo</App.Header.Title>
                </App.Header.Rows>
            </App.Header>

            <App.Content>
                <div className='p-6 text-sm text-muted-foreground'>
                    Only `App.Header` and `App.Content` — the content should span the full width.
                </div>
            </App.Content>
        </>
    )
}
