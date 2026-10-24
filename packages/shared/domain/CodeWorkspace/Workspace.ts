import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"
import { Template } from "./Template"

/**
 * A Git repository plus its Python environment, holding any number of
 * transforms — a library resource, edited in the Code Workspaces app.
 * docs/design/transforms.md.
 */
export namespace Workspace {

    export type  Rid = Foundations.Rid<"code-workspace", "workspace">
    export const Rid = Foundations.Rid.generateSchema("code-workspace", "workspace")
    export const createRid = () => Foundations.Rid.create("code-workspace", "workspace")

    export const Schema = Resource.Base.extend({
        rid:        Rid,
        type:       z.literal("workspace"),
        parentRid:  Resource.Rid,
        templateId: Template.Id,                     // what its first commit was rendered from
    })
    export type Schema = z.infer<typeof Schema>
}
