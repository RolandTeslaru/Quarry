import { CodeWorkspace } from '@quarry/shared/domain';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { GitRepos } from '../git/git-repos';

import CI = CodeWorkspace.CI;
import CheckRun = CI.CheckRun;

export async function readCheckConfig(gitRepos: GitRepos, workspaceRid: CodeWorkspace.Rid, commit: CodeWorkspace.Git.Commit): Promise<CI.Check.Config.Schema> {
    const text = await gitRepos.readFile(workspaceRid, commit, CI.Check.FILE);

    if (text === null)
        throw new Error(`No ${CI.Check.FILE} at the repository's root`);

    return CI.Check.Config.Schema.parse(parseYaml(text));
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof z.ZodError)
        return z.prettifyError(error);

    if (error instanceof Error)
        return error.message;

    return String(error);
}

export function getStep(name: string, status: CheckRun.Step.Status): CheckRun.Step.Schema {
    return { name, status, exitCode: null, startedAt: null, finishedAt: null, log: '' };
}

/** Parse (done), quarry-ci.yml's steps, then publish. */
export function layOutSteps(config: CI.Check.Config.Schema): CheckRun.Step.Schema[] {
    const now = new Date();
    const steps: CheckRun.Step.Schema[] = [{ ...getStep(CheckRun.PARSE_STEP, 'succeeded'), startedAt: now, finishedAt: now }];

    for (const step of config.steps)
        steps.push(getStep(step.name, 'waiting'));

    steps.push(getStep(CheckRun.PUBLISH_STEP, 'waiting'));

    return steps;
}

export function getParseFailedSteps(message: string): CheckRun.Step.Schema[] {
    const now = new Date();

    return [{ ...getStep(CheckRun.PARSE_STEP, 'failed'), startedAt: now, finishedAt: now, log: message }];
}

export function getLogTail(log: string): string {
    const bytes = Buffer.from(log);

    if (bytes.length <= CheckRun.Step.LOG_TAIL_BYTES)
        return log;

    return bytes.subarray(bytes.length - CheckRun.Step.LOG_TAIL_BYTES).toString();
}
