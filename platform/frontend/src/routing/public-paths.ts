const PUBLIC_PATHS = new Set(['/', '/auth', '/playground', '/playground/standard', '/playground/blueprint'])

export function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.has(pathname)
}

export function isPlaygroundPath(pathname: string): boolean {
    return pathname === '/playground' || pathname === '/playground/standard' || pathname === '/playground/blueprint'
}
