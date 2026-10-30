import { Module } from '@nestjs/common';
import { PreviewController } from './preview.controller';
import { RuntimeController } from './runtime.controller';

@Module({
    controllers: [RuntimeController, PreviewController],
})
export class RuntimeModule {}
