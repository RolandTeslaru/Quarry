import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import type { z } from 'zod'
import { Identity, Realtime } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { BaseSDK } from '../core/BaseSDK'
import { authClient } from '../AuthSDK/client'
import type { AuthSDKImpl } from '../AuthSDK/sdk'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

// Reconnecting backs off exponentially from 1 s to 30 s, plus up to 1 s of jitter.
const BASE_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000
const RECONNECT_JITTER_MS = 1_000

type Listener = (event: Realtime.Event) => void

/**
 * The browser's live connection (after PretzelGraph's RealtimeSDK): one
 * WebSocket to the server's /socket, authenticated with the session's token.
 * SDKs subscribe to channels and get each event on them; the server checks the
 * user may listen, and answers a refused channel with a `forbidden` event.
 * Reconnects with backoff, subscribing again to every channel still in use.
 */
@SDK('Realtime')
export class RealtimeSDKImpl extends BaseSDK<RealtimeSDK.State> {

    public readonly useStore: BaseSDK.Store<RealtimeSDK.State> = createWithEqualityFn(
        immer<RealtimeSDK.State>(() => ({
            isConnected: false,
        })),
        shallow,
    )

    private socket: WebSocket | null = null

    private readonly listeners = new Map<Realtime.Channel, Set<Listener>>()

    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    private reconnectAttempts = 0

    private intentionalClose = false

    /** The member's notification channel, while their session lasts. */
    private stopNotifications: (() => void) | null = null

    /**
     * Follows the auth session — call once at startup (main.tsx): connected,
     * with the member's own notifications shown as toasts, from session.onStart
     * to session.onEnd. AuthSDK comes from the SDK container, so neither module
     * imports the other.
     */
    public init(): () => void {
        return SDK.get<AuthSDKImpl>('Auth').observe({
            session: {
                onStart: member => this.startSession(member.rid),
                onEnd:   () => this.endSession(),
            },
        }, { immediate: true })
    }

    /** Opens the socket for the signed-in user; a second call replaces the connection (a new user, a new token). */
    public async connect(): Promise<void> {
        this.intentionalClose = false
        this.clearReconnect()
        this.closeSocket()

        const { data } = await authClient.getSession()
        const token = data.session?.access_token

        if (!token)
            return

        const socket = new WebSocket(`${socketUrl()}?token=${encodeURIComponent(token)}`)

        socket.onopen = () => {
            this.reconnectAttempts = 0

            this.setState(state => {
                state.isConnected = true
            })

            for (const channel of this.listeners.keys())
                this.send({ action: 'subscribe', channel })
        }

        socket.onclose = () => {
            this.setState(state => {
                state.isConnected = false
            })

            if (!this.intentionalClose)
                this.scheduleReconnect()
        }

        socket.onmessage = message => {
            this.dispatch(message.data)
        }

        this.socket = socket
    }

    /**
     * Listens to a channel until the returned function is called; the last listener leaving unsubscribes on the server.
     * Each event is parsed with the channel's `schema` first — JSON has no dates, so a `z.coerce.date()` field
     * arrives as a string until then — and one that doesn't fit is dropped, never handed on.
     */
    public subscribeToChannel<E extends Realtime.Event>(channel: Realtime.Channel, schema: z.ZodType<E>, listener: (event: E) => void): () => void {
        if (!this.listeners.has(channel)) {
            this.listeners.set(channel, new Set())
            this.send({ action: 'subscribe', channel })
        }

        const channelListener: Listener = event => {
            const parsed = schema.safeParse(event)

            if (!parsed.success) {
                console.warn(`[Realtime] Ignored an unexpected event on ${channel}`, parsed.error)

                return
            }

            listener(parsed.data)
        }

        this.listeners.get(channel)!.add(channelListener)

        return () => {
            const channelListeners = this.listeners.get(channel)

            if (!channelListeners)
                return

            channelListeners.delete(channelListener)

            if (channelListeners.size === 0) {
                this.listeners.delete(channel)
                this.send({ action: 'unsubscribe', channel })
            }
        }
    }

    private startSession(userRid: Identity.User.Rid): void {
        void this.connect()

        this.stopNotifications = this.subscribeToChannel(
            Identity.Event.getChannel(userRid),
            Identity.Event.Notification.Schema,
            notification => {
                NotificationSDK.toast[notification.level](notification.title, {
                    description: notification.description ?? undefined,
                })
            },
        )
    }

    private endSession(): void {
        this.stopNotifications?.()
        this.stopNotifications = null

        this.intentionalClose = true
        this.clearReconnect()
        this.closeSocket()
    }

    /** Session ended: close for good; channels belonged to that session. */
    public override cleanup(): void {
        this.intentionalClose = true
        this.clearReconnect()
        this.closeSocket()
        this.listeners.clear()
        this.reconnectAttempts = 0
        this.stopNotifications = null
    }

    private dispatch(raw: unknown): void {
        let event: Realtime.Event

        try {
            event = Realtime.Event.Base.loose().parse(JSON.parse(String(raw)))
        }
        catch {
            console.warn('[Realtime] Ignored a malformed message')

            return
        }

        if (event.type === 'forbidden') {
            console.warn(`[Realtime] Not allowed on ${event.channel}`)

            return
        }

        for (const listener of this.listeners.get(event.channel) ?? [])
            listener(event)
    }

    private send(message: Realtime.ClientMessage): void {
        // Not open yet: onopen subscribes to every channel in use.
        if (this.socket?.readyState === WebSocket.OPEN)
            this.socket.send(JSON.stringify(message))
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout)
            return

        const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS)
        const jitter = Math.random() * RECONNECT_JITTER_MS

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null
            this.reconnectAttempts++

            void this.connect()
        }, delay + jitter)
    }

    private clearReconnect(): void {
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout)

        this.reconnectTimeout = null
    }

    private closeSocket(): void {
        if (!this.socket)
            return

        this.socket.onclose = null
        this.socket.close()
        this.socket = null

        this.setState(state => {
            state.isConnected = false
        })
    }
}

/** The server's /socket: same origin in dev (Vite proxies it) unless VITE_API_URL names the API. */
function socketUrl(): string {
    const api = new URL(import.meta.env.VITE_API_URL || window.location.origin)
    const protocol = api.protocol === 'https:' ? 'wss:' : 'ws:'

    return `${protocol}//${api.host}/socket`
}

export const RealtimeSDK = SDK.get<RealtimeSDKImpl>('Realtime')

export namespace RealtimeSDK {

    export type State = {
        isConnected: boolean
    }
}
