import { Icon, isIconName, type IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import type { Ontology } from '@quarry/shared/domain'

/** The icons an object type can take: things, places, people, documents. */
export const OBJECT_TYPE_ICONS: readonly IconName[] = [
    'cube', 'box', 'person', 'people', 'office', 'home', 'shop', 'globe',
    'map-marker', 'airplane', 'truck', 'train', 'drive-time', 'route', 'satellite', 'oil-field',
    'document', 'clipboard', 'envelope', 'phone', 'id-number', 'credit-card', 'bank-account', 'dollar',
    'calendar', 'flag', 'tag', 'key', 'shield', 'warning-sign', 'lightning', 'wrench',
    'cog', 'database', 'lab-test', 'heart', 'star', 'tree', 'bug', 'link',
]

/**
 * The colours an object type can take, as whole class names so Tailwind generates them: the icon's
 * colour, and the tile behind it.
 */
export const OBJECT_TYPE_COLORS: Record<string, { text: string; tile: string }> = {
    blue:    { text: 'text-blue-600', tile: 'bg-blue-500/15' },
    sky:     { text: 'text-sky-600', tile: 'bg-sky-500/15' },
    cyan:    { text: 'text-cyan-600', tile: 'bg-cyan-500/15' },
    teal:    { text: 'text-teal-600', tile: 'bg-teal-500/15' },
    emerald: { text: 'text-emerald-600', tile: 'bg-emerald-500/15' },
    lime:    { text: 'text-lime-600', tile: 'bg-lime-500/15' },
    amber:   { text: 'text-amber-600', tile: 'bg-amber-500/15' },
    orange:  { text: 'text-orange-600', tile: 'bg-orange-500/15' },
    red:     { text: 'text-red-600', tile: 'bg-red-500/15' },
    rose:    { text: 'text-rose-600', tile: 'bg-rose-500/15' },
    violet:  { text: 'text-violet-600', tile: 'bg-violet-500/15' },
    indigo:  { text: 'text-indigo-600', tile: 'bg-indigo-500/15' },
    slate:   { text: 'text-slate-600', tile: 'bg-slate-500/15' },
}

export const DEFAULT_OBJECT_TYPE_UI: Ontology.ObjectType.Ui = {
    icon:  'cube',
    color: 'blue',
}

interface ObjectTypeIconProps {
    ui:         Ontology.ObjectType.Ui
    size?:      number
    /** On a tile of its colour, as in a picker or a header. */
    tile?:      boolean
    className?: string
}

/** An object type's icon in its colour. Saved by name, so one this app doesn't know shows as the default. */
export function ObjectTypeIcon({ ui, size = 16, tile = false, className }: ObjectTypeIconProps) {
    const name: IconName = isIconName(ui.icon) ? ui.icon : 'cube'
    const color = OBJECT_TYPE_COLORS[ui.color] ?? OBJECT_TYPE_COLORS[DEFAULT_OBJECT_TYPE_UI.color]

    return (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center',
                color.text,
                tile && cn('size-8 rounded-md', color.tile),
                className,
            )}
        >
            <Icon name={name} size={size} />
        </span>
    )
}
