import * as ProjectMod  from "./project"
import * as FolderMod   from "./folder"
import * as ResourceMod from "./resource"
import * as LineageMod  from "./lineage"

/** Library's HTTP surface — mirrors library.controller. */
export namespace API {
    export import Project  = ProjectMod.Project
    export import Folder   = FolderMod.Folder
    export import Resource = ResourceMod.Resource
    export import Lineage  = LineageMod.Lineage
}
