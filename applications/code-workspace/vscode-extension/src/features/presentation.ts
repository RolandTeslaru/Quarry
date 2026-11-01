import type { Library } from '@quarry/shared/domain'

/** Each resource type's codicon (the icons in VS Code's `$(name)` syntax). */
export const TYPE_ICONS: Record<Library.Resource.Type, string> = {
    'project':    'repo',
    'folder':     'folder',
    'dataset':    'table',
    'source':     'database',
    'credential': 'key',
    'workspace':  'code',
}

export const TYPE_LABELS: Record<Library.Resource.Type, string> = {
    'project':    'project',
    'folder':     'folder',
    'dataset':    'dataset',
    'source':     'source',
    'credential': 'credential',
    'workspace':  'code workspace',
}
