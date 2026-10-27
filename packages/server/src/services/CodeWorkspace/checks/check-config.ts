import { CodeWorkspace } from '@quarry/shared/domain';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { GitRepositories } from '../git/repositories';

import CheckRun = CodeWorkspace.CheckRun;

export type CheckConfigResult =
    | { readonly config: CodeWorkspace.Check.Config.Schema }
    | { readonly error: string };

/** quarry-ci.yml at the run's commit, parsed and checked — or why it can't be run. */
export async function readCheckConfig(
    repositories: GitRepositories,
    run: Pick<CheckRun.Schema, 'workspaceRid' | 'commit'>,
): Promise<CheckConfigResult> {
    const text = await repositories.readFile(run.workspaceRid, run.commit, CodeWorkspace.Check.FILE);

    if (text === null)
        return { error: `No ${CodeWorkspace.Check.FILE} at the repository's root` };

    let document: unknown;

    try {
        document = parseYaml(text);
    }
    catch (error) {
        return { error: `${CodeWorkspace.Check.FILE} isn't valid YAML: ${error instanceof Error ? error.message : String(error)}` };
    }

    const parsed = CodeWorkspace.Check.Config.Schema.safeParse(document);

    if (!parsed.success)
        return { error: `${CodeWorkspace.Check.FILE} is invalid:\n${z.prettifyError(parsed.error)}` };

    return { config: parsed.data };
}

/** A claimed run's steps: Parse (done), the file's (waiting), Validate & publish (waiting). */
export function layOutSteps(config: CodeWorkspace.Check.Config.Schema, now: Date = new Date()): CheckRun.Step.Schema[] {
    return [
        { ...getStep(CheckRun.PARSE_STEP, 'succeeded'), startedAt: now, finishedAt: now },
        ...config.steps.map(step => getStep(step.name, 'waiting')),
        getStep(CheckRun.PUBLISH_STEP, 'waiting'),
    ];
}

/** A run that never reached the worker: only its Parse step, failed with why. */
export function getParseFailedSteps(error: string, now: Date = new Date()): CheckRun.Step.Schema[] {
    return [{ ...getStep(CheckRun.PARSE_STEP, 'failed'), startedAt: now, finishedAt: now, log: error }];
}

export function getStep(name: string, status: CheckRun.Step.Status, log = ''): CheckRun.Step.Schema {
    return { name, status, exitCode: null, startedAt: null, finishedAt: null, log };
}

/** The end of a step's output — what's kept. */
export function getLogTail(log: string): string {
    const bytes = Buffer.from(log);

    return bytes.length <= CheckRun.Step.LOG_TAIL_BYTES
        ? log
        : bytes.subarray(bytes.length - CheckRun.Step.LOG_TAIL_BYTES).toString();
}
