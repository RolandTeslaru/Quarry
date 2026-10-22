import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { ErrorNotice } from '../ErrorNotice'

interface Props {
    rid:      Library.Resource.Rid
    onChange: (rid: Library.Resource.Rid) => void
}

export function FolderChoices({ rid, onChange }: Props) {
    const [isBrowsing, setIsBrowsing] = useState(false)

    const [path, [pathRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, rid),
        query => [query.path(rid)],
    )

    const [folders, [foldersRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.folders(state, rid),
        query => [{ ...query.children(rid), enabled: isBrowsing }],
    )

    const parentRid = LibrarySDK.useStore(state => state.resources[rid]?.parentRid)
    const resourceType = LibrarySDK.useStore(state => state.resources[rid]?.type)

    const locationName = path.map(resource => resource.name).join(' / ')
    const canGoUp = resourceType === 'folder' && parentRid !== null && parentRid !== undefined

    const openParent = () => {
        if (parentRid)
            onChange(parentRid)
    }

    return (
        <div className='location-choice'>
            <div className='flex items-center gap-2'>
                <span className='flex-1 text-xs'>
                    {locationName || rid}
                </span>

                <Button
                    size='sm'
                    variant='minimal'
                    icon='folder-open'
                    onClick={() => setIsBrowsing(current => !current)}
                >
                    Browse
                </Button>
            </div>

            <ErrorNotice error={pathRequest.error} />

            {isBrowsing && (
                <div className='flex flex-col items-start gap-1 mt-2'>
                    {canGoUp && (
                        <Button
                            size='sm'
                            icon='arrow-up'
                            variant='minimal'
                            onClick={openParent}
                        >
                            Parent folder
                        </Button>
                    )}

                    {foldersRequest.isPending && (
                        <Spinner className='size-4' role='status' aria-label='Loading' />
                    )}

                    {folders.map(folder => (
                        <Button
                            key={folder.rid}
                            size='sm'
                            icon='folder-close'
                            variant='minimal'
                            onClick={() => onChange(folder.rid)}
                        >
                            {folder.name}
                        </Button>
                    ))}

                    {foldersRequest.isSuccess && folders.length === 0 && (
                        <span className='text-xs text-slate-500'>
                            No subfolders
                        </span>
                    )}

                    <ErrorNotice error={foldersRequest.error} />
                </div>
            )}
        </div>
    )
}
