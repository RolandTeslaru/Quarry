import { z } from 'zod';
import { Catalog, Forge, Foundations, Identity, Library } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';
import type { LibraryDB } from '@/services/Library/library.db';

/** The `forge` schema: job specs, builds, jobs. */
export namespace ForgeDB {

    export namespace JobSpec {
        export const Row = z.object({
            rid:          Forge.JobSpec.Rid,
            producer_rid: Library.Resource.Rid,
            branch:       Foundations.Branch,
            logic:        Forge.JobSpec.Logic,
            resources:    Forge.JobSpec.Resources,
            published_by: Identity.User.Rid.nullable(),
            published_at: z.date(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, inputDatasetRids: Catalog.Dataset.Rid[], outputDatasetRids: Catalog.Dataset.Rid[]) =>
            Forge.JobSpec.Schema.parse({
                rid:               row.rid,
                producerRid:       row.producer_rid,
                branch:            row.branch,
                logic:             row.logic,
                inputDatasetRids,
                outputDatasetRids,
                resources:         row.resources,
                publishedBy:       row.published_by,
                publishedAt:       row.published_at,
            });
    }

    /** A spec's input or output dataset — the two tables have the same shape. */
    export namespace JobSpecDataset {
        export const Row = z.object({
            job_spec_rid: Forge.JobSpec.Rid,
            dataset_rid:  Catalog.Dataset.Rid,
        });
        export type Row = z.infer<typeof Row>;
    }

    export namespace CurrentJobSpec {
        export const Row = z.object({
            dataset_rid:  Catalog.Dataset.Rid,
            branch:       Foundations.Branch,
            job_spec_rid: Forge.JobSpec.Rid,
        });
        export type Row = z.infer<typeof Row>;
    }

    export namespace Build {
        export const Row = z.object({
            rid:               Forge.Build.Rid,
            branch:            Foundations.Branch,
            fallback_branches: Foundations.Branch.array(),
            target:            Forge.Build.Target,
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
            job_spec_rid: Forge.JobSpec.Rid,
            status:       Forge.Job.Status,
            attempt:      z.number().int(),
            failure:      z.object({ message: z.string() }).nullable(),
            started_at:   z.date().nullable(),
            finished_at:  z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        /** Inputs are pinned when the job starts — none yet means not started. */
        export const toDomain = (row: Row, inputs: JobTransaction.Row[], outputs: JobTransaction.Row[]) => Forge.Job.Schema.parse({
            rid:                   row.rid,
            buildRid:              row.build_rid,
            jobSpecRid:            row.job_spec_rid,
            status:                row.status,
            attempt:               row.attempt,
            inputTransactionRids:  row.started_at ? inputs.map((input) => input.transaction_rid) : null,
            outputTransactionRids: outputs.map((output) => output.transaction_rid),
            failure:               row.failure,
            startedAt:             row.started_at,
            finishedAt:            row.finished_at,
        });
    }

    /** A job's input or output transaction — the two tables have the same shape. */
    export namespace JobTransaction {
        export const Row = z.object({
            job_rid:         Forge.Job.Rid,
            transaction_rid: Catalog.Transaction.Rid,
            dataset_rid:     Catalog.Dataset.Rid,
        });
        export type Row = z.infer<typeof Row>;
    }

    export interface Tables {
        'forge.job_spec':                Table<typeof JobSpec.Row, 'published_at'>;
        'forge.job_spec_input_dataset':  Table<typeof JobSpecDataset.Row>;
        'forge.job_spec_output_dataset': Table<typeof JobSpecDataset.Row>;
        'forge.current_job_spec':        Table<typeof CurrentJobSpec.Row>;
        'forge.build':                   Table<typeof Build.Row, 'fallback_branches' | 'force_build' | 'abort_on_failure' | 'retry_count' | 'status' | 'created_at' | 'finished_at'>;
        'forge.job':                     Table<typeof Job.Row, 'status' | 'attempt' | 'failure' | 'started_at' | 'finished_at'>;
        'forge.job_input_transaction':   Table<typeof JobTransaction.Row>;
        'forge.job_output_transaction':  Table<typeof JobTransaction.Row>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
