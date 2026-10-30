import * as path from 'node:path'
import * as vscode from 'vscode'
import { CodeWorkspace, type CodeTransform } from '@quarry/shared/domain'
import { sessionRuntime } from './session-runtime'

import Calls = CodeWorkspace.Runtime

/** Rows sampled from each input. */
export const PREVIEW_ROWS = 1000

/**
 * The workspace's pipeline, as the working copy declares it — the session's
 * runtime imports it. A pipeline that doesn't import is an answer (`{ error }`), not a failure.
 */
export async function getTransformsFromFolder(folder: vscode.Uri): Promise<CodeTransform.Listing> {
    const runtime = await sessionRuntime.get()
    const { listing } = await runtime.request(Calls.Describe, { folder: folder.fsPath })

    return listing
}

/**
 * One transform, run by the session's runtime on samples of its inputs, read
 * from Quarry as the user (the session's token). Null if it was cancelled —
 * cancelling stops it in the runtime.
 */
export async function runPreview(
    folder:       vscode.Uri,
    name:         CodeWorkspace.ModuleFunctionPath.Schema,
    session:      { token: string; serverUrl: string },
    cancellation: vscode.CancellationToken,
): Promise<CodeWorkspace.Preview.Result | null> {
    const runtime = await sessionRuntime.get()
    const listener = cancellation.onCancellationRequested(() => void runtime.request(Calls.Cancel, {}))

    try {
        const { result } = await runtime.request(Calls.Preview, {
            folder:    folder.fsPath,
            transform: name,
            rows:      PREVIEW_ROWS,
            session,
        })

        return result
    }
    finally {
        listener.dispose()
    }
}

/** `src/sales_cleaning/datasets/example.py` → `sales_cleaning.datasets.example` — the prefix of its transforms' names. */
export function getModuleName(folder: vscode.Uri, file: vscode.Uri): string | null {
    const relative = path.relative(path.join(folder.fsPath, 'src'), file.fsPath)

    if (relative.startsWith('..') || !relative.endsWith('.py'))
        return null

    return relative.slice(0, -'.py'.length).split(path.sep).filter(part => part !== '__init__').join('.')
}
