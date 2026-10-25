import * as vscode from 'vscode'
import { getFunctionName } from '../pipeline'
import { pickTransform } from './transform-picker'

/** The editor title's Build: pick a transform, then build it. Builds aren't wired up yet; the pick is. */
export async function pickTransformToBuild(uri: vscode.Uri | undefined): Promise<void> {
    const transform = await pickTransform(uri, { title: 'Build' })

    if (transform)
        void vscode.window.showInformationMessage(`Building ${getFunctionName(transform.name)} isn’t wired up yet.`)
}
