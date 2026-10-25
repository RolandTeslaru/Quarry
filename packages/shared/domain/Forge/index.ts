import * as JobSpecMod from "./JobSpec"

/** Builds: computing new versions of datasets from the job specs producers publish. See docs/design/transforms.md. */
export namespace Forge {
    export import JobSpec = JobSpecMod.JobSpec
}
