import type { IncomingMessage } from 'node:http';
import type { OnModuleDestroy } from '@nestjs/common';
import { type OnGatewayConnection, type OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { CodeWorkspace, DataConnection, Forge, Identity, Realtime } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { RequestIdentity } from '@quarry/platform-kernel/auth/request-identity';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { redisSubscriber } from '@quarry/platform-kernel/infra/redis';
import { ForgeClient } from '@quarry/platform-kernel/microservice/clients';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';

const log = System.log.withContext('Realtime');

/**
 * The browser's live connection (after PretzelGraph's RealtimeGateway): one
 * WebSocket at /socket, authenticated by `?token=<GoTrue JWT>`. A client sends
 * `{ action: 'subscribe' | 'unsubscribe', channel }`; Redis messages on its
 * channels are relayed to it.
 *
 * Unlike PretzelGraph, every subscribe is authorized: a channel names what it's
 * about, and the user must be able to see that — discover on a resource's
 * channel, see a build (discover on one of its targets), or be the owner of a
 * personal channel. Unknown channels are refused.
 */
@WebSocketGateway({ path: '/socket' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {

    private readonly redis = redisSubscriber();

    private readonly subscriptions = new Map<Realtime.Channel, Set<WebSocket>>();

    private readonly principals = new WeakMap<WebSocket, Principal.User>();

    /** The token each socket connected with — what a microservice call made for it acts with. */
    private readonly tokenOf = new WeakMap<WebSocket, string>();

    constructor(
        private readonly tokens:     TokenVerifier,
        private readonly gatekeeper: GatekeeperService,
        private readonly forge:      ForgeClient,
    ) {
        this.redis.on('message', (channel: string, message: string) => {
            for (const socket of this.subscriptions.get(Realtime.Channel.parse(channel)) ?? []) {
                if (socket.readyState === WebSocket.OPEN)
                    socket.send(message);
            }
        });
    }

    async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
        // Messages can arrive while the token is checked: hold them until it's done.
        const pending: string[] = [];
        let authenticated = false;

        socket.on('message', (data) => {
            const raw = data.toString();

            if (!authenticated) {
                pending.push(raw);

                return;
            }

            void this.handleMessage(socket, raw);
        });

        const token = new URL(request.url ?? '', 'http://socket').searchParams.get('token');

        if (!token) {
            socket.close(1008, 'Missing token');

            return;
        }

        try {
            this.principals.set(socket, await this.tokens.user(token));
            this.tokenOf.set(socket, token);
        }
        catch {
            socket.close(1008, 'Invalid token, or not a member of this workspace');

            return;
        }

        authenticated = true;

        for (const raw of pending)
            void this.handleMessage(socket, raw);
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit();
    }

    handleDisconnect(socket: WebSocket): void {
        for (const channel of [...this.subscriptions.keys()])
            this.remove(socket, channel);
    }

    private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
        let message: Realtime.ClientMessage;

        try {
            message = Realtime.ClientMessage.parse(JSON.parse(raw));
        }
        catch {
            log.warning('Ignored a malformed socket message');

            return;
        }

        if (message.action === 'unsubscribe') {
            this.remove(socket, message.channel);

            return;
        }

        await this.subscribe(socket, message.channel);
    }

    private async subscribe(socket: WebSocket, channel: Realtime.Channel): Promise<void> {
        const principal = this.principals.get(socket);

        // As on a request: a microservice call the check makes acts with the socket's own token.
        const allowed = principal && await RequestIdentity.run({ userRid: principal.userRid, token: this.tokenOf.get(socket)! }, () => this.mayListen(principal, channel));

        if (!allowed) {
            const refusal: Realtime.Event.Forbidden = { channel, type: 'forbidden', message: 'Not allowed on this channel' };

            socket.send(JSON.stringify(refusal));

            return;
        }

        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
            void this.redis.subscribe(channel);
        }

        this.subscriptions.get(channel)!.add(socket);
    }

    /** Whether this user may hear what a channel carries. Each channel type names its resource or owner. */
    private async mayListen(principal: Principal.User, channel: Realtime.Channel): Promise<boolean> {
        const sourceRid = DataConnection.Event.sourceOf(channel);

        if (sourceRid)
            return this.gatekeeper.can(principal, 'discover', sourceRid);

        const workspaceRid = CodeWorkspace.Event.workspaceOf(channel);

        if (workspaceRid)
            return this.gatekeeper.can(principal, 'read', workspaceRid);

        const buildRid = Forge.Event.buildOf(channel);

        if (buildRid)
            return this.maySeeBuild(principal, buildRid);

        const userRid = Identity.Event.userOf(channel);

        if (userRid)
            return userRid === principal.userRid;

        return false;
    }

    /** A build isn't a library resource: whether the user sees it is Forge's call (RLS on forge.build), a microservice call. */
    private async maySeeBuild(principal: Principal.User, buildRid: Forge.Build.Rid): Promise<boolean> {
        return this.forge.getBuild(principal, { rid: buildRid }).then(() => true, () => false);
    }

    private remove(socket: WebSocket, channel: Realtime.Channel): void {
        const sockets = this.subscriptions.get(channel);

        if (!sockets)
            return;

        sockets.delete(socket);

        if (sockets.size === 0) {
            this.subscriptions.delete(channel);
            void this.redis.unsubscribe(channel);
        }
    }
}
