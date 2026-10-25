import { execFile, spawn } from 'node:child_process'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { CodeWorkspace, CodeTransform } from '@quarry/shared/domain'

/** Importing the pipeline — the same limit the worker gives `--list`. */
const LIST_TIMEOUT_MS = 60_000

/** Sampling every input, then running the transform. */
const PREVIEW_TIMEOUT_MS = 300_000

/** Rows sampled from each input. */
export const PREVIEW_ROWS = 1000

/**
 * The workspace's pipeline, read in this container: `python -m
 * quarry.transforms.preview --list` with the working copy's environment — what
 * it declares as saved on disk. No Quarry call: listing only imports the code.
 */
export async function getTransformsFromFolder(folder: vscode.Uri): Promise<CodeTransform.Listing> {
    const python = path.join(folder.fsPath, '.venv', 'bin', 'python')

    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(python, ['-m', 'quarry.transforms.preview', '--list'], { cwd: folder.fsPath, timeout: LIST_TIMEOUT_MS }, (error, out) => {
            // A pipeline that doesn't import exits 1 with `{ error }` on stdout — an answer, not a failure.
            if (error && !out)
                reject(error)
            else
                resolve(out)
        })
    })

    return CodeTransform.Listing.parse(JSON.parse(stdout))
}

/**
 * One transform, run here on samples of its inputs: `python -m
 * quarry.transforms.preview <name> --rows N`, reading the inputs from Quarry
 * as the user (the session's token). Its JSON is the answer even when it
 * exits 1 — the transform raised. Cancelling kills the process.
 */
export async function runPreview(
    folder:       vscode.Uri,
    name:         CodeWorkspace.ModuleFunctionPath.Schema,
    session:      { token: string; serverUrl: string },
    cancellation: vscode.CancellationToken,
): Promise<CodeWorkspace.Preview.Result | null> {
    const python = path.join(folder.fsPath, '.venv', 'bin', 'python')

    const stdout = await new Promise<string | null>((resolve, reject) => {
        const child = spawn(python, ['-m', 'quarry.transforms.preview', name, '--rows', String(PREVIEW_ROWS)], {
            cwd: folder.fsPath,
            env: { ...process.env, QUARRY_TOKEN: session.token, QUARRY_SERVER_URL: session.serverUrl },
        })

        let out = ''
        let err = ''
        let cancelled = false

        const timer = setTimeout(() => child.kill(), PREVIEW_TIMEOUT_MS)
        const listener = cancellation.onCancellationRequested(() => {
            cancelled = true
            child.kill()
        })

        child.stdout.on('data', chunk => (out += chunk))
        child.stderr.on('data', chunk => (err += chunk))
        child.on('error', reject)
        child.on('close', code => {
            clearTimeout(timer)
            listener.dispose()

            if (cancelled)
                resolve(null)
            else if (out.trim())
                resolve(out)
            else
                reject(new Error(err.trim() || `The preview printed no result (exit ${code})`))
        })
    })

    return stdout === null ? null : CodeWorkspace.Preview.Result.parse(JSON.parse(stdout))
}

/** `src/sales_cleaning/datasets/example.py` → `sales_cleaning.datasets.example` — the prefix of its transforms' names. */
export function getModuleName(folder: vscode.Uri, file: vscode.Uri): string | null {
    const relative = path.relative(path.join(folder.fsPath, 'src'), file.fsPath)

    if (relative.startsWith('..') || !relative.endsWith('.py'))
        return null

    return relative.slice(0, -'.py'.length).split(path.sep).filter(part => part !== '__init__').join('.')
}
