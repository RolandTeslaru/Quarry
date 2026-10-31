import { CodeWorkspace } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { CodeWorkspaceSDKImpl } from '../sdk'
import { handleWorkbenchEvent } from '../workbench-events'

import Workbench = CodeWorkspace.Workbench

/**
 * `CodeWorkspaceSDK.actions.workbench` — the session's VS Code workbench, in the IDE's iframe: what it asks
 * this page and the answers sent back, and the commands this page executes in it
 * (docs/design/code-workspaces/workbench-bridge.md).
 */
export class WorkbenchActions extends ActionGroup<CodeWorkspaceSDKImpl> {

    protected readonly log = log.withContext('CodeWorkspace.Actions.Workbench')

    /** Talks to the workbench in this iframe — answers it, executes commands in it — until the returned function is called. */
    public connect(frame: HTMLIFrameElement): () => void {
        const origin = new URL(frame.src).origin
        const workbench: NonNullable<CodeWorkspaceSDKImpl['runtime']['workbench']> = { frame, origin, executing: {} }

        this.sdk.runtime.workbench = workbench

        // Each load of the IDE's page (a reload, a restart) learns where to send its questions.
        const hello = () => {
            const message: Workbench.Hello = { type: 'quarry:hello' }

            frame.contentWindow?.postMessage(message, origin)
        }

        const onMessage = (event: MessageEvent) => {
            if (event.source !== frame.contentWindow || event.origin !== origin)
                return

            const executed = Workbench.Executed.safeParse(event.data)

            if (executed.success) {
                workbench.executing[executed.data.id]?.(executed.data)
                delete workbench.executing[executed.data.id]

                return
            }

            // Only the commands Workbench.Ask lists: anything else posted to this page isn't the bridge's.
            const ask = Workbench.Ask.safeParse(event.data)

            if (!ask.success)
                return

            void handleWorkbenchEvent(ask.data).then(result => {
                const answer: Workbench.Answer = { type: 'quarry:answer', id: ask.data.id, result }

                frame.contentWindow?.postMessage(answer, origin)
            })
        }

        frame.addEventListener('load', hello)
        window.addEventListener('message', onMessage)

        return () => {
            frame.removeEventListener('load', hello)
            window.removeEventListener('message', onMessage)

            if (this.sdk.runtime.workbench === workbench)
                this.sdk.runtime.workbench = null
        }
    }

    /**
     * One of the extension's commands, executed in the connected IDE as if its button there were clicked — Preview
     * and Build open their pickers in the editor. Resolves once the command has finished; a failure is shown here.
     */
    public async execute(command: Workbench.Execute['command']): Promise<void> {
        const workbench = this.sdk.runtime.workbench

        if (!workbench)
            return

        const request: Workbench.Execute = { type: 'quarry:execute', id: crypto.randomUUID(), command }

        // The picker opens in the iframe: give it the keyboard.
        workbench.frame.focus()

        const executed = await new Promise<Workbench.Executed>(resolve => {
            workbench.executing[request.id] = resolve
            workbench.frame.contentWindow?.postMessage(request, workbench.origin)
        })

        if (executed.error) {
            this.log.error('execute failed', { command, error: executed.error })
            NotificationSDK.toast.error(`Couldn't run ${command} in the editor`, { description: executed.error })
        }
    }
}
