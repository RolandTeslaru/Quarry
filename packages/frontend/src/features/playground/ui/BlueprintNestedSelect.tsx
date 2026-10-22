import { useState } from 'react'
import { Button, Menu, MenuItem, PopoverNext, PopupKind } from '@blueprintjs/core'
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
                        <MenuItem
                            key={option.label}
                            text={option.label}
                            submenuProps={{
                                className: 'nested-select-menu',
                                'aria-label': option.label,
                            }}
                        >
                            <NestedOptions
                                options={option.children}
                                selection={selection}
                                onSelect={onSelect}
                                path={optionPath}
                            />
                        </MenuItem>
                    )
                }

                const selected = selection?.value === option.value

                const handleSelect = () => {
                    onSelect({
                        value: option.value,
                        label: option.label,
                        path: optionPath,
                    })
                }

                return (
                    <MenuItem
                        key={option.value}
                        text={option.label}
                        icon={selected ? 'tick' : 'blank'}
                        role='menuitemradio'
                        aria-checked={selected}
                        active={selected}
                        disabled={option.disabled}
                        onClick={handleSelect}
                    />
                )
            })}
        </>
    )
}

export function BlueprintNestedSelect() {
    const [selection, setSelection] = useState<NestedSelectSelection | null>(null)

    return (
        <div className='demo-stack'>
            <PopoverNext
                className='blueprint-select-example'
                placement='bottom-start'
                popupKind={PopupKind.MENU}
                content={
                    <Menu className='nested-select-menu' aria-label='Datasets'>
                        <NestedOptions
                            options={nestedSelectOptions}
                            selection={selection}
                            onSelect={setSelection}
                            path={[]}
                        />
                    </Menu>
                }
            >
                <Button endIcon='double-caret-vertical' aria-label='Choose nested dataset'>
                    {selection?.label ?? 'Choose a dataset'}
                </Button>
            </PopoverNext>
            <p className='demo-note' role='status'>
                {selection?.path.join(' / ') ?? 'No dataset selected. Explore Production / Analytics / Sales.'}
            </p>
            <p className='demo-note'>Cascading selection using PopoverNext and MenuItem submenus.</p>
        </div>
    )
}
