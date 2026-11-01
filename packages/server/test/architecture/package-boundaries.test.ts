import { globSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKAGES = path.resolve(__dirname, '../../..');

const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** Every import of the package's TypeScript files that matches, as `file → import`. */
function getImports(pkg: string, forbidden: RegExp): string[] {
    const found: string[] = [];

    for (const file of globSync('**/*.ts', { cwd: path.join(PACKAGES, pkg), exclude: (name) => name === 'node_modules' || name === 'dist' })) {
        for (const [, specifier] of readFileSync(path.join(PACKAGES, pkg, file), 'utf8').matchAll(IMPORT))
            if (forbidden.test(specifier))
                found.push(`${pkg}/${file} → ${specifier}`);
    }

    return found;
}

/**
 * The packages' direction (docs/design/architecture-split.md): the kernel is imported by every
 * server and imports none of them; a service imports the kernel, never the main server.
 */
describe('package boundaries', () => {

    it("the kernel imports no server, service or product — and no `@/`, which would resolve into its importer's package", () => {
        expect(getImports('platform-server', /^@\/|^@quarry\/(server|catalog-service)\b|\.\.\/(server|catalog-service)\//)).toEqual([]);
    });

    it("the Catalog service imports nothing of the main server's", () => {
        expect(getImports('catalog-service', /^@\/|^@quarry\/server\b|\.\.\/server\/src\//)).toEqual([]);
    });
});
