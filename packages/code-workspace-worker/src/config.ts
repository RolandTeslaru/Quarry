// load-env first: it loads .env before this reads it.
import './load-env';
import { z } from 'zod';

/** The code workspace worker's settings in the environment (.env.example) — with their defaults. */
const Env = z.object({
    CODE_WORKSPACE_WORKER_PORT:          z.coerce.number().int().positive().default(4104),
    CODE_WORKSPACE_IDE_PROXY_PORT:       z.coerce.number().int().positive().default(4103),
    CODE_WORKSPACE_IDE_PROXY_URL:        z.url(),
    CODE_WORKSPACE_APP_URL:              z.url().default('http://127.0.0.1:5173'),
    CODE_WORKSPACE_RUNTIME_IMAGE:        z.string().min(1).default('quarry/code-workspace-runtime:dev'),
    CODE_WORKSPACE_SESSION_SERVER_URL:   z.url().default('http://host.docker.internal:4000'),
    CODE_WORKSPACE_SESSION_IDLE_MINUTES: z.coerce.number().positive().default(30),
    CODE_WORKSPACE_SESSION_MEMORY:       z.string().regex(/^\d+[kmg]$/i, 'a size like 4g').default('4g'),
    CODE_WORKSPACE_SESSION_CPUS:         z.coerce.number().positive().default(2),
});

/** Read once, at startup: a bad value stops the boot with what's wrong, rather than misbehaving later. */
function load() {
    const parsed = Env.safeParse(process.env);

    if (!parsed.success)
        throw new Error(`Invalid code workspace worker settings:\n${z.prettifyError(parsed.error)}`);

    const env = parsed.data;

    return {
        /** The worker's own API — /sessions for the server (service token), /health. Never published to browsers. */
        port:         env.CODE_WORKSPACE_WORKER_PORT,
        /** The IDE proxy's port — the only one browsers reach. */
        ideProxyPort: env.CODE_WORKSPACE_IDE_PROXY_PORT,
        /** Where browsers reach the IDE proxy. */
        ideProxyUrl:  env.CODE_WORKSPACE_IDE_PROXY_URL.replace(/\/$/, ''),
        /** Where browsers reach Quarry itself — the extension's "open in Quarry" links. */
        appUrl:       env.CODE_WORKSPACE_APP_URL.replace(/\/$/, ''),

        sessions: {
            image:     env.CODE_WORKSPACE_RUNTIME_IMAGE,
            /** The server as session containers reach it — for git and previews' reads. */
            serverUrl: env.CODE_WORKSPACE_SESSION_SERVER_URL.replace(/\/$/, ''),
            /** A session unused this long is stopped. */
            idleMs:    env.CODE_WORKSPACE_SESSION_IDLE_MINUTES * 60_000,
            memory:    env.CODE_WORKSPACE_SESSION_MEMORY,
            cpus:      env.CODE_WORKSPACE_SESSION_CPUS,
        },
    };
}

export const config = load();
