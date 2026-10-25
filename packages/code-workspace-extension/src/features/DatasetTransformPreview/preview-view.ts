import * as vscode from 'vscode'
import type { CodeTransform } from '@quarry/shared/domain'
import type { PreviewMessage } from '../../domain/PreviewMessage'
import { runPreview } from './pipeline'
import type { Quarry } from '../../quarry'
import { pickTransform } from '../transform-picker'
import { getWebviewHtml, getWebviewRoot } from '../webview-html'

/**
 * Preview, in this container: the editor title's ▶ Preview picks a transform
 * (this file's only one goes straight through), saves the editors, runs it on
 * samples of its inputs, and shows the outputs, logs or traceback in the
 * Preview panel (bottom panel) — the React page in webviews/preview.
 */
export class PreviewView implements vscode.WebviewViewProvider {

    public static readonly ID = 'quarry.preview'

    private view: vscode.WebviewView | undefined

    /** The page has loaded and listens — before that, what to show waits in `latest`. */
    private ready = false

    /** The last thing the page was told — replayed when it (re)loads. */
    private latest: PreviewMessage.ToPage | null = null

    /** The transform last run — Run again's. */
    private transform: CodeTransform.Schema | null = null

    private running: vscode.CancellationTokenSource | null = null

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly quarry:       Quarry,
    ) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view
        this.ready = false

        view.webview.options = { enableScripts: true, localResourceRoots: [getWebviewRoot(this.extensionUri)] }
        view.webview.html = getWebviewHtml(view.webview, this.extensionUri, 'preview')

        view.webview.onDidReceiveMessage((message: PreviewMessage.ToExtension) => {
            switch (message.type) {
                case 'ready':
                    this.ready = true

                    if (this.latest)
                        void view.webview.postMessage(this.latest)

                    break

                case 'rerun':
                    if (this.transform)
                        void this.run(this.transform)

                    break

                case 'stop':
                    this.running?.cancel()
                    break
            }
        })

        view.onDidDispose(() => {
            this.view = undefined
            this.ready = false
        })
    }

    /** The editor title's Preview: which transform, then run it. */
    public async preview(uri: vscode.Uri | undefined): Promise<void> {
        const transform = await pickTransform(uri, { title: 'Preview', onlyOneInFile: true })

        if (transform)
            await this.run(transform)
    }

    private async run(transform: CodeTransform.Schema): Promise<void> {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri
        const session = this.quarry.getSession()

        if (!folder)
            return

        this.running?.cancel()

        const running = new vscode.CancellationTokenSource()

        this.running = running
        this.transform = transform

        // The runner reads the files on disk.
        await vscode.workspace.saveAll(false)
        await vscode.commands.executeCommand(`${PreviewView.ID}.focus`)

        const labels = await this.getLabels(transform)
        const run = { transform, labels }

        if (!session) {
            this.show({ ...run, type: 'failed', message: 'The session hasn’t connected to Quarry yet — reconnect from the workspace’s page.' })

            return
        }

        this.show({ ...run, type: 'running' })

        // A run replaced by a newer one says nothing: the page shows the newer.
        const isCurrent = () => this.running === running

        try {
            const result = await runPreview(folder, transform.name, session, running.token)

            if (isCurrent())
                this.show(result ? { ...run, type: 'result', result } : { ...run, type: 'stopped' })
        }
        catch (error) {
            if (isCurrent())
                this.show({ ...run, type: 'failed', message: error instanceof Error ? error.message : String(error) })
        }
        finally {
            if (isCurrent())
                this.running = null

            running.dispose()
        }
    }

    /** Every input's and output's reference as a dataset name — from Quarry (cached), else from the path itself. */
    private async getLabels(transform: CodeTransform.Schema): Promise<Record<string, PreviewMessage.Label>> {
        const references = [...new Set([...Object.values(transform.inputs), ...Object.values(transform.outputs)])]

        const labels = await Promise.all(references.map(async reference => {
            const resolved = await this.quarry.getResource(reference).catch(() => null)
            const label: PreviewMessage.Label = resolved
                ? { name: resolved.resource.name, location: resolved.location }
                : getPathLabel(reference)

            return [reference, label] as const
        }))

        return Object.fromEntries(labels)
    }

    private show(message: PreviewMessage.ToPage): void {
        this.latest = message

        if (this.view && this.ready)
            void this.view.webview.postMessage(message)
    }
}

/** A reference Quarry doesn't know (yet): a path reads as its last name; a RID as itself. */
function getPathLabel(reference: string): PreviewMessage.Label {
    if (!reference.startsWith('/'))
        return { name: reference, location: null }

    const names = reference.split('/').filter(Boolean)

    return { name: names[names.length - 1] ?? reference, location: `/${names.slice(0, -1).join('/')}` }
}
