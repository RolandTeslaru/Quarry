import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { DataConnection } from '@quarry/shared/domain';
import { findDefinition } from '@quarry/integrations/definitions';

/** What a sync of this source can copy — its integration's sync definition. */
export function syncDefinition(source: DataConnection.Source) {
    const definition = findDefinition(source.definitionId);

    if (!definition)
        throw new BadRequestException(`Unknown source type '${source.definitionId}'`);

    return definition.sync;
}

/** A new sync's config, parsed (defaults applied) against its integration's sync Config. */
export function validateSyncConfig(source: DataConnection.Source, config: DataConnection.Sync.Config): DataConnection.Sync.Config {
    const parsed = syncDefinition(source).Config.safeParse(config);

    if (!parsed.success)
        throw new BadRequestException(`Invalid sync config: ${z.prettifyError(parsed.error)}`);

    return parsed.data as DataConnection.Sync.Config;
}
