import { Module } from '@nestjs/common';
import { ForgeClient } from '@quarry/platform-kernel/microservice/clients';
import { SourceModule } from '../source/source.module';
import { DataConnectionService } from './data-connection.service';

/** What crosses Data Connection's concepts; a job's checks are Forge's (ForgeClient). Its controller is registered by microservice.module. */
@Module({
    imports:   [SourceModule],
    providers: [DataConnectionService, ForgeClient],
    exports:   [DataConnectionService],
})
export class DataConnectionModule {}
