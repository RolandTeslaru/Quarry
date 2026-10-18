import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { ResourceRepository } from './resource.repository';

@Module({
    providers: [LibraryService, ResourceRepository],
    exports:   [LibraryService],
})
export class LibraryModule {}
