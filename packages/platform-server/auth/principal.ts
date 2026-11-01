import { Identity } from '@quarry/shared/domain';

/**
 * Who is acting. Every repository method and every gated service method takes
 * one as its first argument, and services pass it on to the repositories they
 * call — `SELF` only where the system acts on its own.
 */
export namespace Principal {

    /** A workspace member, proven by a GoTrue JWT and an active identity.user row. */
    export interface User {
        readonly type:          'user';
        readonly userRid:       Identity.User.Rid;
        readonly workspaceRole: Identity.User.WorkspaceRole;
    }

    /**
     * Background work on behalf of a user — a sync run they triggered or
     * scheduled. Checked by Gatekeeper exactly as that user, so it can never do
     * more than they could; if they lose access, the work stops.
     */
    export interface Delegate {
        readonly type:    'delegate';
        readonly userRid: Identity.User.Rid;
        /** What is acting, e.g. `sync:<id>`. Audit only — never an access-control input. */
        readonly via:     string;
    }

    /** The system acting on its own: housekeeping, permission lookups. Bypasses Gatekeeper. */
    export interface Service {
        readonly type:   'service';
        readonly reason: string;
    }

    export const SELF = (reason: string): Service => ({ type: 'service', reason });

    export const delegate = (userRid: Identity.User.Rid, via: string): Delegate => ({ type: 'delegate', userRid, via });

    /** A delegate when there's a user to act for, otherwise the system. */
    export const onBehalfOf = (userRid: Identity.User.Rid | null, via: string): Delegate | Service =>
        userRid ? delegate(userRid, via) : SELF(via);

    /** Actor for `*_by` columns: the user (directly or through a delegate), null when the system acted. */
    export const actorOf = (principal: Principal): Identity.User.Rid | null =>
        principal.type === 'service' ? null : principal.userRid;
}
export type Principal = Principal.User | Principal.Delegate | Principal.Service;

declare module 'express' {
    interface Request {
        principal?: Principal.User;
    }
}
