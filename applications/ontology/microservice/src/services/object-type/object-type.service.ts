import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Ontology } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { ObjectTypeRepository } from './object-type.repository';

import API = Ontology.API.ObjectType;

/**
 * Object types (docs/design/ontology.md §4): created in the default ontology, checked against their
 * backing dataset's schema (Catalog's) when saved, and read with each property's mapping health against
 * it now. Rows are plain, so row-level security decides who may read or change one.
 */
@Injectable()
export class ObjectTypeService {

    constructor(
        public  readonly gatekeeper: GatekeeperService,
        public  readonly repository: ObjectTypeRepository,
        private readonly catalog:    CatalogClient,
    ) {}

    /** Needs write on the parent folder (RLS, on the library row) and read on the backing dataset. */
    async create(principal: Principal, request: API.Create.Request): Promise<API.Create.Response> {
        await this.gatekeeper.assert(principal, 'read', request.backingDatasetRid);

        const schemas = await this.catalog.getSchemas(principal, { datasetRids: [request.backingDatasetRid] });
        const schema = schemas[request.backingDatasetRid];
        const problems = Ontology.Validation.ObjectType.validate(request, schema);

        if (problems.length > 0)
            throw new BadRequestException(problems.join('. '));

        const objectType = await this.repository.create(principal, {
            ...request,
            rid:         Ontology.ObjectType.createRid(),
            ontologyRid: Ontology.DEFAULT_RID,
        });

        return { objectType, mappingHealth: Ontology.Validation.ObjectType.getMappingHealth(objectType, schema) };
    }

    /** The object type, and each property's mapping health against its backing dataset now. */
    async get(principal: Principal, rid: Ontology.ObjectType.Rid): Promise<API.Get.Response> {
        const objectType = await this.repository.get(principal, rid);

        if (!objectType)
            throw new NotFoundException('Not found');

        const schemas = await this.catalog.getSchemas(principal, { datasetRids: [objectType.backingDatasetRid] });

        return { 
            objectType, 
            mappingHealth: Ontology.Validation.ObjectType.getMappingHealth(objectType, schemas[objectType.backingDatasetRid]) 
        };
    }

    /**
     * Needs write on it — asserted first: under RLS alone a reader's replace would match no rows and read as
     * not found — and read on its backing dataset, the new one if it changes.
     */
    async replace(principal: Principal, rid: Ontology.ObjectType.Rid, request: API.Replace.Request): Promise<API.Replace.Response> {
        await this.gatekeeper.assert(principal, 'write', rid);
        await this.gatekeeper.assert(principal, 'read', request.backingDatasetRid);

        const schemas = await this.catalog.getSchemas(principal, { datasetRids: [request.backingDatasetRid] });
        const problems = Ontology.Validation.ObjectType.validate(request, schemas[request.backingDatasetRid]);

        if (problems.length > 0)
            throw new BadRequestException(problems.join('. '));

        await this.repository.replace(principal, rid, request);

        return this.get(principal, rid);
    }
}
