import { Popover } from '@quarry/standard-ui/foundations/popover'
import { Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import type { Ontology } from '@quarry/shared/domain'
import { OBJECT_TYPE_COLORS, OBJECT_TYPE_ICONS, ObjectTypeIcon } from './ObjectTypeIcon'

interface Props {
    value:    Ontology.ObjectType.Ui
    onChange: (ui: Ontology.ObjectType.Ui) => void
    id?:      string
}

/** An object type's icon on its tile; clicking it opens the colours and icons to choose from. */
export function ObjectTypeUiPicker({ value, onChange, id }: Props) {
    return (
        <Popover.Root>
            <Popover.Trigger
                id={id}
                type='button'
                aria-label='Icon and colour'
                className='cursor-pointer rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
            >
                <ObjectTypeIcon ui={value} tile />
            </Popover.Trigger>

            <Popover.Content align='start' className='flex w-72 flex-col gap-3 p-3'>
                <div role='radiogroup' aria-label='Colour' className='flex flex-wrap gap-1.5'>
                    {Object.keys(OBJECT_TYPE_COLORS).map(color => (
                        <button
                            key={color}
                            type='button'
                            role='radio'
                            aria-checked={value.color === color}
                            aria-label={color}
                            onClick={() => onChange({ ...value, color })}
                            className={cn(
                                'grid size-6 cursor-pointer place-items-center rounded-full',
                                OBJECT_TYPE_COLORS[color].tile,
                                OBJECT_TYPE_COLORS[color].text,
                                value.color === color && 'ring-2 ring-current',
                            )}
                        >
                            <span className='size-2.5 rounded-full bg-current' />
                        </button>
                    ))}
                </div>

                <div role='radiogroup' aria-label='Icon' className='grid grid-cols-8 gap-1'>
                    {OBJECT_TYPE_ICONS.map(icon => (
                        <button
                            key={icon}
                            type='button'
                            role='radio'
                            aria-checked={value.icon === icon}
                            aria-label={icon}
                            onClick={() => onChange({ ...value, icon })}
                            className={cn(
                                'grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent',
                                value.icon === icon && 'bg-accent text-foreground',
                            )}
                        >
                            <Icon name={icon} size={14} />
                        </button>
                    ))}
                </div>
            </Popover.Content>
        </Popover.Root>
    )
}
