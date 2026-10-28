import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Catalog, CodeWorkspace, Forge, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { ForgeService } from '@/services/Forge/forge.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { LibraryService } from '@/services/Library/library.service';
import { GitRepositories } from '../git/repositories';

export type PublishResult =
    | { readonly published: true;  readonly log: string }
    | { readonly published: false; readonly log: string };

/**
 * A passing check run's last step (docs/design/code-workspaces/checks.md §5): its
 * manifest — what the commit's transforms claim to read and write — checked as the
 * pusher, then published as the branch's job specs, one per transform, pinned to the
 * commit. Builds run them. A refusal throws, with what's wrong in its message.
 */
@Injectable()
export class CheckPublisher {

    constructor(
        private readonly repositories: GitRepositories,
        private readonly library:      LibraryService,
        private readonly catalog:      CatalogService,
        private readonly gatekeeper:   GatekeeperService,
        private readonly forge:        ForgeService,
    ) {}

    public async publish(run: CodeWorkspace.CheckRun.Schema, manifest: CodeWorkspace.Check.Manifest.Schema): Promise<PublishResult> {
        if (!run.pushedBy)
            throw new BadRequestException('No pusher to publish as');

        // As the pusher, through this run — what audit records as `via`.
        const principal = Principal.delegate(run.pushedBy, `check-run:${run.rid}`);

        // 1. Still the head: a newer push's run publishes instead.
        const heads = await this.repositories.getHeads(run.workspaceRid);

        if (heads[run.branch] !== run.commit)
            return { published: false, log: `${run.branch} has moved past ${run.commit.slice(0, 7)}: the newer commit's check publishes.` };

        // 2. Inputs: each an existing dataset the pusher can see. A reference is resolved once, however many transforms use it.
        const datasetRids: Record<string, Catalog.Dataset.Rid> = {};

        for (const transform of manifest.transforms) {
            for (const reference of Object.values(transform.inputs)) {
                if (datasetRids[reference])
                    continue;

                const isRid = Catalog.Dataset.Rid.safeParse(reference).success

                const resource = isRid
                    ? await this.catalog.get(principal, Catalog.Dataset.Rid.parse(reference)).catch(() => null)
                    : await this.library.getByPath(principal, reference).catch(() => null);

                if (!resource || resource.type !== 'dataset')
                    throw new NotFoundException(`${transform.name} reads ${reference}, which isn't a dataset you can see`);

                datasetRids[reference] = resource.rid as Catalog.Dataset.Rid;
            }
        }

        // 3. Outputs: each an existing dataset — or, for a path nothing is at yet, a new empty one in its folder.
        const created: string[] = [];

        for (const transform of manifest.transforms) {
            for (const reference of Object.values(transform.outputs)) {
                if (Catalog.Dataset.Rid.safeParse(reference).success) {
                    const dataset = await this.catalog.get(principal, Catalog.Dataset.Rid.parse(reference)).catch(() => null);

                    if (!dataset)
                        throw new NotFoundException(`${transform.name} writes ${reference}, which isn't a dataset you can see`);

                    datasetRids[reference] = dataset.rid;
                    continue;
                }

                const existing = await this.library.getByPath(principal, reference).catch(() => null);

                if (existing) {
                    if (existing.type !== 'dataset')
                        throw new ConflictException(`${transform.name} writes ${reference}, which is a ${existing.type}, not a dataset`);

                    datasetRids[reference] = existing.rid as Catalog.Dataset.Rid;
                    continue;
                }

                const segments = Library.Resource.parsePath(reference);

                if (segments.length < 2)
                    throw new BadRequestException(`${transform.name} writes ${reference}: a dataset goes in a project or a folder, like /Project/${segments[0] ?? 'name'}`);

                const folderPath = `/${segments.slice(0, -1).join('/')}`;
                const folder = await this.library.getByPath(principal, folderPath).catch(() => null);

                if (!folder)
                    throw new NotFoundException(`${transform.name} writes ${reference}, but there's no folder ${folderPath} you can see`);

                const name = Library.Resource.Name.safeParse(segments.at(-1));

                if (!name.success)
                    throw new BadRequestException(`${transform.name} writes ${reference}: "${segments.at(-1)}" isn't a valid name`);

                const dataset = await this.catalog.createDataset(principal, { parentRid: folder.rid, name: name.data, description: null });

                datasetRids[reference] = dataset.rid;
                created.push(reference);
            }
        }

        // 4. Write on every output: a build would write them as this pusher's job specs.
        for (const transform of manifest.transforms) {
            for (const reference of Object.values(transform.outputs)) {
                const allowed = await this.gatekeeper.can(principal, 'write', datasetRids[reference]);

                if (!allowed)
                    throw new ForbiddenException(`${transform.name} writes ${reference}, which you can't write`);
            }
        }

        // 5. No cycles: a transform may not read, through this workspace's transforms, what it writes.
        const writerOf: Record<string, string> = {};

        for (const transform of manifest.transforms)
            for (const reference of Object.values(transform.outputs))
                writerOf[datasetRids[reference]] = transform.name;

        for (const start of manifest.transforms) {
            const seen = new Set<string>();
            const toVisit = Object.values(start.inputs).map((reference) => datasetRids[reference]);

            while (toVisit.length > 0) {
                const writer = writerOf[toVisit.pop()!];

                if (!writer || seen.has(writer))
                    continue;

                if (writer === start.name)
                    throw new ConflictException(`${start.name} reads its own output, through the workspace's transforms — a cycle`);

                seen.add(writer);

                const upstream = manifest.transforms.find((transform) => transform.name === writer)!;

                toVisit.push(...Object.values(upstream.inputs).map((reference) => datasetRids[reference]));
            }
        }

        // 6. Publish: the branch's job specs for this workspace become these. Forge refuses an output another producer owns.
        const specs = await this.forge.jobSpecs.publish(principal, run.workspaceRid, run.branch, manifest.transforms.map((transform) => ({
            logic: Forge.JobSpec.Logic.parse({
                type:         'code-workspace',
                workspaceRid: run.workspaceRid,
                commit:       run.commit,
                transform:    transform.name,
            }),
            inputDatasetRids:  [...new Set(Object.values(transform.inputs).map((reference) => datasetRids[reference]))],
            outputDatasetRids: Object.values(transform.outputs).map((reference) => datasetRids[reference]),
            resources:         transform.resources,
        })));

        const lines = manifest.transforms.map((transform) => `${transform.name} → ${Object.values(transform.outputs).join(', ')}`);

        if (created.length > 0)
            lines.push(`Created ${created.join(', ')}`);

        return { published: true, log: [`Published ${specs.length} job spec(s) on ${run.branch}:`, ...lines].join('\n') };
    }
}
