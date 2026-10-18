import * as ResourceMod from "./Resource"
import * as ProjectMod  from "./Project"
import * as FolderMod   from "./Folder"
import * as ApiMod      from "./api"

/** The Library — Quarry's file system (Foundry's Compass). */
export namespace Library {
    export import Resource = ResourceMod.Resource
    export import Project  = ProjectMod.Project
    export import Folder   = FolderMod.Folder

    export import API = ApiMod.API
}
