import { useId } from 'react'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Select } from '@quarry/standard-ui/foundations/select'
import { FieldInput } from './SchemaFields/FieldInput'
import { defaults, findDiscriminator, selectedVariant } from './SchemaFields/schema'
import type { Schema, Values } from './SchemaFields/types'

export { defaults } from './SchemaFields/schema'
export type { Schema, Values } from './SchemaFields/types'

interface Props {
    schema:   Schema
    value:    Values
    onChange: (value: Values) => void
}

export function SchemaFields({ schema, value, onChange }: Props) {
    const id = useId()

    const variants = schema.oneOf ?? schema.anyOf
    const discriminator = variants ? findDiscriminator(variants) : undefined

    const updateField = (name: string, fieldValue: unknown) => {
        const nextValues = { ...value }

        if (fieldValue === undefined)
            delete nextValues[name]
        else
            nextValues[name] = fieldValue

        onChange(nextValues)
    }

    if (variants?.length && discriminator) {
        const selected = selectedVariant(variants, discriminator, value)

        const options = variants.map((variant, index) => {
            const field = variant.properties?.[discriminator]

            return {
                value: String(index),
                label: variant.title ?? field?.title ?? String(field?.const),
            }
        })

        function selectVariant(value: string) {
            const variant = variants?.[Number(value)]

            if (variant)
                onChange(defaults(variant))
        }

        return (
            <>
                <Field.Root>
                    <Field.Label htmlFor={id}>Copy from</Field.Label>
                    <Select.Root
                        value={String(selected)}
                        onValueChange={selectVariant}
                    >
                        <Select.Trigger id={id} size='default'>
                            <Select.Value />
                        </Select.Trigger>
                        <Select.Content className='z-[100]'>
                            {options.map(option => (
                                <Select.Item key={option.value} value={option.value}>{option.label}</Select.Item>
                            ))}
                        </Select.Content>
                    </Select.Root>
                </Field.Root>

                <SchemaFields
                    schema={variants[selected]}
                    value={value}
                    onChange={onChange}
                />
            </>
        )
    }

    return (
        <>
            {Object.entries(schema.properties ?? {}).map(([name, field]) => {
                if (field.const !== undefined)
                    return null

                return (
                    <FieldInput
                        key={name}
                        name={name}
                        definition={field}
                        required={schema.required?.includes(name) ?? false}
                        value={value[name]}
                        onChange={fieldValue => updateField(name, fieldValue)}
                    />
                )
            })}
        </>
    )
}
