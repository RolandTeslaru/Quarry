import * as vscode from 'vscode'
import { getWebviewHtml, getWebviewRoot } from './webview-html'

/** Test bench (bottom panel, "UI Kit"): standard-ui's components in a webview — webviews/components. */
export class ComponentsView implements vscode.WebviewViewProvider {

    public static readonly ID = 'quarry.components'

    constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        view.webview.options = { enableScripts: true, localResourceRoots: [getWebviewRoot(this.extensionUri)] }
        view.webview.html = getWebviewHtml(view.webview, this.extensionUri, 'components')
    }
}
