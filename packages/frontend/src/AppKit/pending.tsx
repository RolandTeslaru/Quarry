import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { Glyph } from './glyph/Glyph'
import { Content, useApp } from './layout'
import { Header } from './header'

/**
 * A resource page while its route loads (the route's `pendingComponent`): the
 * app's header, with its icon, and the page's shape in skeletons.
 */
export function Pending() {
    const app = useApp()

    return (
        <>
            <Header>
                <Header.Icon glyph={app.glyph} />
                <Header.Rows>
                    <Skeleton className='h-3 w-40' />
                    <Skeleton className='mt-1 h-4 w-56' />
                </Header.Rows>
            </Header>

            <Content className='gap-3 p-6' aria-busy>
                <Skeleton className='h-8 w-72' />
                <Skeleton className='h-64 w-full rounded-lg' />
            </Content>
        </>
    )
}
