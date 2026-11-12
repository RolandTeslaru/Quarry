import { Module } from '@nestjs/common';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { GatekeeperModule } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { ObjectTypeModule } from '../object-type/object-type.module';
import { LinkTypeRepository } from './link-type.repository';
import { LinkTypeService } from './link-type.service';

/** Link types, checked against the object types they name and their join datasets' schemas (Catalog's). */
@Module({
    imports:   [LibraryModule, GatekeeperModule, ObjectTypeModule],
    providers: [LinkTypeService, LinkTypeRepository, CatalogClient],
    exports:   [LinkTypeService],
})
export class LinkTypeModule {}
