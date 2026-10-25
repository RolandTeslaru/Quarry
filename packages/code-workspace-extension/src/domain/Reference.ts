import { z } from 'zod'
import { Foundations } from '@quarry/shared/domain'

/**
 * A transform's reference to a dataset, as written in its code:
 * `Input("/Sales/raw/orders")`, `Output(ref="ri.catalog.main.dataset.…")`.
 */
export namespace Reference {

    export const Kind = z.enum(['input', 'output'])
    export type  Kind = z.infer<typeof Kind>

    export const Schema = z.object({
        kind:  Kind,
        /** A library path or a RID, as written. */
        value: z.string(),
        /** Offsets of the string's contents in the document (inside the quotes). */
        start: z.number().int().nonnegative(),
        end:   z.number().int().nonnegative(),
    })
    export type Schema = z.infer<typeof Schema>

    /** `Input("…")`, `Output('…')`, `Input(ref="…")` — a string literal as the first argument. */
    const PATTERN = /\b(Input|Output)\(\s*(?:ref\s*=\s*)?(["'])((?:(?!\2)[^\\\n])*)\2/g

    /** Every reference in a file's text, in order. */
    export const findAll = (text: string): Schema[] =>
        [...text.matchAll(PATTERN)].map(match => {
            const start = (match.index ?? 0) + match[0].length - match[3].length - 1

            return {
                kind:  match[1] === 'Input' ? 'input' : 'output',
                value: match[3],
                start,
                end:   start + match[3].length,
            }
        })

    /** The reference whose string covers this offset (quotes included). */
    export const findAt = (references: Schema[], offset: number): Schema | undefined =>
        references.find(reference => offset >= reference.start - 1 && offset <= reference.end + 1)

    export const isRid = (value: string): boolean => Foundations.Rid.Any.safeParse(value).success
}
