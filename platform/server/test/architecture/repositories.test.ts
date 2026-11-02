import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');

/** Every package with services' code: the main server's, and each service's. */
const SOURCES = ['platform/server', 'applications/catalog/microservice', 'applications/data-connection/microservice', 'applications/forge/microservice', 'applications/code-workspace/microservice', 'applications/lineage-explorer/microservice'].map((pkg) => path.join(ROOT, pkg, 'src'));

/** A service's facade repository: `…/repository/<name>.repository.ts` whose class composes the rest. */
const FACADES = [
    'applications/forge/microservice/src/services/forge/repository/forge.repository.ts',
];

/** Sub-repositories in their concept's folder, not beside a facade: only their service, the facade if it composes them, and the module that provides them may import these. */
const CONCEPT_SUB_REPOSITORIES: Record<string, string[]> = {
    'applications/forge/microservice/src/services/job/job.repository.ts': [
        'applications/forge/microservice/src/services/job/job.service.ts',
        'applications/forge/microservice/src/services/forge/repository/forge.repository.ts',
        'applications/forge/microservice/src/services/forge/forge.module.ts',
    ],
    'applications/forge/microservice/src/services/recipe/recipe.repository.ts': [
        'applications/forge/microservice/src/services/recipe/recipe.service.ts',
        'applications/forge/microservice/src/services/forge/forge.module.ts',
    ],
};

/**
 * A service split into sub-repositories is reached only through its facade: the
 * sub-repositories hold the pieces of multi-table writes (start, finish, end, …),
 * which only the facade may combine in one transaction.
 */
describe('repositories', () => {

    it("imports a service's sub-repositories only from its repository folder (and its module, to provide them)", async () => {
        const offenders: string[] = [];

        for (const file of (await Promise.all(SOURCES.map(getSourceFiles))).flat()) {
            const relative = path.relative(ROOT, file);
            const source = await fs.readFile(file, 'utf8');

            for (const specifier of getImports(source)) {
                const target = resolveImport(file, specifier);

                if (!target || !isSubRepository(target))
                    continue;

                if (!mayImport(file, target))
                    offenders.push(`${relative} imports ${path.relative(ROOT, target)}`);
            }
        }

        expect(offenders).toEqual([]);
    });

    it('finds the facades it guards', async () => {
        for (const facade of FACADES)
            await expect(fs.access(path.join(ROOT, facade))).resolves.toBeUndefined();
    });
});

/** The facade and its siblings, and the service's module — which registers them as providers. */
function mayImport(file: string, subRepository: string): boolean {
    const importers = CONCEPT_SUB_REPOSITORIES[path.relative(ROOT, subRepository)];

    if (importers)
        return importers.includes(path.relative(ROOT, file));

    const folder = path.dirname(subRepository);

    return path.dirname(file) === folder
        || (path.dirname(file) === path.dirname(folder) && file.endsWith('.module.ts'));
}

/** In a `repository/` folder and not its facade, or kept in its concept's folder. */
function isSubRepository(file: string): boolean {
    const relative = path.relative(ROOT, file);

    if (relative in CONCEPT_SUB_REPOSITORIES)
        return true;

    return path.basename(path.dirname(file)) === 'repository'
        && file.endsWith('.repository.ts')
        && !FACADES.includes(relative);
}

/** Value imports only: a type (`PlannedJob`, `PublishedRecipe`) can't call anything. */
function getImports(source: string): string[] {
    return [...source.matchAll(/^(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);
}

/** `@/…` (the importer's package), a service package's own name, and relative imports, as files; other packages aren't ours. */
function resolveImport(from: string, specifier: string): string | null {
    if (specifier.startsWith('@/'))
        return `${path.join(SOURCES.find((source) => from.startsWith(source))!, specifier.slice(2))}.ts`;

    const service = /^@quarry\/(catalog|data-connection|forge|code-workspace|lineage-explorer)-microservice\/(.*)$/.exec(specifier);

    if (service)
        return `${path.join(ROOT, 'applications', service[1], 'microservice/src', service[2])}.ts`;

    if (specifier.startsWith('.'))
        return `${path.resolve(path.dirname(from), specifier)}.ts`;

    return null;
}

async function getSourceFiles(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
        const full = path.join(directory, entry.name);

        if (entry.isDirectory())
            return getSourceFiles(full);

        return entry.name.endsWith('.ts') ? [full] : [];
    }));

    return files.flat();
}
