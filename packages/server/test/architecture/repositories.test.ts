import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = path.resolve(__dirname, '../../src');

/** A service's facade repository: `services/<Service>/repository/<name>.repository.ts` whose class composes the rest. */
const FACADES = [
    'services/Forge/repository/forge.repository.ts',
    'services/CodeWorkspace/repository/code-workspace.repository.ts',
    'services/DataConnection/repository/data-connection.repository.ts',
];

/**
 * A service split into sub-repositories (`repository/` folder) is reached only
 * through its facade: the sub-repositories hold the pieces of multi-table writes
 * (start, finish, end, …), which only the facade may combine in one transaction.
 */
describe('repositories', () => {

    it("imports a service's sub-repositories only from its repository folder (and its module, to provide them)", async () => {
        const offenders: string[] = [];

        for (const file of await getSourceFiles(SOURCE)) {
            const relative = path.relative(SOURCE, file);
            const source = await fs.readFile(file, 'utf8');

            for (const specifier of getImports(source)) {
                const target = resolveImport(file, specifier);

                if (!target || !isSubRepository(target))
                    continue;

                if (!mayImport(file, target))
                    offenders.push(`${relative} imports ${path.relative(SOURCE, target)}`);
            }
        }

        expect(offenders).toEqual([]);
    });

    it('finds the facades it guards', async () => {
        for (const facade of FACADES)
            await expect(fs.access(path.join(SOURCE, facade))).resolves.toBeUndefined();
    });
});

/** The facade and its siblings, and the service's module — which registers them as providers. */
function mayImport(file: string, subRepository: string): boolean {
    const folder = path.dirname(subRepository);

    return path.dirname(file) === folder
        || (path.dirname(file) === path.dirname(folder) && file.endsWith('.module.ts'));
}

/** In a `repository/` folder, and not its facade. */
function isSubRepository(file: string): boolean {
    const relative = path.relative(SOURCE, file);

    return path.basename(path.dirname(file)) === 'repository'
        && file.endsWith('.repository.ts')
        && !FACADES.includes(relative);
}

/** Value imports only: a type (`NewJob`, `PublishedJobSpec`) can't call anything. */
function getImports(source: string): string[] {
    return [...source.matchAll(/^(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);
}

/** `@/…` and relative imports, as files; packages aren't ours. */
function resolveImport(from: string, specifier: string): string | null {
    if (specifier.startsWith('@/'))
        return `${path.join(SOURCE, specifier.slice(2))}.ts`;

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
