import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LineageRepository } from './lineage.repository';
import { LineageService } from './lineage.service';
import { ResourceRepository } from './resource.repository';

@Module({
    providers: [LibraryService, ResourceRepository, LineageService, LineageRepository],
    // ResourceRepository: for services creating or trashing their resources' library rows in their own transaction (@EnsureResource).
    exports:   [LibraryService, ResourceRepository],
})
export class LibraryModule {}
