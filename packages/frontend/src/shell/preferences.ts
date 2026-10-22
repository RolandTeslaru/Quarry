// The viewer's shell preferences, kept per browser. Storage can be unavailable
// (private window, blocked site data): reads fall back to a default and writes
// last until reload.

const EXPANDED_KEY = 'quarry.workspace-sidebar.expanded'
const THEME_KEY = 'quarry.theme'

export type Theme = 'light' | 'dark'

/** Whether the workspace sidebar is expanded; expanded unless the viewer collapsed it. */
export function readSidebarExpanded(): boolean {
    try {
        return localStorage.getItem(EXPANDED_KEY) !== 'false'
    } catch {
        return true
    }
}

export function writeSidebarExpanded(expanded: boolean): void {
    write(EXPANDED_KEY, String(expanded))
}

/** The chosen theme; until one is chosen, the operating system's. */
export function readTheme(): Theme {
    try {
        const stored = localStorage.getItem(THEME_KEY)

        if (stored === 'light' || stored === 'dark')
            return stored
    } catch {
        // Fall through to the system preference.
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function writeTheme(theme: Theme): void {
    write(THEME_KEY, theme)
}

/** Switches the page: standard-ui and Tailwind read `.dark` on <html>, Blueprint reads `.bp6-dark`. */
export function applyTheme(theme: Theme): void {
    const dark = theme === 'dark'

    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = theme
    document.body.classList.toggle('bp6-dark', dark)
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // Storage unavailable: the choice lasts until reload.
    }
}
