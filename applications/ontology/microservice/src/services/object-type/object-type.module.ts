import { Module } from '@nestjs/common';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { GatekeeperModule } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { ObjectTypeRepository } from './object-type.repository';
import { ObjectTypeService } from './object-type.service';

/** Object types, checked against their backing datasets' schemas (Catalog's). */
@Module({
    imports:   [LibraryModule, GatekeeperModule],
    providers: [ObjectTypeService, ObjectTypeRepository, CatalogClient],
    exports:   [ObjectTypeService],
})
export class ObjectTypeModule {}
