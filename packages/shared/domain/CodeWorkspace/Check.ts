import { z } from "zod"
import { CodeTransform } from "../CodeTransform/CodeTransform"
import { JobSpec } from "../Forge/JobSpec"

/** What a check runs (quarry-ci.yml) and what its publish step reports (the manifest). docs/design/code-workspaces/checks.md. */
export namespace Check {

    /** At the repository's root. */
    export const FILE = "quarry-ci.yml"

    /** The steps Quarry provides, by their `uses:`. */
    export const Uses = z.enum(["quarry/publish-transforms"])
    export type  Uses = z.infer<typeof Uses>

    export const DEFAULT_TIMEOUT_MINUTES = 10
    export const MAX_TIMEOUT_MINUTES = 30

    export namespace Config {

        const StepBase = z.object({
            name:           z.string().trim().min(1),
            timeoutMinutes: z.number().int().positive().max(MAX_TIMEOUT_MINUTES).default(DEFAULT_TIMEOUT_MINUTES),
        })

        export const Step = z.union([
            StepBase.extend({ run: z.string().trim().min(1) }).strict(),
            StepBase.extend({ uses: Uses }).strict(),
        ])
        export type Step = z.infer<typeof Step>

        /** quarry-ci.yml, parsed: its steps in order, the last one publishing. */
        export const Schema = z.object({
            steps: Step.array().min(1),
        }).strict().superRefine((config, ctx) => {
            const publishing = config.steps.filter((step) => "uses" in step && step.uses === "quarry/publish-transforms")

            if (publishing.length !== 1)
                ctx.addIssue({ code: "custom", path: ["steps"], message: "Needs exactly one step with `uses: quarry/publish-transforms`" })
            else if (config.steps.at(-1) !== publishing[0])
                ctx.addIssue({ code: "custom", path: ["steps"], message: "`uses: quarry/publish-transforms` must be the last step" })
        })
        export type Schema = z.infer<typeof Schema>
    }

    export namespace Manifest {

        export const Transform = CodeTransform.Schema.extend({
            resources: JobSpec.Resources,
        })
        export type Transform = z.infer<typeof Transform>

        /** What `quarry/publish-transforms` claims the commit's transforms are — the server checks every claim. None is fine: nothing to publish. */
        export const Schema = z.object({
            transforms: Transform.array(),
        }).superRefine((manifest, ctx) => {
            const outputs = manifest.transforms.flatMap((transform) => Object.values(transform.outputs))
            const repeated = outputs.filter((output, index) => outputs.indexOf(output) !== index)

            for (const output of new Set(repeated))
                ctx.addIssue({ code: "custom", path: ["transforms"], message: `Two transforms write ${output}` })
        })
        export type Schema = z.infer<typeof Schema>
    }
}
