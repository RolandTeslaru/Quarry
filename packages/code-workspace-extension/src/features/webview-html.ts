import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'

/** Where the webview bundles are (`npm run build:webviews`): `<entry>/main.js` and `styles.css`. */
export const getWebviewRoot = (extensionUri: vscode.Uri): vscode.Uri => vscode.Uri.joinPath(extensionUri, 'dist', 'webview')

/**
 * A webview's page: standard-ui's stylesheet and its one bundle. Scripts come
 * only from the extension (by nonce); React's inline styles and the stylesheet
 * are allowed.
 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, entry: string): string {
    const root = getWebviewRoot(extensionUri)
    const nonce = randomBytes(16).toString('base64')
    const script = webview.asWebviewUri(vscode.Uri.joinPath(root, entry, 'main.js'))
    const styles = webview.asWebviewUri(vscode.Uri.joinPath(root, 'styles.css'))

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="${styles}">
</head>
<body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`
}
