import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import { CodeWorkspace } from '@quarry/shared/domain'

/**
 * What the session's setup (docker/code-workspace-ide/bin/quarry-session-setup)
 * hands the extension on every open: the session's token, its workspace, and where Quarry is.
 */
export namespace SessionFile {

    export const Schema = z.object({
        token:        z.string().min(1),
        workspaceRid: CodeWorkspace.Rid,
        /** The server, as this container reaches it. */
        serverUrl:    z.url(),
        /** Quarry in the browser — where "open in Quarry" goes. */
        appUrl:       z.url(),
    })
    export type Schema = z.infer<typeof Schema>

    export const DIRECTORY = path.join(os.homedir(), '.quarry')

    export const FILE_NAME = 'session.json'

    export const getPath = (): string => path.join(DIRECTORY, FILE_NAME)
}
