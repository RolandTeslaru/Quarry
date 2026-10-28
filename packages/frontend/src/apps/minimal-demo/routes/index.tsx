import { createFileRoute } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { minimalDemoApp } from '../definition'

export const Route = createFileRoute('/_workspace/minimal-demo/')({
    component: MinimalDemoApp,
})

/** Test app: navbar and content only — the left nav and sidebars are left out, so their columns collapse. */
function MinimalDemoApp() {
    return (
        <>
            <App.Navbar>
                <App.Navbar.Icon glyph={minimalDemoApp.glyph} />
                <App.Navbar.Rows>
                    <App.Navbar.Title>Minimal demo</App.Navbar.Title>
                </App.Navbar.Rows>
            </App.Navbar>

            <App.Content>
                <div className='p-6 text-sm text-muted-foreground'>
                    Only `App.Navbar` and `App.Content` — the content should span the full width.
                </div>
            </App.Content>
        </>
    )
}
