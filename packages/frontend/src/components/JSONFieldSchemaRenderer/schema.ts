import type { Schema, Values } from './types'

export function defaults(schema: Schema): Values {
    const variants = schema.oneOf ?? schema.anyOf
    const selectedSchema = variants?.[0] ?? schema
    const properties = selectedSchema.properties ?? {}

    const values: Values = {}

    for (const [name, field] of Object.entries(properties)) {
        const value = field.const ?? field.default

        if (value !== undefined)
            values[name] = value
    }

    return values
}

export function findDiscriminator(variants: Schema[]): string | undefined {
    const properties = variants[0]?.properties ?? {}

    return Object.keys(properties).find(name =>
        variants.every(variant => variant.properties?.[name]?.const !== undefined),
    )
}

export function selectedVariant(variants: Schema[], discriminator: string, values: Values): number {
    const index = variants.findIndex(variant =>
        variant.properties?.[discriminator]?.const === values[discriminator],
    )

    return Math.max(0, index)
}
