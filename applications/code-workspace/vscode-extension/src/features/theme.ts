import * as vscode from 'vscode'

/** Quarry's own themes (themes/), contributed by this extension. */
export const QUARRY_LIGHT = 'Quarry Light'

/**
 * Quarry Light as the user's theme — once, when they haven't chosen one. The
 * server can't set a default (browser VS Code keeps user settings itself), so
 * the extension does; a theme the user picks later is never overwritten.
 */
export async function adoptQuarryTheme(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('workbench')
    const chosen = configuration.inspect<string>('colorTheme')?.globalValue

    if (chosen === undefined)
        await configuration.update('colorTheme', QUARRY_LIGHT, vscode.ConfigurationTarget.Global)
}
