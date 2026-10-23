import * as ApplicationMod from "./Application"

/** The platform itself: what the workspace is made of, not what users keep in it. */
export namespace Platform {
    export import Application = ApplicationMod.Application
}
