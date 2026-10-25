import * as fs from 'node:fs'
import axios, { isAxiosError, type AxiosInstance } from 'axios'
import * as vscode from 'vscode'
import { Library } from '@quarry/shared/domain'
import { Reference } from './domain/Reference'
import { SessionFile } from './domain/SessionFile'

/** How long a looked-up resource is reused while you type — renames and moves show after this. */
const CACHE_MS = 30_000

/** A reference's resource, with where it lives (`/Project/folder`). */
export interface ResolvedResource {
    readonly resource: Library.Resource.Base
    readonly location: string
}

/**
 * Quarry, as this session reaches it: the API client (with the session's token,
 * re-read whenever the setup rewrites its file) and lookups of what references
 * point to, cached briefly.
 */
export class Quarry implements vscode.Disposable {

    private session: SessionFile.Schema | null = null

    private api: AxiosInstance | null = null

    private readonly cache = new Map<string, { at: number; resolved: Promise<ResolvedResource | null> }>()

    private readonly watcher: fs.FSWatcher | null

    private readonly changed = new vscode.EventEmitter<void>()

    /** The session file changed — a new token, or the first one. */
    public readonly onDidChange = this.changed.event

    public constructor() {
        this.load()

        fs.mkdirSync(SessionFile.DIRECTORY, { recursive: true })

        this.watcher = fs.watch(SessionFile.DIRECTORY, (_event, file) => {
            if (file === SessionFile.FILE_NAME) {
                this.load()
                this.changed.fire()
            }
        })
    }

    public dispose(): void {
        this.watcher?.close()
        this.changed.dispose()
    }

    /** Whether the session has handed over its token yet. */
    public isConnected(): boolean {
        return this.api !== null
    }

    /** The resource's page in Quarry; Library sends it on to the app that opens it. */
    public getResourceUrl(rid: Library.Resource.Rid): vscode.Uri | null {
        return this.session ? vscode.Uri.parse(`${this.session.appUrl.replace(/\/$/, '')}/library/${rid}`) : null
    }

    /** What a reference points to — null if nothing's there, or the user can't see it. */
    public getResource(value: string): Promise<ResolvedResource | null> {
        const cached = this.cache.get(value)

        if (cached && Date.now() - cached.at < CACHE_MS)
            return cached.resolved

        const resolved = this.lookUp(value)

        this.cache.set(value, { at: Date.now(), resolved })

        // A failure isn't remembered: the next look tries again.
        resolved.catch(() => this.cache.delete(value))

        return resolved
    }

    private async lookUp(value: string): Promise<ResolvedResource | null> {
        const api = this.api

        if (!api)
            return null

        try {
            if (Reference.isRid(value)) {
                const { path } = await Library.API.Resource.path(api, Library.Resource.Rid.parse(value))
                const resource = path[path.length - 1]

                return resource ? { resource, location: Library.Resource.getPath(path.slice(0, -1)) } : null
            }

            const { resource } = await Library.API.Resource.getByPath(api, { path: value })
            const names = Library.Resource.parsePath(value)

            return { resource, location: `/${names.slice(0, -1).join('/')}` }
        }
        catch (error) {
            if (isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 400))
                return null

            throw error
        }
    }

    private load(): void {
        this.cache.clear()

        try {
            this.session = SessionFile.Schema.parse(JSON.parse(fs.readFileSync(SessionFile.getPath(), 'utf8')))
            this.api = axios.create({
                baseURL: this.session.serverUrl,
                headers: { authorization: `Bearer ${this.session.token}` },
            })
        }
        catch {
            this.session = null
            this.api = null
        }
    }
}
