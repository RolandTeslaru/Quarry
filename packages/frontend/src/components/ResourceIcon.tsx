import type { ReactNode } from 'react'
import { Library } from '@quarry/shared/domain'
import { CodeWorkspaceFrontIllustration, CodeWorkspaceIllustration, FolderFlatIllustration, FolderFrontIllustration, FolderIllustration, Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { App } from '@/AppKit'
import { codeWorkspaceFlatGlyph } from '@/apps/code-workspaces/definition'
import { resourceGlyph } from '@/shell/apps'
import { resourceIcon } from './ResourceLink'

/** xs: inline — rows, links, the tree, pickers. sm: a little larger — dialog headers, recents. lg: cards. */
export type ResourceIconSize = 'xs' | 'sm' | 'lg'

const PIXELS: Record<ResourceIconSize, number> = { xs: 16, sm: 20, lg: 64 }

type Mark = (pixels: number, className: string) => ReactNode

/**
 * A type's own marks, by size, where it has them (Typology's icons). At a size
 * it doesn't list it shows its app's glyph.
 */
const MARKS: Partial<Record<Library.Resource.Type, Partial<Record<ResourceIconSize, Mark>>>> = {
    // Flat `</>` inline; the brick from the front, then isometric (also the app's own glyph).
    workspace: {
        xs: (pixels, className) => <App.Glyph glyph={codeWorkspaceFlatGlyph} size={pixels} bare className={className} />,
        sm: (pixels, className) => <CodeWorkspaceFrontIllustration className={className} style={{ width: pixels, height: pixels }} />,
        lg: (pixels, className) => <CodeWorkspaceIllustration className={className} style={{ width: pixels, height: pixels }} />,
    },
}

/** Projects and folders: flat inline, simpler small, shaded large (Typology's icons). */
const FOLDER_MARKS: Record<ResourceIconSize, Mark> = {
    xs: (pixels, className) => <FolderFlatIllustration className={className} style={{ width: pixels, height: pixels }} />,
    sm: (pixels, className) => <FolderFrontIllustration className={className} style={{ width: pixels, height: pixels }} />,
    lg: (pixels, className) => <FolderIllustration className={className} style={{ width: pixels, height: pixels }} />,
}

interface Props {
    type:       Library.Resource.Type
    size?:      ResourceIconSize
    className?: string
}

/**
 * A resource's mark, the same everywhere it's shown (rows, links, recents, the
 * tree, pickers, cards): a project or folder is the folder, by size; a type
 * with its own mark at this size shows it (Code Workspaces: `</>`, then the
 * brick from the front, then isometric); anything else is the glyph of the app
 * that opens it — same icon, same colours as the app.
 */
export function ResourceIcon({ type, size = 'xs', className }: Props) {
    const pixels = PIXELS[size]

    if (Library.Resource.CONTAINERS.includes(type))
        return FOLDER_MARKS[size](pixels, cn('shrink-0', className))

    const mark = MARKS[type]?.[size]

    if (mark)
        return mark(pixels, cn('shrink-0', className))

    const glyph = resourceGlyph(type)

    if (glyph)
        return <App.Glyph glyph={glyph} size={pixels} bare className={cn('shrink-0', className)} />

    return <Icon name={resourceIcon(type)} size={pixels} className={cn('shrink-0 text-muted-foreground', className)} />
}
