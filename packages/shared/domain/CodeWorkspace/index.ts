import * as WorkspaceMod from "./Workspace"
import * as TemplateMod  from "./Template"
import * as PreviewMod   from "./Preview"
import * as RuntimeMod   from "./Runtime"
import * as ModuleFunctionPathMod from "./ModuleFunctionPath"
import * as GitMod      from "./Git"
import * as EventMod    from "./Event"
import * as CIMod       from "./CI"
import * as ApiMod       from "./api"

/**
 * Code Workspaces: a Git repository of transforms plus its Python environment,
 * edited in VS Code in the browser — a library resource of type `workspace`.
 * docs/design/transforms.md.
 */
export namespace CodeWorkspace {
    export import Rid       = WorkspaceMod.Workspace.Rid
    export import createRid = WorkspaceMod.Workspace.createRid
    export import Schema    = WorkspaceMod.Workspace.Schema

    export import Template = TemplateMod.Template
    export import Preview  = PreviewMod.Preview
    export import Runtime  = RuntimeMod.Runtime
    export import ModuleFunctionPath = ModuleFunctionPathMod.ModuleFunctionPath
    export import Git      = GitMod.Git
    export import CI       = CIMod.CI
    export import Event    = EventMod.Event

    export import API = ApiMod.API
}
