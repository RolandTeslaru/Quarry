import * as vscode from 'vscode'
import type { Library } from '@quarry/shared/domain'
import type { Reference } from '../domain/Reference'
import type { Quarry } from '../quarry'

/** The lenses' and hover's actions. */
export function registerCommands(quarry: Quarry): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('quarry.openInQuarry', (rid: Library.Resource.Rid) => openInQuarry(quarry, rid)),
        vscode.commands.registerCommand('quarry.useRid', useRid),
    ]
}

/** A new browser tab on the resource's page. */
async function openInQuarry(quarry: Quarry, rid: Library.Resource.Rid): Promise<void> {
    const url = quarry.getResourceUrl(rid)

    if (url)
        await vscode.env.openExternal(url)
}

/**
 * The path in a reference replaced by the resource's RID, and the path kept
 * as a comment at the end of the line — the line stays readable.
 */
async function useRid(uri: vscode.Uri, reference: Reference.Schema, rid: Library.Resource.Rid): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri)
    const start = document.positionAt(reference.start)
    const end = document.positionAt(reference.end)

    // Only if the code hasn't changed under the lens since it was drawn.
    if (document.getText(new vscode.Range(start, end)) !== reference.value)
        return

    const edit = new vscode.WorkspaceEdit()
    const line = document.lineAt(start.line)

    edit.replace(uri, new vscode.Range(start, end), rid)

    if (!line.text.includes('#'))
        edit.insert(uri, line.range.end, `  # ${reference.value}`)

    await vscode.workspace.applyEdit(edit)
}
