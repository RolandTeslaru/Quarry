import { Library } from '@quarry/shared/domain'
import { FolderIllustration, Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { App } from '@/AppKit'
import { resourceGlyph } from '@/shell/apps'
import { resourceIcon } from './ResourceLink'

interface Props {
    type:       Library.Resource.Type
    /** Its square, in pixels. */
    size?:      number
    className?: string
}

/**
 * A resource's mark, the same everywhere it's shown (rows, links, recents, the
 * tree, pickers): a project or folder is the folder illustration; anything else
 * is the glyph of the app that opens it — same icon, same colours as the app.
 */
export function ResourceIcon({ type, size = 16, className }: Props) {
    if (Library.Resource.CONTAINERS.includes(type))
        return <FolderIllustration color='var(--color-amber-400)' className={cn('shrink-0', className)} style={{ width: size, height: size }} />

    const glyph = resourceGlyph(type)

    if (glyph)
        return <App.Glyph glyph={glyph} size={size} bare className={cn('shrink-0', className)} />

    return <Icon name={resourceIcon(type)} size={size} className={cn('shrink-0 text-muted-foreground', className)} />
}
