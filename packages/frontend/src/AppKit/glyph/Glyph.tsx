import { useMemo, type ComponentType, type CSSProperties } from 'react'
import svgpath from 'svgpath'
import { CodeWorkspaceIllustration, DataConnectionIllustration, FolderIllustration, useIconPaths, type IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'

/**
 * An app's coloured mark on a tinted tile — one of two kinds:
 *
 *   icon          a Blueprint icon drawn whole in `base` (holes included, as
 *                 Blueprint draws it), then any of its parts — the sub-paths of
 *                 its path, numbered in order — painted over in their own colour
 *   illustration  a shaded standard-ui illustration in its own colours — the
 *                 folder, the code workspace brick, the data connection stack
 *
 * Classes are Tailwind palette utilities (`fill-sky-600`, `bg-sky-500/15`).
 */
export type GlyphDefinition =
    | {
        icon:   IconName
        tile:   string
        base:   string
        parts?: Partial<Record<number, string>>
    }
    | {
        illustration: keyof typeof ILLUSTRATIONS
        tile:         string
        /** How much of the tile it fills (default 0.6, as icons) — more for a mark drawn edge to edge. */
        share?:       number
    }

const ILLUSTRATIONS: Record<'folder' | 'codeWorkspace' | 'dataConnection', ComponentType<{ style?: CSSProperties }>> = {
    folder:         FolderIllustration,
    codeWorkspace:  CodeWorkspaceIllustration,
    dataConnection: DataConnectionIllustration,
}

interface Props {
    glyph:      GlyphDefinition
    /** Tile size in px; the icon takes 60% of it. Bare: the icon's size. */
    size?:      number
    /** Only the coloured icon, for a container that is the tile itself (the header's corner square). */
    bare?:      boolean
    className?: string
}

const ICON_SHARE = 0.6

export function Glyph({ glyph, size = 28, bare = false, className }: Props) {
    const share = 'illustration' in glyph ? glyph.share ?? ICON_SHARE : ICON_SHARE
    const markSize = bare ? size : Math.round(size * share)

    const mark = 'illustration' in glyph
        ? <GlyphIllustration glyph={glyph} size={markSize} />
        : <GlyphIcon glyph={glyph} size={markSize} />

    if (bare)
        return <span aria-hidden className={cn('inline-grid shrink-0 place-items-center', className)}>{mark}</span>

    return (
        <span
            aria-hidden
            className={cn('inline-grid shrink-0 place-items-center rounded-[22%]', glyph.tile, className)}
            style={{ width: size, height: size }}
        >
            {mark}
        </span>
    )
}

type IllustrationGlyph = Extract<GlyphDefinition, { illustration: string }>
type IconGlyph = Exclude<GlyphDefinition, IllustrationGlyph>

interface GlyphIllustrationProps {
    glyph: IllustrationGlyph
    size:  number
}

function GlyphIllustration({ glyph, size }: GlyphIllustrationProps) {
    const Illustration = ILLUSTRATIONS[glyph.illustration]

    return <Illustration style={{ width: size, height: size }} />
}

interface GlyphIconProps {
    glyph: IconGlyph
    size:  number
}

/** The icon drawn whole in the base colour, then its chosen parts over it. */
function GlyphIcon({ glyph, size }: GlyphIconProps) {
    const { paths } = useIconPaths(glyph.icon, 20)

    const path = paths?.join(' ')
    const parts = useMemo(() => (path ? splitParts(path) : []), [path])

    if (!path)
        return null

    return (
        <svg viewBox='0 0 20 20' width={size} height={size}>
            <path d={path} fillRule='evenodd' className={glyph.base} />

            {Object.entries(glyph.parts ?? {}).map(([index, partClass]) => {
                const part = parts[Number(index)]

                if (!part)
                    return null

                return <path key={index} d={part} className={partClass} />
            })}
        </svg>
    )
}

/** A path's sub-paths, each self-contained: made absolute first, so a relative `m` still lands right. */
function splitParts(path: string): string[] {
    return svgpath(path).abs().toString().split(/(?=M)/)
}
