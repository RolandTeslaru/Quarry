import { z } from "zod"
import { Dataset } from "../Dataset/Dataset"
import { ColumnSchema } from "../Catalog/ColumnSchema"
import { CodeTransform } from "../CodeTransform/CodeTransform"
import { ModuleFunctionPath } from "./ModuleFunctionPath"

/**
 * Previews: a transform as it is in a session's working copy, run on samples of
 * its inputs. Nothing is written (docs/design/transforms.md §6). What the
 * runtime's `python -m quarry.transforms.preview` prints.
 */
export namespace Preview {

    /** One output's first rows, typed as datasets are. */
    export const Output = z.object({
        columns:  z.object({ name: z.string(), type: ColumnSchema.Type }).array(),
        rows:     z.unknown().array().array(),       // one array per row, in column order, JSON-safe
        rowCount: z.number().int(),                  // all of them, not just the rows sent
    })
    export type Output = z.infer<typeof Output>

    export const Result = z.union([
        z.object({
            transform: ModuleFunctionPath.Schema,
            inputs:    z.record(z.string(), z.object({ rid: Dataset.Rid, sequence: Dataset.Sequence })),
            outputs:   z.record(z.string(), Output),
            logs:      z.string().array(),
        }),
        CodeTransform.Failure,
    ])
    export type Result = z.infer<typeof Result>
}
