import { z } from "zod"
import { Dataset } from "../Catalog/Dataset"
import { Resource } from "../Library/Resource"
import { ModuleFunctionPath } from "../CodeWorkspace/ModuleFunctionPath"

/** Logic that reads input datasets and writes output datasets (docs/design/transforms.md). */
export namespace Transform {

    export const DatasetReference = z.union([Dataset.Rid, Resource.Path])
    export type  DatasetReference = z.infer<typeof DatasetReference>

    export const Schema = z.object({
        name:    ModuleFunctionPath.Schema,
        inputs:  z.record(z.string(), DatasetReference),
        outputs: z.record(z.string(), DatasetReference),
    })
    export type Schema = z.infer<typeof Schema>

    /** The user's code raised. */
    export const Failure = z.object({
        error: z.object({ message: z.string(), traceback: z.string() }),
    })
export type Failure = z.infer<typeof Failure>

    /** What a pipeline declares. */
    export const Listing = z.union([
        z.object({ transforms: Schema.array() }),
        Failure,
    ])
    export type Listing = z.infer<typeof Listing>
}
