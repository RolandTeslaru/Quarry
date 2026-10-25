/** What VS Code gives a webview's page: messages to the extension, and state that survives being hidden. */
interface VsCodeApi {
    postMessage(message: unknown): void
    getState(): unknown
    setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

/** Callable once per page — every webview module shares this one. */
export const vscode: VsCodeApi = acquireVsCodeApi()
