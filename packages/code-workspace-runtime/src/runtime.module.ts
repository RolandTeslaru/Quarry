import { Module } from '@nestjs/common';
import { RuntimeController } from './runtime.controller';

@Module({
    controllers: [RuntimeController],
})
export class RuntimeModule {}
