import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { ResourceRepository } from './resource.repository';

@Module({
    providers: [LibraryService, ResourceRepository],
    // ResourceRepository: for services creating or trashing their resources' library rows in their own transaction (@EnsureResource).
    exports:   [LibraryService, ResourceRepository],
})
export class LibraryModule {}
