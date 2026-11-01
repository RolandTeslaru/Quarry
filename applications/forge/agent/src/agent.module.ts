import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { ForgeMicroserviceAPIClient } from './clients/forge-microservice-api.client';
import { HealthController } from './controllers/http.controller';
import { JobContainers } from './run-job/job-containers';
import { RunJobProcessor } from './run-job/run-job.processor';

/**
 * The ForgeAgent: consumes forge.run-job and reports to the Forge microservice's ForgeAgent
 * API. No database — Forge does every Postgres write.
 */
@Module({
    imports: [
        BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection(), prefix: QUEUE_PREFIX }) }),
        BullModule.registerQueue({ name: Forge.Queue.RunJob.Definition.name }),
    ],
    controllers: [HealthController],
    providers:   [ForgeMicroserviceAPIClient, JobContainers, RunJobProcessor],
})
export class AgentModule {}
