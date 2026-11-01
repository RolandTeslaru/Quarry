/** `import styles from '….css?inline'`: the stylesheet as a string (Vite; the extension's webview build does the same). */
declare module '*.css?inline' {
    const css: string
    export default css
}
