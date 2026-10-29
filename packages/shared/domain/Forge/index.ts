import * as RecipeMod  from "./Recipe"
import * as RuntimeMod from "./Runtime"
import * as BuildMod   from "./Build"
import * as JobMod     from "./Job"
import * as EventMod   from "./Event"
import * as QueueMod   from "./queue"
import * as DurableQueueMod from "./durable-queue"
import * as ApiMod     from "./api"

/** Builds: computing new versions of datasets from the recipes producers publish. See docs/design/forge.md. */
export namespace Forge {
    export import Recipe  = RecipeMod.Recipe
    export import Runtime = RuntimeMod.Runtime
    export import Build   = BuildMod.Build
    export import Job     = JobMod.Job

    export import API   = ApiMod.API
    export import Queue = QueueMod.Queue
    export import DurableQueue = DurableQueueMod.DurableQueue
    export import Event = EventMod.Event
}
