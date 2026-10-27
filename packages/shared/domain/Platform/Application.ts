import { z } from "zod"

// The workspace's applications. An app is part of the platform, not a Library
// resource: it lives in code (each frontend app's definition.ts), nobody
// creates or trashes one. The id is what the server knows it by — what an
// access event says a resource was opened in.
export namespace Application {

    export const Id = z.enum([
        "library",
        "datasets",
        "data-connection",
        "keychain",
        "pipeline-builder",
        "code-workspaces",
        "forge",
        "layout-demo",                                   // test apps: the shell's layouts
        "minimal-demo",
    ])
    export type  Id = z.infer<typeof Id>
}
