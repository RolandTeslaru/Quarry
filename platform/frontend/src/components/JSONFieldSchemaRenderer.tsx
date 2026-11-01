import { useId } from 'react'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Select } from '@quarry/standard-ui/foundations/select'
import { FieldInput } from './JSONFieldSchemaRenderer/FieldInput'
import { defaults, findDiscriminator, selectedVariant } from './JSONFieldSchemaRenderer/schema'
import type { Schema, Values } from './JSONFieldSchemaRenderer/types'

export { defaults } from './JSONFieldSchemaRenderer/schema'
export type { Schema, Values } from './JSONFieldSchemaRenderer/types'

interface Props {
    schema:   Schema
    value:    Values
    onChange: (value: Values) => void
}

/**
 * Form fields drawn from a JSON Schema — the standard, plain-data description of
 * a JSON object. Integrations define their fields in zod; the server sends them
 * as JSON Schema (`z.toJSONSchema`), since zod can't cross the network: a source
 * type's config, a sync's config, a credential's fields. One input per property
 * (text, number, checkbox, select, masked for `secret`), and a choice between
 * variants for `oneOf` / `anyOf`.
 */
export function JSONFieldSchemaRenderer({ schema, value, onChange }: Props) {
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
                        <Select.Content>
                            {options.map(option => (
                                <Select.Item key={option.value} value={option.value}>{option.label}</Select.Item>
                            ))}
                        </Select.Content>
                    </Select.Root>
                </Field.Root>

                <JSONFieldSchemaRenderer
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
