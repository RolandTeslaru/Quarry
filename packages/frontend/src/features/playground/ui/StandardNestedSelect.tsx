import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { DropdownMenu } from '@quarry/standard-ui/foundations/dropdownMenu'
import {
    nestedSelectOptions,
    type NestedSelectOptionsProps,
    type NestedSelectSelection,
} from '../nested-select-options'

function NestedOptions({ options, selection, onSelect, path }: NestedSelectOptionsProps) {
    return (
        <>
            {options.map(option => {
                const optionPath = [...path, option.label]

                if (option.kind === 'branch') {
                    return (
                        <DropdownMenu.Sub key={option.label}>
                            <DropdownMenu.SubTrigger>{option.label}</DropdownMenu.SubTrigger>
                            <DropdownMenu.SubContent className='nested-select-menu'>
                                <NestedOptions
                                    options={option.children}
                                    selection={selection}
                                    onSelect={onSelect}
                                    path={optionPath}
                                />
                            </DropdownMenu.SubContent>
                        </DropdownMenu.Sub>
                    )
                }

                const handleSelect = () => {
                    onSelect({
                        value: option.value,
                        label: option.label,
                        path: optionPath,
                    })
                }

                return (
                    <DropdownMenu.RadioItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                        onSelect={handleSelect}
                    >
                        {option.label}
                    </DropdownMenu.RadioItem>
                )
            })}
        </>
    )
}

export function StandardNestedSelect() {
    const [selection, setSelection] = useState<NestedSelectSelection | null>(null)

    return (
        <div className='demo-stack'>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <Button className='w-fit' endIcon='ChevronDown' aria-label='Choose nested dataset'>
                        {selection?.label ?? 'Choose a dataset'}
                    </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align='start' className='nested-select-menu'>
                    <DropdownMenu.RadioGroup value={selection?.value ?? ''}>
                        <NestedOptions
                            options={nestedSelectOptions}
                            selection={selection}
                            onSelect={setSelection}
                            path={[]}
                        />
                    </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
            <p className='demo-note' role='status'>
                {selection?.path.join(' / ') ?? 'No dataset selected. Explore Production / Analytics / Sales.'}
            </p>
            <p className='demo-note'>Cascading selection using DropdownMenu submenus.</p>
        </div>
    )
}
