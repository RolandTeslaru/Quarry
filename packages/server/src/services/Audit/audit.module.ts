import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/**
 * Global: every service with an @Audit method, and Gatekeeper (denials), injects
 * AuditService. AuditRepository is exported too, for one thing: a resource's
 * `open` records inside its own transaction (`recordOpen` joins it). The
 * controller is registered by api.module.
 */
@Global()
@Module({
    providers: [AuditService, AuditRepository],
    exports:   [AuditService, AuditRepository],
})
export class AuditModule {}
