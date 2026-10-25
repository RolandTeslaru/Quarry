import * as vscode from 'vscode'
import { registerCommands } from './features/commands'
import { ReferenceDiagnostics } from './features/diagnostics'
import { ReferenceHover } from './features/hover'
import { ReferenceLenses } from './features/lenses'
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

    context.subscriptions.push(
        quarry,
        vscode.languages.registerCodeLensProvider(PYTHON, new ReferenceLenses(quarry)),
        vscode.languages.registerHoverProvider(PYTHON, new ReferenceHover(quarry)),
        new ReferenceDiagnostics(quarry),
        ...registerCommands(quarry),
    )

    void adoptQuarryTheme()
}

export function deactivate(): void {}
