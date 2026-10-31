import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { CodeWorkspace, type Identity } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { DockerDriver } from './docker-driver';
import { Session } from './domain/Session';
import { config } from './config';
import { api } from '@quarry/shared/server/internal-api';

/** The IDE's port in the IDE image (docker/code-workspace-ide). */
const IDE_PORT = 3000;

/** Where a session's working copy is, in its container. */
const REPOSITORY = '/workspace/repo';

const IDLE_CHECK_INTERVAL_MS = 60_000;

/** Waiting for VS Code to answer after the container starts. */
const IDE_READY_TIMEOUT_MS = 60_000;

/** Clone, venv and `uv sync` — minutes on a cold cache. */
const SETUP_TIMEOUT_MS = 300_000;



/**
 * Code Workspace sessions (docs/design/transforms.md §6): one container per
 * user per workspace, from the IDE image, with a volume for the working
 * copy. Started on open, stopped when idle, started again on the next open.
 * The IDE proxy serves each one's IDE at `/s/<secret>/`; previews run in it,
 * started by the Quarry extension. Containers are labelled, so a restarted
 * worker finds its sessions again.
 */
@Injectable()
export class SessionManager implements OnModuleInit, OnModuleDestroy {

    private readonly log = System.log.withContext('SessionManager');

    private readonly byKey: Record<Session.Key, Session.Schema> = {};

    private readonly bySecret: Record<Session.Secret, Session.Schema> = {};

    /** Opens in flight — a second open of the same session waits for the first. */
    private readonly opening: Partial<Record<Session.Key, Promise<string>>> = {};

    private idleTimer: ReturnType<typeof setInterval> | undefined;

    constructor(private readonly dockerDriver: DockerDriver) {}

    public async onModuleInit(): Promise<void> {
        await this.restore();

        this.idleTimer = setInterval(() => void this.stopIdle(), IDLE_CHECK_INTERVAL_MS);
    }

    public onModuleDestroy(): void {
        clearInterval(this.idleTimer);
    }

    /** Starts or reuses the session; refreshes its credential; the IDE's URL. */
    public open(workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): Promise<string> {
        const key = Session.getKey(workspaceRid, userRid);

        const opening = (this.opening[key] ??= this.openNow(workspaceRid, userRid).finally(() => {
            delete this.opening[key];
        }));

        return opening;
    }

    /**
     * Replaces the session's container with a fresh one from the current IDE image — after an
     * image rebuild, or when the container is wedged. The volume (the working copy) stays. Waits for
     * opens in flight; opens arriving meanwhile wait for the restart.
     */
    public async restart(workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): Promise<string> {
        const key = Session.getKey(workspaceRid, userRid);

        let opening: Promise<string> | undefined;

        while ((opening = this.opening[key]))
            await opening.catch(() => undefined);

        const restarting = (this.opening[key] = this.restartNow(workspaceRid, userRid).finally(() => {
            delete this.opening[key];
        }));

        return restarting;
    }

    /** The running session an IDE proxy request is for — and it was just used. */
    public touchBySecret(secret: string): { port: number } | null {
        const parsed = Session.Secret.safeParse(secret);
        const session = parsed.success ? this.bySecret[parsed.data] : undefined;

        if (!session?.port)
            return null;

        session.lastActivityAt = Date.now();

        return { port: session.port };
    }

