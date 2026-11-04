import { z } from "zod"

/** What an exploration's nodes are coloured by, and whether the key to those colours is shown. Saved with it. */
export namespace Legend {

    export const Type = z.enum(["resource-type"])
    export type  Type = z.infer<typeof Type>

    export const Schema = z.object({
        type:      Type,
        isVisible: z.boolean(),
    })

    export const DEFAULT: Legend = {
        type:      "resource-type",
        isVisible: true,
    }
}
export type Legend = z.infer<typeof Legend.Schema>
