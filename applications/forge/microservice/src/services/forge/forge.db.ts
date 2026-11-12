import { z } from 'zod';
import { Dataset, Forge, Foundations, Identity, Library } from '@quarry/shared/domain';
import { defineDatabase } from '@quarry/platform-kernel/db/pool';
import type { Table } from '@quarry/platform-kernel/db/table';
import type { IdentityDB } from '@quarry/platform-kernel/services/Identity/identity.db';
import type { LibraryDB } from '@quarry/platform-kernel/services/Library/library.db';

/** The `forge` schema: recipes, builds, jobs. */
export namespace ForgeDB {

    export namespace Recipe {
        export const Row = z.object({
            rid:          Forge.Recipe.Rid,
            producer_rid: Library.Resource.Rid,
            branch:       Foundations.Branch,
            runtime_config: Forge.Recipe.RuntimeConfig,
            compute:      Forge.Recipe.Compute,
            published_by: Identity.User.Rid.nullable(),
            published_at: z.date(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, inputDatasetRids: Dataset.Rid[], outputs: Forge.Recipe['outputs']) =>
            Forge.Recipe.Schema.parse({
                rid:               row.rid,
                producerRid:       row.producer_rid,
                branch:            row.branch,
                runtimeConfig:     row.runtime_config,
                inputDatasetRids,
                outputs,
                compute:           row.compute,
                publishedBy:       row.published_by,
                publishedAt:       row.published_at,
            });
    }

    export namespace RecipeInputDataset {
        export const Row = z.object({
            recipe_rid: Forge.Recipe.Rid,
            dataset_rid:  Dataset.Rid,
        });
        export type Row = z.infer<typeof Row>;
    }

    export namespace RecipeOutput {
        export const Row = z.object({
            recipe_rid:   Forge.Recipe.Rid,
            resource_rid: Library.Resource.Rid,
            output:       Forge.Recipe.Output,
        });
        export type Row = z.infer<typeof Row>;
    }

    export namespace CurrentRecipe {
        export const Row = z.object({
            resource_rid: Library.Resource.Rid,
            branch:       Foundations.Branch,
            recipe_rid: Forge.Recipe.Rid,
        });
        export type Row = z.infer<typeof Row>;
    }

    export namespace Build {
        export const Row = z.object({
            rid:               Forge.Build.Rid,
            branch:            Foundations.Branch,
            fallback_branches: Foundations.Branch.array(),
            target:            Forge.Build.Target,
            plan:              Forge.Build.Plan.Schema,
            force_build:       z.boolean(),
            on_job_failure:    Forge.Build.OnJobFailure,
            retry_count:       z.number().int(),
            status:            Forge.Build.Status,
            created_by:        Identity.User.Rid.nullable(),
            created_at:        z.date(),
            finished_at:       z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => Forge.Build.Schema.parse({
            rid:              row.rid,
            branch:           row.branch,
            fallbackBranches: row.fallback_branches,
            target:           row.target,
            plan:             row.plan,
            forceBuild:       row.force_build,
            onJobFailure:     row.on_job_failure,
            retryCount:       row.retry_count,
            status:           row.status,
            createdBy:        row.created_by,
            createdAt:        row.created_at,
            finishedAt:       row.finished_at,
        });
    }

    export namespace Job {
        export const Row = z.object({
            rid:          Forge.Job.Rid,
            build_rid:    Forge.Build.Rid,
            recipe_rid: Forge.Recipe.Rid,
            status:       Forge.Job.Status,
            attempt:      z.number().int(),
            failure:      z.object({ message: z.string() }).nullable(),
            inputs:       z.record(Dataset.Rid, Dataset.Sequence).nullable(),
            outputs:      z.record(Library.Resource.Rid, Forge.Job.Output),
            scheduled_at: z.date().nullable(),
            started_at:   z.date().nullable(),
            heartbeat_at: z.date().nullable(),
            finished_at:  z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => Forge.Job.Schema.parse({
            rid:         row.rid,
            buildRid:    row.build_rid,
            recipeRid:  row.recipe_rid,
            status:      row.status,
            attempt:     row.attempt,
            inputs:      row.inputs,
            outputs:     row.outputs,
            failure:     row.failure,
            scheduledAt: row.scheduled_at,
            startedAt:   row.started_at,
            heartbeatAt: row.heartbeat_at,
            finishedAt:  row.finished_at,
        });
    }

    export interface Tables {
        'forge.recipe':                Table<typeof Recipe.Row, 'published_at'>;
        'forge.recipe_input_dataset':  Table<typeof RecipeInputDataset.Row>;
        'forge.recipe_output':         Table<typeof RecipeOutput.Row>;
        'forge.current_recipe':        Table<typeof CurrentRecipe.Row>;
        'forge.build':                   Table<typeof Build.Row, 'fallback_branches' | 'force_build' | 'on_job_failure' | 'retry_count' | 'status' | 'created_at' | 'finished_at'>;
        'forge.job':                     Table<typeof Job.Row, 'status' | 'attempt' | 'failure' | 'inputs' | 'scheduled_at' | 'started_at' | 'heartbeat_at' | 'finished_at'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
