import { z } from "zod"

/**
 * What a new Code Workspace starts from — declared in code next to its files
 * (server/src/services/CodeWorkspace/templates), never created at runtime.
 */
export namespace Template {

    export const Id = z.string().regex(/^[a-z][a-z0-9-]*$/, "kebab-case template id")
    export type  Id = z.infer<typeof Id>

    /** As the API sends it: what the wizard's template step lists. */
    export const Schema = z.object({
        id:          Id,
        displayName: z.string(),
        description: z.string(),
    })
    export type Schema = z.infer<typeof Schema>

    /** "Sales cleaning!" → "sales-cleaning" — the workspace's Python project name. */
    export const getProjectName = (workspaceName: string): string =>
        words(workspaceName).join("-") || FALLBACK_NAME

    /** "Sales cleaning!" → "sales_cleaning" — its importable package; never starts with a digit. */
    export const getPackageName = (workspaceName: string): string => {
        const joined = words(workspaceName).join("_") || FALLBACK_NAME

        return /^[0-9]/.test(joined) ? `workspace_${joined}` : joined
    }

    /** A name with no letters or digits at all. */
    const FALLBACK_NAME = "transforms"

    const words = (name: string): string[] =>
        name
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(word => word.length > 0)
}
