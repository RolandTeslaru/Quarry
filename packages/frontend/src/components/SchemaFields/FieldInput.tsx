import { useId } from 'react'
import { Checkbox } from '@quarry/standard-ui/foundations/checkbox'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Textarea } from '@quarry/standard-ui/foundations/textarea'
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
    const descriptionId = definition.description ? `${id}-description` : undefined
    const label = definition.title ?? name

    if (definition.type === 'boolean') {
        return (
            <Field.Root orientation='horizontal'>
                <Checkbox
                    id={id}
                    checked={Boolean(value ?? definition.default ?? false)}
                    onCheckedChange={checked => onChange(checked === true)}
                    aria-describedby={descriptionId}
                />
                <Field.Content>
                    <Field.Label htmlFor={id}>{label}</Field.Label>
                    {definition.description && (
                        <Field.Description id={descriptionId}>{definition.description}</Field.Description>
                    )}
                </Field.Content>
            </Field.Root>
        )
    }

    return (
        <Field.Root>
            <Field.Label htmlFor={id}>
                {label}
                {required && <span className='text-muted-foreground font-normal'>(required)</span>}
            </Field.Label>
            <FieldControl
                id={id}
                descriptionId={descriptionId}
                name={name}
                definition={definition}
                required={required}
                value={value}
                onChange={onChange}
            />
            {definition.description && (
                <Field.Description id={descriptionId}>{definition.description}</Field.Description>
            )}
        </Field.Root>
    )
}

interface ControlProps extends Props {
    id: string
    descriptionId?: string
}

function FieldControl({ id, descriptionId, name, definition, required, value, onChange }: ControlProps) {
    if (definition.enum) {
        return (
            <Select.Root
                value={String(value ?? definition.default ?? definition.enum[0])}
                onValueChange={onChange}
                required={required}
            >
                <Select.Trigger id={id} size='default' aria-describedby={descriptionId}>
                    <Select.Value />
                </Select.Trigger>
                <Select.Content className='z-[100]'>
                    {definition.enum.map(option => (
                        <Select.Item key={String(option)} value={String(option)}>{String(option)}</Select.Item>
                    ))}
                </Select.Content>
            </Select.Root>
        )
    }

    if (name === 'sql') {
        return (
            <Textarea
                id={id}
                aria-describedby={descriptionId}
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

    function handleChange(text: string) {
        if (text === '') {
            onChange(undefined)

            return
        }

        onChange(isNumber ? Number(text) : text)
    }

    return (
        <Input
            id={id}
            type={inputType}
            aria-describedby={descriptionId}
            autoComplete={definition.secret ? 'new-password' : 'off'}
            required={required}
            minLength={definition.minLength}
            min={definition.minimum}
            step={isNumber && definition.type === 'number' ? 'any' : undefined}
            value={String(value ?? definition.default ?? '')}
            onChange={event => handleChange(event.target.value)}
        />
    )
}
