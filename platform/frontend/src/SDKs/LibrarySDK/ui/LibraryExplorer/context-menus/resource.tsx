import { useRouter } from '@tanstack/react-router'
import { ContextMenu } from '@quarry/standard-ui/foundations/contextMenu'
import { Icon } from '@quarry/standard-ui/icons'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../../../sdk'
import { resourceRoute } from '@/routes/shell.layout/components/apps'
import { useLibraryExplorer } from '../root'
import { OpenInSubMenu } from './open-in'

interface Props {
    rid: Library.Resource.Rid
}

/** What a card offers: opening it here or elsewhere, renaming or moving it, copying what names it, and trashing it. */
export function ResourceMenuItems({ rid }: Props) {
    const { setCwd, onItemClick, isItemDisabled } = useLibraryExplorer()
    const router = useRouter()

    // Asked for as the menu opens, so the path is there to copy by the time it's chosen.
    const [path] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, rid),
        query => [query.path(rid)],
    )
    const resource = LibrarySDK.useStore(state => state.resources[rid])

    if (!resource)
        return null

    const isContainer = Library.Resource.CONTAINERS.includes(resource.type)
    const canOpen = isContainer || (onItemClick && !(isItemDisabled?.(resource) ?? false))
    const url = router.buildLocation(isContainer ? { to: '/library/$rid', params: { rid } } : resourceRoute(resource.type, rid)).href
    const link = new URL(url, window.location.origin).href

    function open() {
        if (isContainer) {
            setCwd(rid)

            return
        }

        onItemClick?.(resource)
    }

    return (
        <>
            {canOpen && (
                <ContextMenu.Item icon={<Icon name='folder-open' />} onSelect={open}>
                    Open here
                </ContextMenu.Item>
            )}
            <OpenInSubMenu url={url} />
            <ContextMenu.Separator />
            <ContextMenu.Item icon={<Icon name='edit' />} onSelect={() => LibrarySDK.dialogs.openRenameResource(resource)}>
                Rename…
            </ContextMenu.Item>
            {/* A project is at the top of the tree: there's nowhere to move it. */}
            {resource.parentRid && (
                <ContextMenu.Item icon={<Icon name='arrow-right' />} onSelect={() => openMove(resource)}>
                    Move to…
                </ContextMenu.Item>
            )}
            <ContextMenu.Separator />
            <ContextMenu.Sub>
                <ContextMenu.SubTrigger icon={<Icon name='duplicate' />}>
                    Copy
                </ContextMenu.SubTrigger>
                <ContextMenu.SubContent>
                    <ContextMenu.Item icon={<Icon name='id-number' />} onSelect={() => void copy(rid, 'RID copied')}>
                        RID
                    </ContextMenu.Item>
                    <ContextMenu.Item
                        icon={<Icon name='path' />}
                        disabled={path.length === 0}
                        onSelect={() => void copy(Library.Resource.getPath(path), 'Path copied')}
                    >
                        Path
                    </ContextMenu.Item>
                    <ContextMenu.Item icon={<Icon name='link' />} onSelect={() => void copy(link, 'Link copied')}>
                        Link
                    </ContextMenu.Item>
                    <ContextMenu.Item icon={<Icon name='clipboard' />} onSelect={() => void copy(resource.name, 'Name copied')}>
                        Name
                    </ContextMenu.Item>
                </ContextMenu.SubContent>
            </ContextMenu.Sub>
            <ContextMenu.Separator />
            <ContextMenu.Item variant='destructive' icon={<Icon name='trash' />} onSelect={() => LibrarySDK.dialogs.openTrashResource(resource)}>
                Move to trash
            </ContextMenu.Item>
        </>
    )
}

function openMove(resource: Library.Resource.Base) {
    LibrarySDK.dialogs.openLibrarySelector({
        accept:     Library.Resource.CONTAINERS,
        initialCwd: resource.parentRid ?? undefined,
        onSelect:   parent => {
            if (parent.rid === resource.parentRid)
                return

            // The action reports its own failure.
            void LibrarySDK.actions.resource.move(resource, parent.rid).catch(() => {})
        },
    })
}

async function copy(text: string, message: string) {
    await navigator.clipboard.writeText(text)

    NotificationSDK.toast.success(message)
}
