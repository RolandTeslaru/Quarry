import { useId } from 'react'
import { Checkbox, FormGroup, HTMLSelect, InputGroup, TextArea } from '@blueprintjs/core'
import type { Schema } from './types'

interface Props {
    name:       string
    definition: Schema
    required:   boolean
    value:      unknown
    onChange:   (value: unknown) => void
}

export function FieldInput({ name, definition, required, value, onChange }: Props) {
    const id = useId()
    const label = definition.title ?? name

    if (definition.type === 'boolean') {
        return (
            <Checkbox
                id={id}
                label={label}
                checked={Boolean(value ?? definition.default ?? false)}
                onChange={event => onChange(event.currentTarget.checked)}
            />
        )
    }

    return (
        <FormGroup
            label={label}
            labelFor={id}
            labelInfo={required ? '(required)' : undefined}
            helperText={definition.description}
        >
            <FieldControl
                id={id}
                name={name}
                definition={definition}
                required={required}
                value={value}
                onChange={onChange}
            />
        </FormGroup>
    )
}

interface ControlProps extends Props {
    id: string
}

function FieldControl({ id, name, definition, required, value, onChange }: ControlProps) {
    if (definition.enum) {
        return (
            <HTMLSelect
                id={id}
                fill
                value={String(value ?? definition.default ?? definition.enum[0])}
                options={definition.enum.map(String)}
                onChange={event => onChange(event.target.value)}
            />
        )
    }

    if (name === 'sql') {
        return (
            <TextArea
                id={id}
                fill
                rows={5}
                className='font-mono'
                required={required}
                value={String(value ?? '')}
                placeholder='SELECT * FROM public.my_table'
                onChange={event => onChange(event.target.value || undefined)}
            />
        )
    }

    const isNumber = definition.type === 'number' || definition.type === 'integer'
    let inputType = 'text'

    if (definition.secret)
        inputType = 'password'
    else if (isNumber)
        inputType = 'number'

    const handleChange = (text: string) => {
        if (text === '') {
            onChange(undefined)

            return
        }

        onChange(isNumber ? Number(text) : text)
    }

    return (
        <InputGroup
            id={id}
            type={inputType}
            autoComplete={definition.secret ? 'new-password' : 'off'}
            required={required}
            minLength={definition.minLength}
            min={definition.minimum}
            value={String(value ?? definition.default ?? '')}
            onChange={event => handleChange(event.target.value)}
        />
    )
}
