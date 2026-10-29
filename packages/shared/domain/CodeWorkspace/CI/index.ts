import * as CheckRunMod from "./CheckRun"
import * as CheckMod    from "./Check"
import * as QueueMod    from "./queue"
import * as DurableQueueMod from "./durable-queue"
import * as ApiMod      from "./api"

/**
 * CI for Code Workspaces: a check run per pushed branch head — quarry-ci.yml's
 * steps, then its job specs published. docs/design/code-workspaces/checks.md.
 */
export namespace CI {
    export import CheckRun = CheckRunMod.CheckRun
    export import Check    = CheckMod.Check
    export import Queue    = QueueMod.Queue
    export import DurableQueue = DurableQueueMod.DurableQueue

    export import API = ApiMod.API
}