import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Audit, Identity, type Library, Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { defineDatabase } from '@/db/pool';
import { Repository, Transactional } from '@/db/repository';
import { json, type Table } from '@/db/table';
import { LibraryDB } from '@/services/Library/library.db';
import { isLive } from '@/db/liveness';

/** The `audit` schema: access events, append-only. Writes of other services' rows are recorded by triggers (audit/001_initial.sql). */
export namespace AuditDB {

    export namespace AccessEvent {
        export const Row = z.object({
            id:             z.coerce.number().int(),          // bigint — node-postgres returns it as text
            at:             z.date(),
            user_rid:       z.string(),
            via:            z.string().nullable(),
            resource_rid:   z.string(),
            resource_type:  z.string(),
            action:         Audit.AccessEvent.Action,
            application_id: Platform.Application.Id.nullable(),
            detail:         z.record(z.string(), z.unknown()),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row): Audit.AccessEvent.Schema => Audit.AccessEvent.Schema.parse({
            id:            row.id,
            at:            row.at,
            userRid:       row.user_rid,
            via:           row.via,
            resourceRid:   row.resource_rid,
            resourceType:  row.resource_type,
            action:        row.action,
            applicationId: row.application_id,
            detail:        row.detail,
        });
    }

    export interface Tables {
        'audit.access_event': Table<typeof AccessEvent.Row, 'id' | 'at' | 'via' | 'application_id' | 'detail'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables>();
}

/** One event to record: the resource, by RID and its type segment; the actor comes from the principal. */
export interface NewEvent {
    resourceRid:    string;
    action:         Exclude<Audit.AccessEvent.Action, 'open' | 'modify'>;     // open has its own method; modify is the triggers'
    detail?:        Record<string, unknown>;
}

/** A RID's type segment — `ri.<service>.<instance>.<type>.<id>`; Library keeps it = the resource's type. */
const typeOf = (rid: string) => rid.split('.')[3] ?? 'unknown';

@Injectable()
export class AuditRepository extends Repository(AuditDB.database) {

    /**
     * As the user (or delegate): RLS lets them record only as themselves. The
     * event is a payload, not a top-level RID, so @Transactional doesn't ask
     * whether the resource is live — a denial of a trashed one is still recorded.
     */
    @Transactional('user', 'delegate')
    async record(principal: Principal.User | Principal.Delegate, event: NewEvent): Promise<void> {
        await this.trx
            .insertInto('audit.access_event')
            .values({
                user_rid:      principal.userRid,
                via:           principal.type === 'delegate' ? principal.via : null,
                resource_rid:  event.resourceRid,
                resource_type: typeOf(event.resourceRid),
                action:        event.action,
                detail:        json(event.detail ?? {}),
            })
            .execute();
    }

    /**
     * An app opened this resource's page. Called by the owning repository's
     * `open`, inside its transaction — it joins it, so the page's data and its
     * open commit together, or neither.
     */
    @Transactional('user')
    async recordOpen(principal: Principal.User, opened: {
        rid:         Library.Resource.Rid;
        type:        Library.Resource.Type;
        application: Platform.Application.Id;
    }): Promise<void> {
        await this.trx
            .insertInto('audit.access_event')
            .values({
                user_rid:       principal.userRid,
                resource_rid:   opened.rid,
                resource_type:  opened.type,
                action:         'open',
                application_id: opened.application,
            })
            .execute();
    }

    /**
     * The user's latest open per resource in one app, newest first — only live
     * resources they can still discover (RLS on library.resource), with their
     * parent's name when that's visible too.
     */
    @Transactional('user')
    async recents(principal: Principal.User, query: { application: Platform.Application.Id; limit: number }): Promise<Audit.AccessEvent.Recent[]> {
        const latest = this.trx
            .selectFrom('audit.access_event')
            .distinctOn('resource_rid')
            .select(['resource_rid', 'at'])
            .where('user_rid', '=', principal.userRid)
            .where('application_id', '=', query.application)
            .where('action', '=', 'open')
            .orderBy('resource_rid')
            .orderBy('at', 'desc')
            .as('latest');

        const rows = await this.trx
            .selectFrom(latest)
            .innerJoin('library.resource as r', 'r.rid', 'latest.resource_rid')
            .leftJoin('library.resource as parent', 'parent.rid', 'r.parent_rid')
            .selectAll('r')
            .select(['latest.at as opened_at', 'parent.name as parent_name'])
            .where(isLive('r.rid'))
            .orderBy('latest.at', 'desc')
            .limit(query.limit)
            .execute();

        return rows.map((row) => Audit.AccessEvent.Recent.parse({
            resource:   LibraryDB.Resource.toBase(LibraryDB.Resource.Row.parse(row)),
            parentName: row.parent_name,
            openedAt:   row.opened_at,
        }));
    }

    /** Admins' view of the log: filtered, newest first, paged by id. The service checks the caller is an admin. */
    @Transactional('service')
    async list(_principal: Principal.Service, filter: {
        resourceRid?: string;
        userRid?:     Identity.User.Rid | string;
        action?:      Audit.AccessEvent.Action;
        from?:        Date;
        to?:          Date;
        before?:      number;
        limit:        number;
    }): Promise<Audit.AccessEvent.Schema[]> {
        let query = this.trx.selectFrom('audit.access_event').selectAll();

        if (filter.resourceRid) query = query.where('resource_rid', '=', filter.resourceRid);
        if (filter.userRid)     query = query.where('user_rid', '=', filter.userRid);
        if (filter.action)      query = query.where('action', '=', filter.action);
        if (filter.from)        query = query.where('at', '>=', filter.from);
        if (filter.to)          query = query.where('at', '<', filter.to);
        if (filter.before)      query = query.where('id', '<', filter.before);

        const rows = await query.orderBy('id', 'desc').limit(filter.limit).execute();

        return rows.map((row) => AuditDB.AccessEvent.toDomain(AuditDB.AccessEvent.Row.parse(row)));
    }
}
