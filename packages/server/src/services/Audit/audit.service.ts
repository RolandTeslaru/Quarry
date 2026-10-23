import { ForbiddenException, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { Audit, Platform } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { AuditRepository, type NewEvent } from './audit.repository';

/**
 * Who accessed what, how and when. See docs/design/audit.md.
 *
 *   modify                  triggers on the written tables, in the write's transaction (audit/001_initial.sql)
 *   read, download, reveal  @Audit(action) on the service method → record()
 *   denied                  GatekeeperService.assert → recordDenied()
 *   open                    each resource's open (POST …/:rid/open) → AuditRepository.recordOpen, joining that read's transaction
 *
 * The system acting on its own (a service principal) records nothing.
 */
@Injectable()
export class AuditService {

    private readonly log = System.log.withContext('Audit');

    constructor(private readonly repository: AuditRepository) {}

    async record(principal: Principal, event: NewEvent): Promise<void> {
        if (principal.type === 'service')
            return;

        await this.repository.record(principal, event);
    }

    /**
     * A refusal, recorded in a transaction of its own — the caller's rolls back
     * with the exception it's about to throw. Never throws itself: the refusal
     * must still reach the caller.
     */
    async recordDenied(principal: Principal, resourceRid: string, action: string): Promise<void> {
        if (principal.type === 'service')
            return;

        try {
            await this.repository.record(principal, { resourceRid, action: 'denied', detail: { action } });
        }
        catch (error) {
            this.log.error('Could not record a denial', {
                resourceRid,
                action,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    recents(principal: Principal.User, query: { application: Platform.Application.Id; limit: number }): Promise<Audit.AccessEvent.Recent[]> {
        return this.repository.recents(principal, query);
    }

    /** Workspace admins only. */
    list(principal: Principal.User, filter: z.output<typeof Audit.API.AccessEvent.List.Request>): Promise<Audit.AccessEvent.Schema[]> {
        if (principal.workspaceRole !== 'admin')
            throw new ForbiddenException('Requires the workspace admin role');

        return this.repository.list(Principal.SELF('audit.list'), filter);
    }
}
