import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { CodeWorkspace, Foundations } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { GitRepos } from '@/services/CodeWorkspace/git/git-repos';
import { CodeWorkspaceRepository } from '@/services/CodeWorkspace/repository/code-workspace.repository';
import type { ForgeHarness } from './forge-fixtures';

const run = promisify(execFile);

export const MAIN = Foundations.MAIN_BRANCH;

/** The template's quarry-ci.yml, minus its environment steps: what a passing check runs. */
export const QUARRY_CI = `steps:
  - name: Tests
    run: pytest -q
  - name: Publish transforms
    uses: quarry/publish-transforms
`;

export interface TestWorkspace {
    readonly rid:        CodeWorkspace.Rid;
    readonly projectRid: CodeWorkspace.Schema['parentRid'];
    readonly heads:      CodeWorkspace.Git.Heads;
}

/**
 * A workspace in a new project, without a template (no `uv lock`): its row, and a
 * bare repository (under the test Git root) whose main holds one commit of `files`.
 * No check run is queued.
 */
export async function createWorkspace(
    harness:   ForgeHarness,
    principal: Principal.User,
    files:     Record<string, string> = { 'README.md': '# Test\n' },
): Promise<TestWorkspace> {
    const { projectRid } = await harness.createDatasets(principal, []);
    const rid = CodeWorkspace.createRid();
    const gitRepos = harness.get(GitRepos);

    await gitRepos.create(rid, {
        author:   { name: 'Test', email: 'test@test.quarry' },
        message:  'Initial commit',
        populate: (directory) => writeFiles(directory, files),
    });

    await harness.get(CodeWorkspaceRepository).workspace.create(principal, {
        rid,
        name:        `Workspace ${rid.slice(-8)}`,
        description: null,
        parentRid:   projectRid,
        templateId:  'python-transforms',
    });

    return { rid, projectRid, heads: await gitRepos.getHeads(rid) };
}

/**
 * A commit of `files` on `branch` (from main if it's new), pushed straight to the bare
 * repository — not through the server, so no check is queued. The new commit.
 */
export async function commitFiles(
    harness: ForgeHarness,
    rid:     CodeWorkspace.Rid,
    files:   Record<string, string>,
    branch:  Foundations.Branch = MAIN,
): Promise<CodeWorkspace.Git.Commit> {
    const repository = harness.get(GitRepos).getPath(rid);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quarry-test-commit-'));
    const git = (...args: string[]) => run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test.quarry', '-C', directory, ...args])
        .then(({ stdout }) => stdout.trim());

    try {
        await run('git', ['clone', '--quiet', repository, directory]);

        const exists = await git('ls-remote', '--heads', 'origin', branch);

        await git('checkout', '--quiet', '-B', branch, exists ? `origin/${branch}` : 'origin/main');
        await writeFiles(directory, files);
        await git('add', '--all');
        await git('commit', '--quiet', '--allow-empty', '--message', `Change ${Object.keys(files).join(', ') || 'nothing'}`);
        await git('push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`);

        return CodeWorkspace.Git.Commit.parse(await git('rev-parse', 'HEAD'));
    }
    finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

async function writeFiles(directory: string, files: Record<string, string>): Promise<void> {
    for (const [file, contents] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
        await fs.writeFile(path.join(directory, file), contents);
    }
}
