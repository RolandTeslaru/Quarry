import { spawn } from 'node:child_process'
import { StdioClient } from '@quarry/shared/server/stdio/stdio-client'

/** Where the IDE image puts the bundled runtime (docker/code-workspace-ide/Dockerfile). */
const RUNTIME = '/opt/quarry/runtime/runtime.js'

/**
 * The code-workspace runtime, in this session's container (docs/design/forge-runtimes.md, phase 5): started on
 * first use with the extension host's own Node, kept while the IDE is open, started again if it exits. It ends
 * with the extension host — its stdin closes.
 */
class SessionRuntime {

    private client: Promise<StdioClient> | null = null

    public get(): Promise<StdioClient> {
        this.client ??= this.start()

        return this.client
    }

    private async start(): Promise<StdioClient> {
        const runtime = spawn(process.execPath, [RUNTIME], { stdio: ['pipe', 'pipe', 'inherit'] })

        runtime.on('exit', () => {
            this.client = null
        })

        const client = new StdioClient(runtime, () => undefined)

        await client.waitUntilReady('code-workspace')

        return client
    }
}

export const sessionRuntime = new SessionRuntime()
