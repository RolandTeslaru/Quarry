import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Ontology } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { ObjectTypeService } from '../object-type/object-type.service';
import { LinkTypeRepository, type LinkTypeDefinition } from './link-type.repository';

import API = Ontology.API.LinkType;

/**
 * Link types (docs/design/ontology.md §5): created in the default ontology, checked when saved against
 * the object types they name and their join dataset's schema, and read with what backs them checked again.
 */
@Injectable()
export class LinkTypeService {

    constructor(
        public  readonly gatekeeper:  GatekeeperService,
        public  readonly repository:  LinkTypeRepository,
        private readonly objectTypes: ObjectTypeService,
        private readonly catalog:     CatalogClient,
    ) {}

    /**
     * Needs write on the parent folder (RLS, on the library row), and read on both object types and on what
     * backs it. With no name, it's named after its object types: `Operative ↔ Equipment`.
     */
    async create(principal: Principal, request: API.Create.Request): Promise<API.Create.Response> {
        if (request.backing.kind === 'dataset')
            await this.gatekeeper.assert(principal, 'read', request.backing.datasetRid);

        const context = await this.getContext(principal, request);

        for (const objectTypeRid of Ontology.LinkType.getObjectTypeRids(request))
            if (!context.objectTypes[objectTypeRid])
                throw new NotFoundException(`Object type ${objectTypeRid} not found`);

        const taken = await this.repository.getTakenApiNames(Principal.SELF('ontology.link-names'), [request.sides.a.objectTypeRid, request.sides.b.objectTypeRid], null);
        const problems = Ontology.Validation.LinkType.validate(request, context, taken);

        if (problems.length > 0)
            throw new BadRequestException(problems.join('. '));

        const a = context.objectTypes[request.sides.a.objectTypeRid];
        const b = context.objectTypes[request.sides.b.objectTypeRid];

        const linkType = await this.repository.create(principal, {
            ...request,
            rid:         Ontology.LinkType.createRid(),
            name:        request.name ?? `${a.name} ↔ ${b.name}`,
            ontologyRid: Ontology.DEFAULT_RID,
        });

        return { linkType, mappingHealth: Ontology.Validation.LinkType.getMappingHealth(linkType, context) };
    }

    /** The link type, and what backs it checked against its object types and join dataset now. */
    async get(principal: Principal, rid: Ontology.LinkType.Rid): Promise<API.Get.Response> {
        const linkType = await this.repository.get(principal, rid);

        if (!linkType)
            throw new NotFoundException('Not found');

        const context = await this.getContext(principal, linkType);

        return { linkType, mappingHealth: Ontology.Validation.LinkType.getMappingHealth(linkType, context) };
    }

    /** Needs write on it — asserted first, as for object types — and read on everything its new definition names. */
    async replace(principal: Principal, rid: Ontology.LinkType.Rid, request: API.Replace.Request): Promise<API.Replace.Response> {
        await this.gatekeeper.assert(principal, 'write', rid);

        if (request.backing.kind === 'dataset')
            await this.gatekeeper.assert(principal, 'read', request.backing.datasetRid);

        const context = await this.getContext(principal, request);

        for (const objectTypeRid of Ontology.LinkType.getObjectTypeRids(request))
            if (!context.objectTypes[objectTypeRid])
                throw new NotFoundException(`Object type ${objectTypeRid} not found`);

        const taken = await this.repository.getTakenApiNames(Principal.SELF('ontology.link-names'), [request.sides.a.objectTypeRid, request.sides.b.objectTypeRid], rid);
        const problems = Ontology.Validation.LinkType.validate(request, context, taken);

        if (problems.length > 0)
            throw new BadRequestException(problems.join('. '));

        await this.repository.replace(principal, rid, request);

        return this.get(principal, rid);
    }

    /** The object type's link types, from either side, that the principal can read. */
    async listForObjectType(principal: Principal, objectTypeRid: Ontology.ObjectType.Rid): Promise<Ontology.LinkType[]> {
        if (!await this.objectTypes.repository.get(principal, objectTypeRid))
            throw new NotFoundException('Not found');

        return this.repository.listForObjectType(principal, objectTypeRid);
    }

    /** What a definition is checked against: the object types it names that the principal can read, and its join dataset's schema. */
    async getContext(principal: Principal, definition: LinkTypeDefinition): Promise<Ontology.Validation.LinkType.Context> {
        const objectTypes = await this.objectTypes.repository.getMany(principal, Ontology.LinkType.getObjectTypeRids(definition));
        let joinDatasetSchema: Ontology.Validation.LinkType.Context['joinDatasetSchema'] = null;

        if (definition.backing.kind === 'dataset') {
            const schemas = await this.catalog.getSchemas(principal, { datasetRids: [definition.backing.datasetRid] });

            joinDatasetSchema = schemas[definition.backing.datasetRid];
        }

        return { objectTypes, joinDatasetSchema };
    }
}
