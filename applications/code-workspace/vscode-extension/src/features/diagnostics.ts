import * as vscode from 'vscode'
import { Reference } from '../domain/Reference'
import type { Quarry } from '../quarry'
import { TYPE_LABELS } from './presentation'

/** Typing pauses this long before references are checked again. */
const DEBOUNCE_MS = 500

/**
 * Warnings in the Problems panel: an input that points at nothing (or at
 * something the user can't see), and a reference to something that isn't a dataset.
 */
export class ReferenceDiagnostics implements vscode.Disposable {

    private readonly collection = vscode.languages.createDiagnosticCollection('quarry')

    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

    private readonly subscriptions: vscode.Disposable[]

    public constructor(private readonly quarry: Quarry) {
        this.subscriptions = [
            vscode.workspace.onDidOpenTextDocument(document => this.schedule(document)),
            vscode.workspace.onDidChangeTextDocument(event => this.schedule(event.document)),
            vscode.workspace.onDidCloseTextDocument(document => this.collection.delete(document.uri)),
            quarry.onDidChange(() => vscode.workspace.textDocuments.forEach(document => this.schedule(document))),
        ]

        vscode.workspace.textDocuments.forEach(document => this.schedule(document))
    }

    public dispose(): void {
        this.timers.forEach(timer => clearTimeout(timer))
        this.subscriptions.forEach(subscription => subscription.dispose())
        this.collection.dispose()
    }

    private schedule(document: vscode.TextDocument): void {
        if (document.languageId !== 'python')
            return

        const key = document.uri.toString()

        clearTimeout(this.timers.get(key))

        this.timers.set(key, setTimeout(() => void this.check(document), DEBOUNCE_MS))
    }

    private async check(document: vscode.TextDocument): Promise<void> {
        if (!this.quarry.isConnected()) {
            this.collection.delete(document.uri)

            return
        }

        const references = Reference.findAll(document.getText())
        const diagnostics: vscode.Diagnostic[] = []

        for (const reference of references) {
            const message = await this.getProblem(reference)

            if (!message)
                continue

            const range = new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end))
            const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning)

            diagnostic.source = 'Quarry'
            diagnostics.push(diagnostic)
        }

        this.collection.set(document.uri, diagnostics)
    }

    /** What's wrong with a reference, if anything. Quarry unreachable isn't the code's problem. */
    private async getProblem(reference: Reference.Schema): Promise<string | null> {
        const resolved = await this.quarry.getResource(reference.value).catch(() => undefined)

        if (resolved === undefined)
            return null

        if (resolved === null)
            return reference.kind === 'input' ? `No dataset at ${reference.value}, or you can't see it` : null

        if (resolved.resource.type !== 'dataset')
            return `${resolved.resource.name} is a ${TYPE_LABELS[resolved.resource.type]}, not a dataset`

        return null
    }
}
