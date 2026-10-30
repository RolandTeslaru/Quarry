import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CodeWorkspace } from '@quarry/shared/domain';
import { StdioClient } from '@quarry/shared/server/stdio/stdio-client';

import Calls = CodeWorkspace.Runtime;

const PACKAGE = path.resolve(__dirname, '..');

/** The transforms package's own environment: quarry.transforms and its engines, as an IDE's .venv has them. */
const VENV = path.resolve(PACKAGE, '../transforms-python/.venv');

const FILES: Record<string, string> = {
    'src/pkg/__init__.py': '',
    'src/pkg/pipeline.py': [
        'from quarry.transforms import Pipeline',
        '',
        'from pkg.numbers import numbers',
        'from pkg.slow import slow',
        '',
        'pipeline = Pipeline()',
        'pipeline.add_transforms(numbers, slow)',
        '',
    ].join('\n'),
    'src/pkg/numbers.py': [
        'import polars as pl',
        'from quarry.transforms import Output, transform',
        '',
        '@transform.using(out=Output("ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2"))',
        'def numbers(out):',
        '    print("making numbers")',
        '    out.write_table(pl.DataFrame({"n": [1, 2, 3]}))',
        '',
    ].join('\n'),
    'src/pkg/slow.py': [
        'import time',
        'from quarry.transforms import Output, transform',
        '',
        '@transform.using(out=Output("ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d3"))',
        'def slow(out):',
        '    time.sleep(30)',
        '',
    ].join('\n'),
};

/**
 * The runtime as a session's IDE uses it: started from source, driven over
 * stdio by StdioClient, listing and previewing a working copy's transforms.
 */
describe('the runtime, for the IDE', () => {

    let folder: string;
    let runtime: StdioClient;

    beforeAll(async () => {
        folder = await fs.mkdtemp(path.join(os.tmpdir(), 'quarry-runtime-test-'));

        for (const [file, contents] of Object.entries(FILES)) {
            await fs.mkdir(path.dirname(path.join(folder, file)), { recursive: true });
            await fs.writeFile(path.join(folder, file), contents);
        }

        await fs.symlink(VENV, path.join(folder, '.venv'));

        const process = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
            cwd:   PACKAGE,
            stdio: ['pipe', 'pipe', 'inherit'],
        });

        runtime = new StdioClient(process, () => undefined);

        await runtime.waitUntilReady('code-workspace');
    });

    afterAll(async () => {
        runtime?.close();
        await fs.rm(folder, { recursive: true, force: true });
    });

    const session = {
        serverUrl: 'http://127.0.0.1:9',                     // never called: no inputs, and outputs named by RID
        token:     'test',
    };

    it("lists the working copy's transforms", async () => {
        const { listing } = await runtime.request(Calls.Describe, { folder });

        expect(listing).toMatchObject({
            transforms: [
                {
                    name:    'pkg.numbers.numbers',
                    inputs:  {},
                    outputs: { out: 'ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2' },
                },
                {
                    name:    'pkg.slow.slow',
                    inputs:  {},
                    outputs: { out: 'ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d3' },
                },
            ],
        });
    });

    it('previews a transform: its output, and what it printed', async () => {
        const { result } = await runtime.request(Calls.Preview, {
            folder,
            transform: CodeWorkspace.ModuleFunctionPath.Schema.parse('pkg.numbers.numbers'),
            rows:      1000,
            session,
        });

        expect(result).toMatchObject({
            transform: 'pkg.numbers.numbers',
            outputs:   { out: { rows: [[1], [2], [3]], rowCount: 3 } },
            logs:      ['making numbers'],
        });
    });

    it('stops a running preview when asked: its result is null', async () => {
        const preview = runtime.request(Calls.Preview, {
            folder,
            transform: CodeWorkspace.ModuleFunctionPath.Schema.parse('pkg.slow.slow'),
            rows:      1000,
            session,
        });

        await new Promise((resolve) => setTimeout(resolve, 2_000));
        await runtime.request(Calls.Cancel, {});

        expect((await preview).result).toBeNull();
    });
});
