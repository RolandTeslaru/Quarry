import * as JobSpecMod from "./JobSpec"
import * as BuildMod   from "./Build"
import * as JobMod     from "./Job"

/** Builds: computing new versions of datasets from the job specs producers publish. See docs/design/forge.md. */
export namespace Forge {
    export import JobSpec = JobSpecMod.JobSpec
    export import Build   = BuildMod.Build
    export import Job     = JobMod.Job
}
