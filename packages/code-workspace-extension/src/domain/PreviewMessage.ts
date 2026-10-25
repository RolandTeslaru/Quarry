import type { CodeWorkspace, CodeTransform } from '@quarry/shared/domain'

/**
 * What the Preview panel's page (webviews/preview) and the extension
 * (features/preview-view.ts) say to each other. The page imports this file
 * too, so it must not import `vscode`.
 */
export namespace PreviewMessage {

    /** A reference (`Input("…")` / `Output("…")`) as people read it: the dataset's name, and where it lives. */
    export interface Label {
        readonly name:     string
        readonly location: string | null
    }

    /** The transform being previewed — what it declares, and its references' labels, by reference. */
    interface Run {
        transform: CodeTransform.Schema
        labels:    Record<string, Label>
    }

    /** Extension → page. */
    export type ToPage =
        | Run & { type: 'running' }
        | Run & { type: 'result'; result: CodeWorkspace.Preview.Result }
        | Run & { type: 'failed'; message: string }          // the run itself failed — not the transform raising
        | Run & { type: 'stopped' }

    const TO_PAGE: Record<ToPage['type'], true> = { running: true, result: true, failed: true, stopped: true }

    /** Whether a `message` event's data is the extension's — a page also hears others (VS Code's own, browser extensions'). */
    export const isToPage = (data: unknown): data is ToPage => {
        const message = data as Partial<Record<'type' | 'transform' | 'labels', unknown>> | null

        return typeof message === 'object' && message !== null
            && typeof message.type === 'string' && message.type in TO_PAGE
            && typeof message.transform === 'object' && message.transform !== null
            && typeof message.labels === 'object' && message.labels !== null
    }

    /** Page → extension. */
    export type ToExtension =
        | { type: 'ready' }
        | { type: 'rerun' }
        | { type: 'stop' }
}
