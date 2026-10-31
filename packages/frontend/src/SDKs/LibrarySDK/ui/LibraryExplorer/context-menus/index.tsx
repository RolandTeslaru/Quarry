import { useState, type MouseEvent, type ReactNode } from 'react'
import { ContextMenu } from '@quarry/standard-ui/foundations/contextMenu'
import { Library } from '@quarry/shared/domain'
import { ResourceMenuItems } from './resource'

interface Props {
    children: ReactNode
}

/**
 * Right-click on a card (after PretzelGraph's LibraryContextMenu): one menu for
 * the whole area, aimed at the card under the pointer by its `data-library-rid`.
 */
export function LibraryContextMenu({ children }: Props) {
    const [rid, setRid] = useState<Library.Resource.Rid | null>(null)

    function aim(event: MouseEvent) {
        const element = (event.target as HTMLElement).closest<HTMLElement>('[data-library-rid]')

        // Nothing to act on between the cards: no menu at all, rather than an empty one.
        if (!element) {
            event.preventDefault()

            return
        }

        setRid(Library.Resource.Rid.parse(element.dataset.libraryRid))
    }

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger asChild onContextMenu={aim}>
                <div className='contents'>
                    {children}
                </div>
            </ContextMenu.Trigger>
            <ContextMenu.Content className='w-48'>
                {rid && <ResourceMenuItems rid={rid} />}
            </ContextMenu.Content>
        </ContextMenu.Root>
    )
}
