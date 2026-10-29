import { z } from 'zod';
import { Catalog, Forge, Foundations, Identity, Library } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';
import type { LibraryDB } from '@/services/Library/library.db';

/** The `forge` schema: recipes, builds, jobs. */
export namespace ForgeDB {

    export namespace Recipe {
        export const Row = z.object({
            rid:          Forge.Recipe.Rid,
            producer_rid: Library.Resource.Rid,
            branch:       Foundations.Branch,
            driver:        Forge.Recipe.Driver,
            compute:      Forge.Recipe.Compute,
            published_by: Identity.User.Rid.nullable(),
            published_at: z.date(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, inputDatasetRids: Catalog.Dataset.Rid[], outputDatasetRids: Catalog.Dataset.Rid[]) =>
            Forge.Recipe.Schema.parse({
                rid:               row.rid,
                producerRid:       row.producer_rid,
                branch:            row.branch,
                driver:             row.driver,
                inputDatasetRids,
                outputDatasetRids,
                compute:           row.compute,
                publishedBy:       row.published_by,
                publishedAt:       row.published_at,
            });
    }

    /** A recipe's input or output dataset — the two tables have the same shape. */
    export namespace RecipeDataset {
        export const Row = z.object({
            recipe_rid: Forge.Recipe.Rid,
            dataset_rid:  Catalog.Dataset.Rid,
        });
        export type Row = z.infer<typeof Row>;
    }

    export namespace CurrentRecipe {
        export const Row = z.object({
            dataset_rid:  Catalog.Dataset.Rid,
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
            abort_on_failure:  z.boolean(),
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
            abortOnFailure:   row.abort_on_failure,
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
            inputs:       z.record(Catalog.Dataset.Rid, Catalog.Transaction.Rid).nullable(),
            outputs:      z.record(Catalog.Dataset.Rid, Catalog.Transaction.Rid),
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
        'forge.recipe_input_dataset':  Table<typeof RecipeDataset.Row>;
        'forge.recipe_output_dataset': Table<typeof RecipeDataset.Row>;
        'forge.current_recipe':        Table<typeof CurrentRecipe.Row>;
        'forge.build':                   Table<typeof Build.Row, 'fallback_branches' | 'force_build' | 'abort_on_failure' | 'retry_count' | 'status' | 'created_at' | 'finished_at'>;
        'forge.job':                     Table<typeof Job.Row, 'status' | 'attempt' | 'failure' | 'inputs' | 'scheduled_at' | 'started_at' | 'heartbeat_at' | 'finished_at'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
