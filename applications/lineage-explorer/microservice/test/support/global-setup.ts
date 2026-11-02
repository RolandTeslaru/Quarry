import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import * as path from 'node:path';
import type { TestProject } from 'vitest/node';
import { setUpTestDatabase } from '@quarry/platform-kernel/testing/test-database';

const BOOT_MS = 90_000;

const ROOT = path.resolve(__dirname, '../../../../..');

declare module 'vitest' {
    export interface ProvidedContext {
        serverUrl: string;
    }
}

/**
 * Once per run: a fresh test database from the main server's migrations, then the main server and this
 * service as processes, so the end-to-end tests reach it through the proxy, as browsers do.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    await setUpTestDatabase(path.join(ROOT, 'platform/server/migrations'));

    const [serverPort, servicePort] = [await getFreePort(), await getFreePort()];
    const serverUrl = `http://127.0.0.1:${serverPort}`;
    const serviceUrl = `http://127.0.0.1:${servicePort}`;

    const server = await start('main server', 'platform/server', 'src/api.ts', { PORT: String(serverPort), LINEAGE_EXPLORER_URL: serviceUrl }, 'API listening');
    const service = await start('Lineage Explorer', 'applications/lineage-explorer/microservice', 'src/main.ts', { QUARRY_SERVER_URL: serverUrl, LINEAGE_EXPLORER_PORT: String(servicePort) }, 'Lineage Explorer listening');

    project.provide('serverUrl', serverUrl);

    return async () => {
        service.kill('SIGTERM');
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

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${name} didn't start in ${BOOT_MS}ms:\n${output}`)), BOOT_MS);

        const onOutput = (chunk: Buffer) => {
            output += chunk.toString();

            if (output.includes(ready)) {
                clearTimeout(timeout);
                resolve();
            }
        };

        child.stdout.on('data', onOutput);
        child.stderr.on('data', onOutput);
        child.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`${name} exited (${code}):\n${output}`));
        });
    });

    return child;
}

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;

            server.close(() => resolve(port));
        });
    });
}
