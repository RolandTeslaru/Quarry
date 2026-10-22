const EXPANDED_KEY = 'quarry.workspace-sidebar.expanded'

/** Whether the workspace sidebar is expanded; expanded unless the viewer collapsed it. */
export function readSidebarExpanded(): boolean {
    try {
        return localStorage.getItem(EXPANDED_KEY) !== 'false'
    } catch {
        return true
    }
}

export function writeSidebarExpanded(expanded: boolean): void {
    try {
        localStorage.setItem(EXPANDED_KEY, String(expanded))
    } catch {
        // Storage unavailable (private window, blocked site data): the choice lasts until reload.
    }
}
