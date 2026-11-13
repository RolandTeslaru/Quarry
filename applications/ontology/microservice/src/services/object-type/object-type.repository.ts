import { Injectable } from '@nestjs/common';
import { Foundations, type Library, Ontology } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { requireAffected } from '@quarry/platform-kernel/db/errors';
import { isLive } from '@quarry/platform-kernel/db/liveness';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { json } from '@quarry/platform-kernel/db/table';
import { EnsureResource } from '@quarry/platform-kernel/services/Library/ensure-resource';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { ResourceRepository } from '@quarry/platform-kernel/services/Library/resource.repository';
import { OntologyDB } from '../ontology/ontology.db';

/** What an object type's definition is: what creating sets and replacing changes. */
export type ObjectTypeDefinition = Ontology.API.ObjectType.Replace.Request;

/** ontology.object_type (and its library row). */
@Injectable()
export class ObjectTypeRepository extends Repository(OntologyDB.database) {

    constructor(
        readonly resources:      ResourceRepository,       // @EnsureResource's
        private readonly library: LibraryService,
    ) {
        super();
    }

    /** Library row (via @EnsureResource), object type row, and its lineage — backing dataset → object type — in one transaction. */
    @Transactional()
    @EnsureResource('object-type')
    async create(principal: Principal, values: ObjectTypeDefinition & {
        rid:         Ontology.ObjectType.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
        ontologyRid: Ontology.Rid;
    }): Promise<Ontology.ObjectType> {
        const row = await this.trx
            .insertInto('ontology.object_type')
            .values({
                rid:                 values.rid,
                ontology_rid:        values.ontologyRid,
                api_name:            values.apiName,
                plural_display_name: values.pluralDisplayName,
                ui:                  json(values.ui),
                backing_dataset_rid: values.backingDatasetRid,
                primary_key:         values.primaryKey,
                title_property:      values.titleProperty,
                properties:          json(OntologyDB.ObjectType.toPropertyRows(values.properties)),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        await this.library.lineage.declare(principal, values.rid, Foundations.MAIN_BRANCH, [         // joins this transaction
            { upstreamRid: values.backingDatasetRid, downstreamRid: values.rid },
        ]);

        return OntologyDB.ObjectType.toDomain(row, this.resource);
    }

    /** Replaces its definition and redeclares its lineage, in one transaction. */
    @Transactional()
    async replace(principal: Principal, rid: Ontology.ObjectType.Rid, definition: ObjectTypeDefinition): Promise<void> {
        requireAffected(await this.trx
            .updateTable('ontology.object_type')
            .set({
                api_name:            definition.apiName,
                plural_display_name: definition.pluralDisplayName,
                ui:                  json(definition.ui),
                backing_dataset_rid: definition.backingDatasetRid,
                primary_key:         definition.primaryKey,
                title_property:      definition.titleProperty,
                properties:          json(OntologyDB.ObjectType.toPropertyRows(definition.properties)),
            })
            .where('rid', '=', rid)
            .executeTakeFirst());

        await this.library.lineage.declare(principal, rid, Foundations.MAIN_BRANCH, [                 // joins this transaction
            { upstreamRid: definition.backingDatasetRid, downstreamRid: rid },
        ]);
    }

    /** Every live object type the principal can read (RLS), by name. */
    @Transactional()
    async list(principal: Principal): Promise<Ontology.ObjectType[]> {
        const rows = await this.trx
            .selectFrom('ontology.object_type as o')
            .innerJoin('library.resource as r', 'r.rid', 'o.rid')
            .selectAll('r')
            .select([
                'o.ontology_rid', 'o.api_name', 'o.plural_display_name', 'o.ui', 'o.backing_dataset_rid',
                'o.primary_key', 'o.title_property', 'o.properties',
            ])
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        const objectTypes: Ontology.ObjectType[] = [];

        for (const row of rows)
            objectTypes.push(OntologyDB.ObjectType.fromJoined(row));

        return objectTypes;
    }

    /** Null if the principal can't read it. A trashed one — or one in something trashed — is @Transactional's 404. */
    @Transactional()
    async get(principal: Principal, rid: Ontology.ObjectType.Rid): Promise<Ontology.ObjectType | null> {
        const objectTypes = await this.getMany(principal, [rid]);

        return objectTypes[rid] ?? null;
    }

    /** These live object types, by RID; one that isn't there, or that the principal can't read, is left out. */
    @Transactional()
    async getMany(principal: Principal, rids: Ontology.ObjectType.Rid[]): Promise<Record<Ontology.ObjectType.Rid, Ontology.ObjectType>> {
        const objectTypes: Record<Ontology.ObjectType.Rid, Ontology.ObjectType> = {};

        if (rids.length === 0)
            return objectTypes;

        const rows = await this.trx
            .selectFrom('ontology.object_type as o')
            .innerJoin('library.resource as r', 'r.rid', 'o.rid')
            .selectAll('r')
            .select([
                'o.ontology_rid', 'o.api_name', 'o.plural_display_name', 'o.ui', 'o.backing_dataset_rid',
                'o.primary_key', 'o.title_property', 'o.properties',
            ])
            .where('o.rid', 'in', rids)
            .where(isLive('r.rid'))
            .execute();

        for (const row of rows) {
            const objectType = OntologyDB.ObjectType.fromJoined(row);

            objectTypes[objectType.rid] = objectType;
        }

        return objectTypes;
    }
}
