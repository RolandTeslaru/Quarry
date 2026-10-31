import { z } from "zod"
import { Resource } from "../Library/Resource"

/**
 * The bridge between a session's VS Code workbench — the IDE's page, in Quarry's
 * iframe — and the Quarry page around it. The IDE image registers commands in
 * the workbench (docker/code-workspace-ide/quarry-bridge.js); an extension calls
 * one, the workbench asks Quarry's page by postMessage, the page answers, and
 * the answer is the command's result. See docs/design/code-workspaces/workbench-bridge.md.
 */
export namespace Workbench {

    const AskBase = z.object({
        type: z.literal("quarry:ask"),
        id:   z.string(),
    })

    const ExecuteBase = z.object({
        type: z.literal("quarry:execute"),
        id:   z.string(),
    })

    /**
     * The commands across the bridge: the workbench's own, each answered by Quarry's page (`Ask`), and the
     * extension's, which Quarry's page executes in the workbench as if their buttons in the IDE were clicked (`Execute`).
     */
    export namespace Command {

        /** The extension's Preview: picks a transform in the editor, then previews it. */
        export namespace Preview {
            export const COMMAND = "quarry.preview"

            export const Execute = ExecuteBase.extend({ command: z.literal(COMMAND) })
            export type  Execute = z.infer<typeof Execute>
        }

        /** The extension's Build: picks a transform in the editor, then builds it. */
        export namespace Build {
            export const COMMAND = "quarry.build"

            export const Execute = ExecuteBase.extend({ command: z.literal(COMMAND) })
            export type  Execute = z.infer<typeof Execute>
        }

        /** Choose a resource in Quarry's Library selector. Null: the dialog was closed without a choice. */
        export namespace PickResource {
            export const COMMAND = "quarry.workbench.pickResource"

            export const Request = z.object({
                accept:  Resource.Type.array(),
                /** The reference as written now, a path or a RID — said in the dialog, not resolved. */
                current: z.string().nullable(),
            })
            export type  Request = z.infer<typeof Request>

            export const Response = z.object({
                rid:  Resource.Rid,
                path: Resource.Path,
            }).nullable()
            export type  Response = z.infer<typeof Response>

            export const Ask = AskBase.extend({
                command: z.literal(COMMAND),
                args:    Request,
            })
            export type  Ask = z.infer<typeof Ask>
        }
    }

    /** Quarry's page → the workbench, once it has loaded: where to send questions. */
    export const Hello = z.object({ type: z.literal("quarry:hello") })
    export type  Hello = z.infer<typeof Hello>

    /** The workbench → Quarry's page: one of the commands above was called — which one, by `command`. */
    export const Ask = z.discriminatedUnion("command", [
        Command.PickResource.Ask,
    ])
    export type  Ask = z.infer<typeof Ask>

    /** Quarry's page → the workbench: execute one of the extension's commands — which one, by `command`. */
    export const Execute = z.discriminatedUnion("command", [
        Command.Preview.Execute,
        Command.Build.Execute,
    ])
    export type  Execute = z.infer<typeof Execute>

    /** The workbench → Quarry's page, once an executed command has finished: `error` if it threw. */
    export const Executed = z.object({
        type:  z.literal("quarry:executed"),
        id:    z.string(),
        error: z.string().nullable(),
    })
    export type  Executed = z.infer<typeof Executed>

    /** Quarry's page → the workbench: the command's result. */
    export const Answer = z.object({
        type:   z.literal("quarry:answer"),
        id:     z.string(),
        result: z.union([Command.PickResource.Response]),          // the asked command's Response
    })
    export type  Answer = z.infer<typeof Answer>
}
