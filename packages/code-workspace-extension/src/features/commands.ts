import * as vscode from 'vscode'
import { CodeWorkspace, type Library } from '@quarry/shared/domain'
import type { Reference } from '../domain/Reference'
import type { Quarry } from '../quarry'

import PickResource = CodeWorkspace.Workbench.Command.PickResource

/** The lenses', hover's and links' actions. */
export function registerCommands(quarry: Quarry): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('quarry.openInQuarry', (rid: Library.Resource.Rid) => openInQuarry(quarry, rid)),
        vscode.commands.registerCommand('quarry.useRid', useRid),
        vscode.commands.registerCommand('quarry.pickResource', pickResource),
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

/**
 * The reference chosen in Quarry's Library selector instead: the workbench asks the
 * Quarry page around the IDE (docs/design/code-workspaces/workbench-bridge.md), and the
 * string becomes the chosen dataset's RID, with its path as the line's comment.
 */
async function pickResource(uriString: string, reference: Reference.Schema): Promise<void> {
    let picked: PickResource.Response

    try {
        const request: PickResource.Request = { accept: ['dataset'], current: reference.value }

        picked = PickResource.Response.parse(await vscode.commands.executeCommand(PickResource.COMMAND, request))
    }
    catch (error) {
        void vscode.window.showErrorMessage(`Couldn’t open the Library: ${error instanceof Error ? error.message : String(error)}`)

        return
    }

    if (!picked)
        return

    const uri = vscode.Uri.parse(uriString)
    const document = await vscode.workspace.openTextDocument(uri)
    const start = document.positionAt(reference.start)
    const end = document.positionAt(reference.end)

    // Only if the code hasn't changed under the link while the dialog was open.
    if (document.getText(new vscode.Range(start, end)) !== reference.value)
        return

    const edit = new vscode.WorkspaceEdit()
    const line = document.lineAt(start.line)
    const comment = line.text.indexOf('#', end.character)

    edit.replace(uri, new vscode.Range(start, end), picked.rid)

    // The path the RID stands for, as the line's comment — replacing an older one, never another comment.
    if (comment === -1)
        edit.insert(uri, line.range.end, `  # ${picked.path}`)
    else if (/^#\s*\//.test(line.text.slice(comment)))
        edit.replace(uri, new vscode.Range(start.line, comment, start.line, line.text.length), `# ${picked.path}`)

    await vscode.workspace.applyEdit(edit)
}
