import { Global, Module } from '@nestjs/common';
import { Audit } from '@quarry/shared/domain';
import { DurableModule } from '@quarry/platform-kernel/infra/durable';
import { AuditRelayMiddleware } from './audit-relay';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/**
 * Global: every service with an @Audit method, and Gatekeeper (denials), injects
 * AuditService. AuditRepository is exported too, for one thing: a resource's
 * `open` records inside its own transaction (`recordOpen` joins it). Every server that
 * records applies AuditRelayMiddleware, which relays its records once a request has answered. The
 * controller is registered by main-server.module.
 */
// Exported with the module: the app's own scope builds AuditRelayMiddleware, and it needs the queue's handle.
const recordQueue = DurableModule.registerQueue(Audit.DurableQueue.Record);

@Global()
@Module({
    imports:   [recordQueue],
    providers: [AuditService, AuditRepository, AuditRelayMiddleware],
    exports:   [AuditService, AuditRepository, AuditRelayMiddleware, recordQueue],
})
export class AuditModule {}
