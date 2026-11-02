import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import * as path from 'node:path';
import type { TestProject } from 'vitest/node';
import { setUpTestDatabase } from '@quarry/platform-kernel/testing/test-database';

const BOOT_MS = 90_000;

const ROOT = path.resolve(__dirname, '../../../../..');

declare module 'vitest' {
    export interface ProvidedContext {
        serverUrl:  string;
        catalogUrl: string;
        forgeUrl:   string;
        dataConnectionUrl: string;
    }
}

/**
 * Once per run: a fresh test database from the main server's migrations, then the main server, Catalog
 * and Forge as processes — what Data Connection's microservice calls reach (minting tokens, Keychain,
 * datasets, publishing recipes), as in production. Their addresses go to every test file (test/support/env.ts).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    await setUpTestDatabase(path.join(ROOT, 'platform/server/migrations'));

    const [serverPort, catalogPort, forgePort, dataConnectionPort] = [await getFreePort(), await getFreePort(), await getFreePort(), await getFreePort()];
    const serverUrl = `http://127.0.0.1:${serverPort}`;
    const catalogUrl = `http://127.0.0.1:${catalogPort}`;
    const forgeUrl = `http://127.0.0.1:${forgePort}`;
    const dataConnectionUrl = `http://127.0.0.1:${dataConnectionPort}`;      // where a test that needs this service over HTTP serves it

    const server = await start('main server', 'platform/server', 'src/api.ts', { PORT: String(serverPort), CATALOG_URL: catalogUrl, FORGE_URL: forgeUrl, DATA_CONNECTION_URL: dataConnectionUrl }, 'API listening');
    const catalog = await start('Catalog', 'applications/catalog/microservice', 'src/main.ts', { QUARRY_SERVER_URL: serverUrl, CATALOG_PORT: String(catalogPort) }, 'Catalog listening');

    const forge = await start('Forge', 'applications/forge/microservice', 'src/main.ts', { QUARRY_SERVER_URL: serverUrl, FORGE_PORT: String(forgePort) }, 'Forge listening');

    project.provide('serverUrl', serverUrl);
    project.provide('catalogUrl', catalogUrl);
    project.provide('forgeUrl', forgeUrl);
    project.provide('dataConnectionUrl', dataConnectionUrl);

    return async () => {
        forge.kill('SIGTERM');
        catalog.kill('SIGTERM');
        server.kill('SIGTERM');
    };
}

/** A package's entrypoint under ts-node, on the test database and Redis (setUpTestDatabase set them), once it says it's up. */
async function start(name: string, pkg: string, entrypoint: string, env: Record<string, string>, ready: string): Promise<ChildProcess> {
    let output = '';

    const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', entrypoint], {
        cwd:   path.join(ROOT, pkg),
        env:   { ...process.env, ...env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => output += chunk.toString());
    child.stderr?.on('data', (chunk: Buffer) => output += chunk.toString());

    const deadline = Date.now() + BOOT_MS;

    while (!output.includes(ready)) {
        if (Date.now() > deadline || child.exitCode !== null) {
            child.kill('SIGTERM');

            throw new Error(`The ${name} didn't start:\n${output}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return child;
}

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const probe = createServer();

        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as AddressInfo;

            probe.close(() => resolve(port));
        });
    });
}
