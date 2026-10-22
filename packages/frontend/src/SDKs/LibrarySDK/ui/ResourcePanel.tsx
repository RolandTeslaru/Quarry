import { Link } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Catalog, DataConnection, Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../sdk'
import { FolderPanel } from './FolderPanel'
import { SourcePanel } from '@/SDKs/DataConnectionSDK/ui/SourcePanel'
import { DatasetPanel } from '@/SDKs/CatalogSDK/ui/DatasetPanel'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'

interface Props {
    rid: Library.Resource.Rid
}

export function ResourcePanel({ rid }: Props) {
    const [path, [pathRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, rid),
        query => [query.path(rid)],
    )

    const resource = path.at(-1)

    if (pathRequest.isPending)
        return <Spinner className='size-6' role='status' aria-label='Loading' />

    if (pathRequest.isError || !resource) {
        return (
            <div>
                <ErrorNotice error={pathRequest.error ?? 'Resource not found'} />
                <Button onClick={() => void pathRequest.refetch()}>Try again</Button>
            </div>
        )
    }

    return (
        <>
            <nav className='breadcrumbs' aria-label='Resource path'>
                <Link to='/library'>Projects</Link>

                {path.map(item => (
                    <span key={item.rid} className='flex items-center gap-2'>
                        <span>/</span>
                        <ResourceLink resource={item} />
                    </span>
                ))}
            </nav>

            {(resource.type === 'project' || resource.type === 'folder') && (
                <FolderPanel resource={resource} />
            )}

            {resource.type === 'source' && (
                <SourcePanel rid={DataConnection.Source.Rid.parse(rid)} />
            )}

            {resource.type === 'dataset' && (
                <DatasetPanel rid={Catalog.Dataset.Rid.parse(rid)} />
            )}

            {resource.type === 'credential' && (
                <Link to='/keychain'>Manage this credential in Keychain</Link>
            )}
        </>
    )
}
