import { execFile } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { CodeWorkspace } from '@quarry/shared/domain';
import { pythonTransforms } from '@/services/CodeWorkspace/templates/python-transforms';
import type { TemplateParams } from '@/services/CodeWorkspace/templates';

const run = promisify(execFile);

/** quarry.transforms and the engines, as the runtime image has them — transforms-python's own environment. */
const TRANSFORMS = path.resolve(__dirname, '../../../transforms-python');
const PYTHON = path.join(TRANSFORMS, '.venv/bin/python');

const WITH_EXAMPLE: TemplateParams = {
    workspaceName: 'Sales cleaning',
    projectName:   'sales-cleaning',
    packageName:   'sales_cleaning',
    example:       { inputPath: '/Sales/raw/orders', outputPath: '/Sales/raw/orders (clean)' },
};

const WITHOUT_EXAMPLE: TemplateParams = { ...WITH_EXAMPLE, example: null };

/**
 * The python-transforms template's first commit passes its own checks
 * (docs/design/code-workspaces/checks.md §2): its quarry-ci.yml is valid, its
 * tests pass, and its manifest is one the server accepts — with or without the
 * example. Rendered into a temporary directory and run with transforms-python's
 * environment (no `uv lock`, no container).
 */
describe('the python-transforms template', () => {

    const directories: string[] = [];

    afterEach(async () => {
        for (const directory of directories.splice(0))
            await fs.rm(directory, { recursive: true, force: true });
    });

    async function render(params: TemplateParams): Promise<string> {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quarry-test-template-'));

        directories.push(directory);

        for (const [file, contents] of Object.entries(pythonTransforms.files(params))) {
            await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
            await fs.writeFile(path.join(directory, file), contents);
        }

        return directory;
    }

    /** As the check container runs a step: in the checkout, quarry.transforms importable. */
    function python(directory: string, args: string[]) {
        return run(PYTHON, args, { cwd: directory, env: { ...process.env, PYTHONPATH: path.join(TRANSFORMS, 'src') } });
    }

    it.each([['with', WITH_EXAMPLE], ['without', WITHOUT_EXAMPLE]])('writes a valid quarry-ci.yml (%s the example)', async (_, params) => {
        const config = CodeWorkspace.Check.Config.Schema.parse(parseYaml(pythonTransforms.files(params)['quarry-ci.yml']));

        expect(config.steps.map((step) => step.name)).toEqual(['Environment', 'Tests', 'Publish transforms']);
        expect(config.steps.at(-1)).toMatchObject({ uses: 'quarry/publish-transforms' });
    });

    describe.skipIf(!existsSync(PYTHON))('run as a check would (needs packages/transforms-python/.venv: `uv sync` there)', () => {

        it.each([['with', WITH_EXAMPLE], ['without', WITHOUT_EXAMPLE]])('passes its own tests (%s the example)', async (_, params) => {
            const directory = await render(params);

            const { stdout } = await python(directory, ['-m', 'pytest', '-q', '-p', 'no:cacheprovider']);

            expect(stdout).toMatch(params.example ? /2 passed/ : /1 passed/);
        });

        it('publishes the example transform', async () => {
            const directory = await render(WITH_EXAMPLE);

            const { stdout } = await python(directory, ['-m', 'quarry.transforms.manifest']);
            const manifest = CodeWorkspace.Check.Manifest.Schema.parse(JSON.parse(stdout));

            expect(manifest.transforms).toEqual([{
                name:      'sales_cleaning.datasets.example.example',
                inputs:    { source: '/Sales/raw/orders' },
                outputs:   { out: '/Sales/raw/orders (clean)' },
                resources: { cpuCores: 1, memoryGb: 4 },
            }]);
        });

        it('publishes nothing without the example — and that passes', async () => {
            const directory = await render(WITHOUT_EXAMPLE);

            const { stdout } = await python(directory, ['-m', 'quarry.transforms.manifest']);

            expect(CodeWorkspace.Check.Manifest.Schema.parse(JSON.parse(stdout))).toEqual({ transforms: [] });
        });
    });
});
