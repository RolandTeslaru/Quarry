import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { CodeWorkspace } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { requireEnv } from '@/db/table';
import { resolveEnvPath } from '@/load-env';

const run = promisify(execFile);

/** Every Code Workspace's history is on this branch until branches exist (docs/design/transforms.md §8). */
export const DEFAULT_BRANCH = 'main';

/** Who a commit is by — the committing user. */
export interface Author {
    readonly name:  string;
    readonly email: string;
}

export interface InitialCommit {
    readonly author:   Author;
    readonly message:  string;
    /** Writes the first commit's files into an empty working directory. */
    readonly populate: (directory: string) => Promise<void>;
}

/**
 * The bare Git repositories behind Code Workspaces, one per workspace, under
 * QUARRY_GIT_ROOT (named by RID). Sessions clone and push them over HTTP
 * (git http-backend, behind the server); this class only creates and removes them.
 */
@Injectable()
export class GitRepositories {

    private readonly log = System.log.withContext('CodeWorkspace.Git');

    public readonly root = resolveEnvPath(requireEnv('QUARRY_GIT_ROOT'));

    public getPath(rid: CodeWorkspace.Rid): string {
        return path.join(this.root, `${rid}.git`);
    }

    /** A bare repository whose `main` holds one commit — the rendered template. Removed again if any step fails. */
    public async create(rid: CodeWorkspace.Rid, commit: InitialCommit): Promise<void> {
        const repository = this.getPath(rid);
        const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'quarry-workspace-'));

        try {
            await fs.mkdir(this.root, { recursive: true });

            await git(['init', '--bare', `--initial-branch=${DEFAULT_BRANCH}`, repository]);
            await git(['-C', repository, 'config', 'http.receivepack', 'true']);       // pushes over HTTP

            await git(['init', `--initial-branch=${DEFAULT_BRANCH}`, workdir]);
            await commit.populate(workdir);
            await git(['-C', workdir, 'add', '--all']);
            await git(['-C', workdir, 'commit', '--message', commit.message], authorEnv(commit.author));
            await git(['-C', workdir, 'push', repository, DEFAULT_BRANCH]);

            this.log.info(`Created repository for ${rid}`);
        }
        catch (error) {
            await this.remove(rid);

            throw error;
        }
        finally {
            await fs.rm(workdir, { recursive: true, force: true });
        }
    }

    public async remove(rid: CodeWorkspace.Rid): Promise<void> {
        await fs.rm(this.getPath(rid), { recursive: true, force: true });
    }
}

async function git(args: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
    await run('git', args, { env: { ...process.env, ...env } });
}

function authorEnv(author: Author): NodeJS.ProcessEnv {
    return {
        GIT_AUTHOR_NAME:     author.name,
        GIT_AUTHOR_EMAIL:    author.email,
        GIT_COMMITTER_NAME:  author.name,
        GIT_COMMITTER_EMAIL: author.email,
    };
}
