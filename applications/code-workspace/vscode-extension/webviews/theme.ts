/**
 * standard-ui's dark mode is a `dark` class on <html>; VS Code marks the
 * webview's <body> with `vscode-dark` / `vscode-high-contrast` and changes it
 * live when the user switches theme — follow it.
 */
export function followVsCodeTheme(): void {
    const apply = () => {
        const dark = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')

        document.documentElement.classList.toggle('dark', dark)
    }

    apply()
    new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] })
}
