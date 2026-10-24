import { useState } from 'react'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../sdk'
import { LibraryExplorer, type Cwd } from '../ui/LibraryExplorer'

const LIBRARY_SELECTOR_DIALOG_ID = 'library-selector'

export namespace LibrarySelector {

    /** What may be chosen: resource types, or anything. */
    export type Accept = Library.Resource.Type | 'any'

    export interface Options {
        /** One type, or several; everything else in the explorer is disabled. Projects and folders still open. */
        accept:      Accept | readonly Accept[]
        /** The folder it opens in; by default, the projects. */
        initialCwd?: Library.Resource.Rid
        onSelect:    (resource: Library.Resource.Base) => void
    }
}

const NOUNS: Record<Library.Resource.Type, string> = {
    'project':        'a project',
    'folder':         'a folder',
    'dataset':        'a dataset',
    'source':         'a source',
    'credential':     'a credential',
    'workspace':      'a code workspace',
}

const titleOf = (accept: readonly LibrarySelector.Accept[]) =>
    accept.length === 1 && accept[0] !== 'any' ? `Select ${NOUNS[accept[0]]}` : 'Select an item'

/**
 * Choose a resource from the Library — the explorer's tree and folder view in
 * a dialog (after PretzelGraph's LibrarySelector). Projects and folders open
 * as you click them; an accepted container is chosen with "Select '<name>'",
 * anything else by clicking it.
 *
 *   LibrarySDK.dialogs.openLibrarySelector({ accept: 'folder', onSelect: folder => … })
 */
export function openLibrarySelectorDialog(options: LibrarySelector.Options) {
    const accept = Array.isArray(options.accept) ? options.accept : [options.accept as LibrarySelector.Accept]

    DialogSDK.actions.push(LIBRARY_SELECTOR_DIALOG_ID, dialog => (
        <LibrarySelectorDialog
            dialog={dialog}
            accept={accept}
            initialCwd={options.initialCwd ?? null}
            onSelect={options.onSelect}
        />
    ))
}

interface Props {
    dialog:     DialogSDK.TemplateProps
    accept:     readonly LibrarySelector.Accept[]
    initialCwd: Cwd
    onSelect:   (resource: Library.Resource.Base) => void
}

function LibrarySelectorDialog({ dialog, accept, initialCwd, onSelect }: Props) {
    const [cwd, setCwd] = useState<Cwd>(initialCwd)

    const current = LibrarySDK.useStore(state => (cwd ? state.resources[cwd] : undefined))

    const accepts = (type: Library.Resource.Type) => accept.includes(type) || accept.includes('any')

    function select(resource: Library.Resource.Base) {
        onSelect(resource)
        DialogSDK.actions.pop(LIBRARY_SELECTOR_DIALOG_ID)
    }

    // Containers always open — the way to what's inside; only what may be chosen is enabled otherwise.
    const isItemDisabled = (resource: Library.Resource.Base) =>
        !Library.Resource.CONTAINERS.includes(resource.type) && !accepts(resource.type)

    return (
        <LibraryExplorer.Root cwd={cwd} setCwd={setCwd} onItemClick={select} isItemDisabled={isItemDisabled}>
            <DialogSDK.SplitTemplate
                {...dialog}
                // Columns unpadded: each scrolls edge to edge, its padding inside — so scrollbars sit at the edge.
                className='h-[min(600px,calc(100vh-64px))]'
                sidebarClassName='flex w-64 shrink-0 flex-col gap-0 p-0'
                contentClassName='flex w-[520px] shrink-0 flex-col gap-0 p-0'
                sidebarRenderer={() => (
                    <>
                        {/* Just the input: Tree.Header is the app sidebar's opaque band, not this translucent one. */}
                        <div className='shrink-0 px-3 pt-4 pb-2'>
                            <LibraryExplorer.Tree.SearchInput />
                        </div>
                        <div className='min-h-0 flex-1 overflow-y-auto'>
                            <LibraryExplorer.Tree className='px-2 pb-3' />
                        </div>
                    </>
                )}
            >
                <div className='flex shrink-0 flex-col gap-2 px-4 pt-4 pb-3'>
                    <div className='flex items-center gap-2'>
                        <Dialog.Title className='text-sm'>{titleOf(accept)}</Dialog.Title>
                        <LibraryExplorer.View.SearchInput className='ml-auto w-48' />
                        <LibraryExplorer.View.CreateBtn />
                    </div>
                    <Dialog.Description className='sr-only'>
                        Open projects and folders to find what you need, then choose it.
                    </Dialog.Description>
                    <LibraryExplorer.View.Breadcrumbs size='sm' />
                </div>

                <div className='min-h-0 flex-1 overflow-y-auto'>
                    <LibraryExplorer.View className='px-4 pb-4' />
                </div>

                <Dialog.Footer className='border-t px-4 py-3'>
                    <Dialog.Cancel>Cancel</Dialog.Cancel>
                    {current && accepts(current.type) && (
                        <Dialog.Action intent='primary' icon='folder-open' onClick={() => select(current)}>
                            Select “{current.name}”
                        </Dialog.Action>
                    )}
                </Dialog.Footer>
            </DialogSDK.SplitTemplate>
        </LibraryExplorer.Root>
    )
}
