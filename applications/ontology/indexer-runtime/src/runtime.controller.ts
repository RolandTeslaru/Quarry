import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { Forge, Stdio } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';

/**
 * One object type's index (docs/design/ontology-indexer.md §6): its backing dataset read through the
 * job's signed input URLs, loaded by DuckDB into the version's table through a connection scoped to it.
 * The job's token is the runtime's own. The indexer commits the version with the job.
 */
@Controller()
export class RuntimeController {

    private readonly log = System.log.withContext('Run');

    @MessagePattern('run')
    public async run(@Payload() request: Forge.Runtime.Run.Request): Promise<Stdio.Payload<Forge.Runtime.Run.Response>> {
        const { job } = request;

        this.log.info(`Running ${job.rid} (attempt ${job.attempt})`);

        return {
            status:  'failed',
            failure: { message: 'The indexer runtime does nothing yet' },
        };
    }
}
