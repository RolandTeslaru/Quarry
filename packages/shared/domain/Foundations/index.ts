import * as RidMod   from "./Rid"
import * as QueueMod from "./Queue"
import * as BranchMod from "./Branch"

/** Types every service depends on. */
export namespace Foundations {
    /** `Foundations.Rid<S, T>` (type) and `Foundations.Rid.generateSchema / create / parse` (values). */
    export import Rid = RidMod.Rid

    /** Queue contracts: `Foundations.Queue.define({ name, job, result, options })`. */
    export import Queue = QueueMod.Queue

    /** A branch name. */
    export import Branch = BranchMod.Branch

    export const uuidv7 = RidMod.uuidv7
}
