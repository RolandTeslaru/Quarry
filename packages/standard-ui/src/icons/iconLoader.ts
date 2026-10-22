import { iconLoaders } from './loaders'
import type { IconGrid, IconName } from './types'

const loadedPaths = new Map<string, readonly string[]>()
const pendingPaths = new Map<string, Promise<readonly string[]>>()

export function isIconName(name: string): name is IconName {
    return Object.hasOwn(iconLoaders, name)
}

export function getIconPaths(name: IconName, grid: IconGrid): readonly string[] | undefined {
    return loadedPaths.get(`${grid}:${name}`)
}

export function loadIconPaths(name: IconName, grid: IconGrid): Promise<readonly string[]> {
    const key = `${grid}:${name}`
    const loaded = loadedPaths.get(key)

    if (loaded) {
        return Promise.resolve(loaded)
    }

    const pending = pendingPaths.get(key)

    if (pending) {
        return pending
    }

    const request = iconLoaders[name][grid]()
        .then(module => {
            loadedPaths.set(key, module.default)
            return module.default
        })
        .finally(() => {
            pendingPaths.delete(key)
        })

    pendingPaths.set(key, request)

    return request
}