    private async openNow(workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): Promise<string> {
        // The server re-checks the user may read the workspace before minting.
        const credentials = await CodeWorkspace.API.Internal.getSessionCredentials(api, { workspaceRid, userRid });
        const session = this.byKey[Session.getKey(workspaceRid, userRid)] ?? await this.create(workspaceRid, userRid);

        if (!session.port) {
            await this.dockerDriver.start(session.container);

            session.port = await this.dockerDriver.getHostPort(session.container, IDE_PORT);
        }

        await waitForIde(session);

        const setup = await this.dockerDriver.exec(session.container, ['quarry-session-setup'], {
            env: {
                QUARRY_TOKEN:         credentials.token,
                QUARRY_WORKSPACE_RID: workspaceRid,
                QUARRY_GIT_URL:       this.getGitUrl(workspaceRid),
                QUARRY_SERVER_URL:    config.sessions.serverUrl,
                QUARRY_APP_URL:       config.appUrl,
                QUARRY_USER_NAME:     credentials.user.name,
                QUARRY_USER_EMAIL:    credentials.user.email,
            },
            timeoutMs: SETUP_TIMEOUT_MS,
        });

        if (setup.code !== 0)
            throw new Error(`Setting up the session failed: ${setup.stderr.trim() || `exit ${setup.code}`}`);

        session.lastActivityAt = Date.now();

        this.log.info('Session opened', { workspaceRid, userRid, container: session.container });

        return `${config.ideProxyUrl}/s/${session.secret}/?tkn=${session.secret}`;
    }

    private async restartNow(workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): Promise<string> {
        const session = this.byKey[Session.getKey(workspaceRid, userRid)];

        if (session) {
            await this.dockerDriver.remove(session.container);

            this.unregister(session);

            this.log.info('Session removed for a restart', { workspaceRid, userRid, container: session.container });
        }

        return this.openNow(workspaceRid, userRid);
    }

    private async create(workspaceRid: CodeWorkspace.Rid, userRid: Identity.User.Rid): Promise<Session.Schema> {
        const name = Session.getContainerName(workspaceRid, userRid);
        const secret = Session.createSecret();

        await this.dockerDriver.run({
            name,
            image:  config.sessions.image,
            labels: Session.toLabels({ workspaceRid, userRid, secret }),
            env:    { QUARRY_SESSION_SECRET: secret },
            volume: { name, target: '/workspace' },
            port:   IDE_PORT,
            memory: config.sessions.memory,
            cpus:   config.sessions.cpus,
        });

        const session: Session.Schema = {
            workspaceRid,
            userRid,
            container:      name,
            secret,
            port:           await this.dockerDriver.getHostPort(name, IDE_PORT),
            lastActivityAt: Date.now(),
        };

        this.register(session);

        this.log.info('Session started', { workspaceRid, userRid, container: name });

        return session;
    }

    /** Sessions left by an earlier worker: running ones keep serving, stopped ones start on their next open. */
    private async restore(): Promise<void> {
        const containers = await this.dockerDriver.list(Session.LABEL);

        for (const container of containers) {
            const port = container.running ? await this.dockerDriver.getHostPort(container.name, IDE_PORT) : null;
            const session = Session.fromLabels(container, port);

            if (session)
                this.register(session);
        }

        if (containers.length > 0)
            this.log.info('Sessions restored', { count: containers.length });
    }

    private async stopIdle(): Promise<void> {
        const idleSince = Date.now() - config.sessions.idleMs;

        for (const session of Object.values(this.byKey)) {
            if (!session.port || session.lastActivityAt > idleSince)
                continue;

            try {
                await this.dockerDriver.stop(session.container);

                session.port = null;

                this.log.info('Session stopped (idle)', { workspaceRid: session.workspaceRid, container: session.container });
            }
            catch (error) {
                this.log.warning('Stopping an idle session failed', {
                    container: session.container,
                    error:     error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    private register(session: Session.Schema): void {
        this.byKey[Session.getKey(session.workspaceRid, session.userRid)] = session;
        this.bySecret[session.secret] = session;
    }

    private unregister(session: Session.Schema): void {
        delete this.byKey[Session.getKey(session.workspaceRid, session.userRid)];
        delete this.bySecret[session.secret];
    }

    private getGitUrl(workspaceRid: CodeWorkspace.Rid): string {
        return `${config.sessions.serverUrl}/api/git/${workspaceRid}.git`;
    }
}

/** Until VS Code answers on the session's path — any HTTP answer will do. */
async function waitForIde(session: Session.Schema): Promise<void> {
    const deadline = Date.now() + IDE_READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
        try {
            await fetch(`http://127.0.0.1:${session.port}/s/${session.secret}/`, { redirect: 'manual' });

            return;
        }
        catch {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    throw new Error(`The IDE in ${session.container} didn't start`);
}
