import { Button } from '@quarry/standard-ui/foundations/button'
import { DropdownMenu } from '@quarry/standard-ui/foundations/dropdownMenu'
import { FolderIllustration } from '@quarry/standard-ui/icons'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../../../sdk'
import { App } from '@/AppKit'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { DataConnectionSDK } from '@/SDKs/DataConnectionSDK/sdk'
import { resourceGlyph } from '@/shell/apps'
import { useLibraryExplorer } from '../root'

/**
 * "+ New" for the open folder: a folder, a dataset (from a file), a source — or,
 * at the top, a project (workspace admins only). Each opens its SDK's dialog.
 */
export function CreateBtn() {
    const { cwd } = useLibraryExplorer()
    const isAdmin = AuthSDK.useStore(state => state.user?.workspaceRole === 'admin')

    if (cwd === null) {
        return (
            <Button
                intent='success'
                icon='add'
                disabled={!isAdmin}
                onClick={() => LibrarySDK.dialogs.openCreateProject()}
            >
                New project
            </Button>
        )
    }

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <Button intent='success' icon='add' endIcon='caret-down'>New</Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align='end'>
                <DropdownMenu.Item onSelect={() => LibrarySDK.dialogs.openCreateFolder({ parentRid: cwd })}>
                    <FolderIllustration color='var(--color-amber-400)' className='size-4' />
                    Folder
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={() => CatalogSDK.dialogs.openCreateDatasetFromFile({ parentRid: cwd })}>
                    <TypeGlyph type='dataset' />
                    Dataset
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => DataConnectionSDK.dialogs.openCreateSource({ parentRid: cwd })}>
                    <TypeGlyph type='source' />
                    Source
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    )
}

interface TypeGlyphProps {
    type: Library.Resource.Type
}

/** A resource type's mark as in the item view — its app's glyph, bare — at menu size. */
function TypeGlyph({ type }: TypeGlyphProps) {
    const glyph = resourceGlyph(type)

    if (!glyph)
        return null

    return <App.Glyph glyph={glyph} size={16} bare />
}
