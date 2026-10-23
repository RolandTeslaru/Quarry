import type { DataConnection } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { SourcePanel } from '@/SDKs/DataConnectionSDK/ui/SourcePanel'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { dataConnectionApp } from '../definition'

interface Props {
    rid: DataConnection.Source.Rid
}

/** The Data Connection app on one source. Scaffold: the existing source panel inside the app frame. */
export function SourceApp({ rid }: Props) {
    return (
        <>
            <App.Header>
                <App.Header.Icon glyph={dataConnectionApp.glyph} />
                <App.Header.Rows>
                    <ResourceBreadcrumbs rid={rid} />
                </App.Header.Rows>
            </App.Header>

            <App.Content>
                <div className='p-6'>
                    <SourcePanel rid={rid} />
                </div>
            </App.Content>
        </>
    )
}
