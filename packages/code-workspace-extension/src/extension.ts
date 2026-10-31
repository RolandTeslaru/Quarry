import * as vscode from 'vscode'
import { buildTransform } from './features/build'
import { registerCommands } from './features/commands'
import { ComponentsView } from './features/components-view'
import { ReferenceDiagnostics } from './features/diagnostics'
import { ReferenceHover } from './features/hover'
import { ReferenceLenses } from './features/lenses'
import { ReferenceLinks } from './features/links'
import { PreviewView } from './features/DatasetTransformPreview/preview-view'
import { adoptQuarryTheme } from './features/theme'
import { Quarry } from './quarry'

const PYTHON: vscode.DocumentSelector = { language: 'python' }

/**
 * The Quarry extension, preinstalled in every Code Workspace session
 * (docs/design/transforms.md §6): Quarry's themes, and transforms' dataset
 * references — what they point to, opening them in Quarry, swapping a path for its RID.
 */
export function activate(context: vscode.ExtensionContext): void {
    const quarry = new Quarry()
    const previewView = new PreviewView(context.extensionUri, quarry)

    context.subscriptions.push(
        quarry,
        vscode.languages.registerCodeLensProvider(PYTHON, new ReferenceLenses(quarry)),
        vscode.languages.registerHoverProvider(PYTHON, new ReferenceHover(quarry)),
        vscode.languages.registerDocumentLinkProvider(PYTHON, new ReferenceLinks()),
        new ReferenceDiagnostics(quarry),
        ...registerCommands(quarry),
        vscode.window.registerWebviewViewProvider(PreviewView.ID, previewView, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.commands.registerCommand('quarry.preview', (uri?: vscode.Uri) => previewView.preview(uri)),
        vscode.commands.registerCommand('quarry.build', (uri?: vscode.Uri) => buildTransform(quarry, uri)),
        vscode.window.registerWebviewViewProvider(ComponentsView.ID, new ComponentsView(context.extensionUri)),
    )

    void adoptQuarryTheme()
}

export function deactivate(): void {}
