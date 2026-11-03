import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { Glyph } from './glyph/Glyph'
import { Content, Overlay, useApp } from './layout'
import { Nav } from './nav'

/**
 * A resource page while its route loads (the route's `pendingComponent`): the
 * app's nav, with its icon, and the page's shape in skeletons.
 */
export function Pending() {
    const app = useApp()

    return (
        <Overlay>
            <Nav>
                <Nav.Start>
                    <Nav.Icon glyph={app.glyph} />
                    <Nav.Rows>
                        <Skeleton className='h-3 w-40' />
                        <Skeleton className='mt-1 h-4 w-56' />
                    </Nav.Rows>
                </Nav.Start>
            </Nav>

            <Content className='gap-3 px-6 pb-6' aria-busy>
                <Skeleton className='h-8 w-72' />
                <Skeleton className='h-64 w-full rounded-lg' />
            </Content>
        </Overlay>
    )
}
