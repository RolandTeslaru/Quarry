import * as vscode from 'vscode'
import { Reference } from '../domain/Reference'
import type { Quarry, ResolvedResource } from '../quarry'
import { TYPE_ICONS, TYPE_LABELS } from './presentation'

/**
 * Above each `Input(…)` / `Output(…)`: what it points to (click to open it in
 * Quarry), and — for a path — "Use RID".
 */
export class ReferenceLenses implements vscode.CodeLensProvider {

    private readonly changed = new vscode.EventEmitter<void>()

    public readonly onDidChangeCodeLenses = this.changed.event

    public constructor(private readonly quarry: Quarry) {
        quarry.onDidChange(() => this.changed.fire())
    }

    public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (!this.quarry.isConnected())
            return []

        const references = Reference.findAll(document.getText())

        const lenses = await Promise.all(references.map(async reference => {
            const range = new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end))

            try {
                const resolved = await this.quarry.getResource(reference.value)

                return getLenses(document, reference, range, resolved)
            }
            catch {
                return [new vscode.CodeLens(range, { title: '$(cloud-offline) Couldn’t reach Quarry', command: '' })]
            }
        }))

        return lenses.flat()
    }
}

function getLenses(document: vscode.TextDocument, reference: Reference.Schema, range: vscode.Range, resolved: ResolvedResource | null): vscode.CodeLens[] {
    if (!resolved) {
        const title = reference.kind === 'output'
            ? '$(add) New dataset — the first build creates it'
            : '$(warning) Not found, or you can’t see it'

        return [new vscode.CodeLens(range, { title, command: '' })]
    }

    const { resource, location } = resolved

    const lenses = [
        new vscode.CodeLens(range, {
            title:     `$(${TYPE_ICONS[resource.type]}) ${resource.name} · ${TYPE_LABELS[resource.type]} · ${location}`,
            tooltip:   'Open in Quarry',
            command:   'quarry.openInQuarry',
            arguments: [resource.rid],
        }),
    ]

    if (!Reference.isRid(reference.value)) {
        lenses.push(new vscode.CodeLens(range, {
            title:     'Use RID',
            tooltip:   'Replace the path with the RID — it keeps working when the dataset is renamed or moved',
            command:   'quarry.useRid',
            arguments: [document.uri, reference, resource.rid],
        }))
    }

    return lenses
}
