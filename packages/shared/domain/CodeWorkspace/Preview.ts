import { z } from "zod"
import { Dataset } from "../Catalog/Dataset"
import { ColumnSchema } from "../Catalog/ColumnSchema"

/**
 * Previews: a transform as it is in a session's working copy, run on samples of
 * its inputs. Nothing is written (docs/design/transforms.md §6). What the
 * runtime's `python -m quarry.transforms.preview` prints.
 */
export namespace Preview {

    /** A transform the workspace's pipeline declares — inputs and outputs by parameter name, as written (paths or RIDs). */
    export const Transform = z.object({
        name:    z.string(),                         // module.function — what a preview names
        inputs:  z.record(z.string(), z.string()),
        outputs: z.record(z.string(), z.string()),
    })
    export type Transform = z.infer<typeof Transform>

    /** One output's first rows, typed as datasets are. */
    export const Output = z.object({
        columns:  z.object({ name: z.string(), type: ColumnSchema.Type }).array(),
        rows:     z.unknown().array().array(),       // one array per row, in column order, JSON-safe
        rowCount: z.number().int(),                  // all of them, not just the rows sent
    })
    export type Output = z.infer<typeof Output>

    /** Code that raised — importing the pipeline, or the transform itself — is an answer, not a failed request. */
    export const Failure = z.object({
        error: z.object({ message: z.string(), traceback: z.string() }),
    })
    export type Failure = z.infer<typeof Failure>

    /** What the working copy's pipeline declares, or why it couldn't be read. */
    export const Listing = z.union([
        z.object({ transforms: Transform.array() }),
        Failure,
    ])
    export type Listing = z.infer<typeof Listing>

    export const Result = z.union([
        z.object({
            transform: z.string(),
            inputs:    z.record(z.string(), z.object({ rid: Dataset.Rid, sequence: z.number().int() })),
            outputs:   z.record(z.string(), Output),
            logs:      z.string().array(),
        }),
        Failure,
    ])
    export type Result = z.infer<typeof Result>
}
