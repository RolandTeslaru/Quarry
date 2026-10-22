import { useEffect, useState } from 'react'
import { getIconPaths, loadIconPaths } from './iconLoader'
import type { IconGrid, IconName } from './types'

interface IconLoadResult {
    key: string
    paths?: readonly string[]
    failed?: boolean
}

export function useIconPaths(name: IconName, grid: IconGrid) {
    const key = `${grid}:${name}`
    const [result, setResult] = useState<IconLoadResult>(() => ({
        key,
        paths: getIconPaths(name, grid),
    }))

    useEffect(() => {
        const cached = getIconPaths(name, grid)

        if (cached) {
            setResult(current => {
                if (current.key === key && current.paths === cached) {
                    return current
                }

                return { key, paths: cached }
            })

            return
        }

        let active = true

        loadIconPaths(name, grid)
            .then(paths => {
                if (active) {
                    setResult({ key, paths })
                }
            })
            .catch(error => {
                console.error(`[standard-ui] Could not load Blueprint icon '${name}' (${grid}px).`, error)

                if (active) {
                    setResult({ key, failed: true })
                }
            })

        return () => {
            active = false
        }
    }, [name, grid, key])

    const current = result.key === key ? result : undefined
    const paths = current?.paths ?? getIconPaths(name, grid)

    return {
        paths,
        failed: current?.failed ?? false,
    }
}
