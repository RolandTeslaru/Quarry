import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import { Breadcrumb } from '@quarry/standard-ui/foundations/breadcrumb'
import type { Library } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { resourceRoute } from '@/shell/apps'

interface Props {
    rid: Library.Resource.Rid
}

/** An app header's breadcrumbs for a library resource: its folders, then its name as the title. */
export function ResourceBreadcrumbs({ rid }: Props) {
    const [path, [pathRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, rid),
        query => [query.path(rid)],
    )

    const resource = path.at(-1)
    const ancestors = path.slice(0, -1)

    return (
        <App.Header.Breadcrumbs>
            {ancestors.map(ancestor => (
                <Fragment key={ancestor.rid}>
                    <Breadcrumb.Item>
                        <Breadcrumb.Link asChild>
                            <Link {...resourceRoute(ancestor.type, ancestor.rid)}>{ancestor.name}</Link>
                        </Breadcrumb.Link>
                    </Breadcrumb.Item>
                    <Breadcrumb.Separator />
                </Fragment>
            ))}

            <Breadcrumb.Item>
                <App.Header.Title>
                    {resource?.name ?? (pathRequest.isPending ? 'Loading…' : 'Not found')}
                </App.Header.Title>
            </Breadcrumb.Item>
        </App.Header.Breadcrumbs>
    )
}
