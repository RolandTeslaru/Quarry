import * as vscode from 'vscode'
import { Reference } from '../domain/Reference'

/**
 * Each `Input(…)` / `Output(…)` string as a link (⌘/Ctrl+click): pick the
 * dataset in Quarry's Library selector instead of typing it.
 */
export class ReferenceLinks implements vscode.DocumentLinkProvider {

    public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        return Reference.findAll(document.getText()).map(reference => {
            const range = new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end))
            const args = encodeURIComponent(JSON.stringify([document.uri.toString(), reference]))
            const link = new vscode.DocumentLink(range, vscode.Uri.parse(`command:quarry.pickResource?${args}`))

            link.tooltip = 'Pick a dataset from the Library'

            return link
        })
    }
}
