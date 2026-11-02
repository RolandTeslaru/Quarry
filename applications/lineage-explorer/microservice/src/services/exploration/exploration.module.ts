import { Module } from '@nestjs/common';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { ExplorationRepository } from './exploration.repository';
import { ExplorationService } from './exploration.service';

/** Saved explorations, and their graphs from the Library. */
@Module({
    imports:   [LibraryModule],
    providers: [ExplorationService, ExplorationRepository],
    exports:   [ExplorationService],
})
export class ExplorationModule {}
