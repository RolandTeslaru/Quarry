import * as RidMod   from "./Rid"
import * as QueueMod from "./Queue"
import * as BranchMod from "./Branch"
import * as MicroserviceCallMod from "./MicroserviceCall"

/** Types every service depends on. */
export namespace Foundations {
    /** `Foundations.Rid<S, T>` (type) and `Foundations.Rid.generateSchema / create / parse` (values). */
    export import Rid = RidMod.Rid

    /** Queue contracts: `Foundations.Queue.define({ name, job, result, options })`. */
    export import Queue = QueueMod.Queue

    /** One service asking another (architecture-split.md §8): contracts, the message, its failures. */
    export import MicroserviceCall = MicroserviceCallMod.MicroserviceCall

    /** A branch name. */
    export import Branch = BranchMod.Branch

    export const MAIN_BRANCH = BranchMod.MAIN_BRANCH

    export const uuidv7 = RidMod.uuidv7
}
