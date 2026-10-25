/** A workspace's tabs — each a route under routes/$rid/. */
export type WorkspaceTab = 'code' | 'branches' | 'checks' | 'pull-requests' | 'settings'

/** Every tab, by id, in the order the header shows them. */
export const WORKSPACE_TABS = {
    'code':          { label: 'Code',          to: '/code-workspaces/$rid' },
    'branches':      { label: 'Branches',      to: '/code-workspaces/$rid/branches' },
    'checks':        { label: 'Checks',        to: '/code-workspaces/$rid/checks' },
    'pull-requests': { label: 'Pull Requests', to: '/code-workspaces/$rid/pull-requests' },
    'settings':      { label: 'Settings',      to: '/code-workspaces/$rid/settings' },
} as const satisfies Record<WorkspaceTab, { label: string; to: string }>
