import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isAxiosError, type AxiosInstance } from 'axios'
import * as vscode from 'vscode'
import { CodeWorkspace, Dataset, Forge, Foundations, Library, type CodeTransform } from '@quarry/shared/domain'
import type { Quarry } from '../quarry'
import { pickTransform } from './transform-picker'

const git = promisify(execFile)

/** How often a check run or a build is looked at while it's going. */
const POLL_MS = 2_000

/** The branch's newest check runs searched for the commit's: it was just pushed, so it's among them. */
const CHECK_RUNS_SEARCHED = 10

/**
 * The editor title's Build (and Quarry's, through the workbench bridge): pick a transform, then build what
 * its last commit publishes. A build runs the workspace's recipes, which only a passing check publishes, from
 * a pushed commit — so uncommitted changes are left out (said first), unpushed commits are pushed (which runs
 * the checks), the commit's check is waited for, and then its outputs are built and followed to the end.
 * Each job clones the repository at that commit. docs/design/code-workspaces/checks.md, forge.md.
 */
export async function buildTransform(quarry: Quarry, uri: vscode.Uri | undefined): Promise<void> {
    const transform = await pickTransform(uri, { title: 'Build' })
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const session = quarry.getSession()
    const api = quarry.getApi()

    if (!transform || !folder)
        return

    if (!session || !api) {
        void vscode.window.showErrorMessage('The session hasn’t connected to Quarry yet — reconnect from the workspace’s page.')

        return
    }

    const name = CodeWorkspace.ModuleFunctionPath.getFunctionName(transform.name)
    const { stdout: changes } = await git('git', ['status', '--porcelain'], { cwd: folder })

    if (changes.trim()) {
        const choice = await vscode.window.showWarningMessage(
            `You have uncommitted changes. They won’t be in the build: it builds ${name} as of your last commit.`,
            { modal: true, detail: 'Commit them first to build them — committing pushes, and the push runs the checks.' },
            'Build last commit',
        )

        if (choice !== 'Build last commit')
            return
    }

    await vscode.window.withProgress({
        location:    vscode.ProgressLocation.Notification,
        title:       `Building ${name}`,
        cancellable: true,
    }, async (progress, cancellation) => {
        try {
            const branch = Foundations.Branch.parse((await git('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: folder })).stdout.trim())
            const commit = (await git('git', ['rev-parse', 'HEAD'], { cwd: folder })).stdout.trim()

            // Nothing to push is fine: the commit was pushed before, and its check ran then.
            progress.report({ message: 'pushing…' })
            await git('git', ['push', '--quiet', 'origin', `HEAD:${branch}`], { cwd: folder })

            progress.report({ message: `checking ${commit.slice(0, 7)}…` })

            const checked = await waitForCheck(api, session.workspaceRid, branch, commit, cancellation)

            if (!checked)
                return

            const datasetRids = await getOutputRids(api, transform)
            const { build } = await Forge.API.createBuild(api, { branch, target: { type: 'manual', datasetRids } })

            progress.report({ message: 'running…' })

            const finished = await waitForBuild(api, build.rid, cancellation)

            if (finished)
                void vscode.window.showInformationMessage(`Built ${name}.`)
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Couldn’t build ${name}: ${getMessage(error)}`)
        }
    })
}

/**
 * The commit's check run, until it has finished: true if it passed and published the commit's recipes.
 * A failed, canceled or unpublished one is said and gives false, as does stopping the wait.
 */
async function waitForCheck(
    api:          AxiosInstance,
    workspaceRid: CodeWorkspace.Rid,
    branch:       Foundations.Branch,
    commit:       string,
    cancellation: vscode.CancellationToken,
): Promise<boolean> {
    while (!cancellation.isCancellationRequested) {
        const { checkRuns } = await CodeWorkspace.CI.API.listCheckRuns(api, workspaceRid, { branch, limit: CHECK_RUNS_SEARCHED })
        const run = checkRuns.find(checkRun => checkRun.commit === commit)

        if (!run)
            throw new Error(`no check ran for ${commit.slice(0, 7)} — push it again to run one`)

        if (run.status === 'succeeded' && run.published)
            return true

        if (run.status === 'succeeded')
            throw new Error(`the checks passed, but ${commit.slice(0, 7)} is no longer ${branch}’s newest commit — build again from the newest`)

        if (run.status === 'failed')
            throw new Error(`the checks failed${run.failure ? ` at “${run.failure.step}”: ${run.failure.message}` : ''} — see the Checks tab`)

        if (run.status === 'canceled')
            throw new Error(`a newer push to ${branch} replaced ${commit.slice(0, 7)}’s checks — build again from the newest`)

        await new Promise(resolve => setTimeout(resolve, POLL_MS))
    }

    return false
}

/** The transform's outputs as datasets: a RID as written, or the dataset at a path — the check created any that were new. */
async function getOutputRids(api: AxiosInstance, transform: CodeTransform.Schema): Promise<Dataset.Rid[]> {
    const rids: Dataset.Rid[] = []

    for (const value of Object.values(transform.outputs)) {
        if (Dataset.Rid.safeParse(value).success) {
            rids.push(Dataset.Rid.parse(value))

            continue
        }

        const { resource } = await Library.API.Resource.getByPath(api, { path: value })

        rids.push(Dataset.Rid.parse(resource.rid))
    }

    return rids
}

/**
 * The build, until it has finished: true if it succeeded. A failure is thrown with its failed jobs' messages;
 * stopping the wait gives false and leaves the build running.
 */
async function waitForBuild(api: AxiosInstance, buildRid: Forge.Build.Rid, cancellation: vscode.CancellationToken): Promise<boolean> {
    while (!cancellation.isCancellationRequested) {
        const { build, jobs } = await Forge.API.getBuild(api, buildRid)

        if (build.status === 'succeeded')
            return true

        if (build.status !== 'running') {
            const failures = Object.values(jobs).flatMap(job => (job.failure ? [job.failure.message] : []))

            throw new Error(`the build ${build.status}${failures.length > 0 ? `: ${failures.join('; ')}` : ''}`)
        }

        await new Promise(resolve => setTimeout(resolve, POLL_MS))
    }

    return false
}

/** What went wrong, as the user should read it: the server's message for an API error. */
function getMessage(error: unknown): string {
    if (isAxiosError<{ message?: string }>(error))
        return error.response?.data?.message ?? error.message

    // git's own words are on stderr; execFile's message repeats the command first.
    if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim())
        return error.stderr.trim()

    return error instanceof Error ? error.message : String(error)
}
