import { z } from "zod"
import type { Dataset } from "../Dataset/Dataset"
import type { Lineage } from "../Library/Lineage"
import type { Resource } from "../Library/Resource"

/** What an exploration's nodes are coloured by, and whether the key to those colours is shown. Saved with it. */
export namespace Legend {

    export const Type = z.enum(["resource-type", "staleness"])
    export type  Type = z.infer<typeof Type>

    export const Schema = z.object({
        type:      Type,
        isVisible: z.boolean(),
    })

    export const DEFAULT: Legend = {
        type:      "resource-type",
        isVisible: true,
    }

    /**
     * The `staleness` legend's entries: a dataset by its own reasons, else by whether anything above it is stale.
     * `checking`: a dataset Forge hasn't answered for yet · `not-a-dataset`: a source, which nothing builds.
     */
    export namespace Staleness {

        export const Key = z.enum(["never-built", "logic-changed", "inputs-changed", "stale-upstream", "fresh", "checking", "not-a-dataset"])
        export type  Key = z.infer<typeof Key>

        /** Logic changed wins over inputs changed: building it again settles both. */
        export function getKey(resource: Resource.Base, staleness: Record<Dataset.Rid, Lineage.Staleness> | undefined): Key {
            if (resource.type !== "dataset")
                return "not-a-dataset"

            const dataset = staleness?.[resource.rid as Dataset.Rid]

            if (!dataset)
                return "checking"

            if (dataset.reasons.includes("never-built"))
                return "never-built"

            if (dataset.reasons.includes("logic-changed"))
                return "logic-changed"

            if (dataset.reasons.includes("inputs-changed"))
                return "inputs-changed"

            if (dataset.distance !== null)
                return "stale-upstream"

            return "fresh"
        }
    }
}
export type Legend = z.infer<typeof Legend.Schema>
