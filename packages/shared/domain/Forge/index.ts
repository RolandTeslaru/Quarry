import * as JobSpecMod from "./JobSpec"
import * as BuildMod   from "./Build"
import * as JobMod     from "./Job"
import * as EventMod   from "./Event"
import * as QueueMod   from "./queue"
import * as DurableQueueMod from "./durable-queue"
import * as ApiMod     from "./api"

/** Builds: computing new versions of datasets from the job specs producers publish. See docs/design/forge.md. */
export namespace Forge {
    export import JobSpec = JobSpecMod.JobSpec
    export import Build   = BuildMod.Build
    export import Job     = JobMod.Job

    export import API   = ApiMod.API
    export import Queue = QueueMod.Queue
    export import DurableQueue = DurableQueueMod.DurableQueue
    export import Event = EventMod.Event
}
