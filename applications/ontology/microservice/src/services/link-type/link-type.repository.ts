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

/** What a link type's definition is: what creating sets and replacing changes. */
export type LinkTypeDefinition = Ontology.API.LinkType.Replace.Request;

/** ontology.link_type (and its library row). */
@Injectable()
export class LinkTypeRepository extends Repository(OntologyDB.database) {

    constructor(
        readonly resources:      ResourceRepository,       // @EnsureResource's
        private readonly library: LibraryService,
    ) {
        super();
    }

    /** Library row (via @EnsureResource), link type row, and its lineage, in one transaction. */
    @Transactional()
    @EnsureResource('link-type')
    async create(principal: Principal, values: LinkTypeDefinition & {
        rid:         Ontology.LinkType.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
        ontologyRid: Ontology.Rid;
    }): Promise<Ontology.LinkType> {
        const row = await this.trx
            .insertInto('ontology.link_type')
            .values({
                rid:               values.rid,
                ontology_rid:      values.ontologyRid,
                a_object_type_rid: values.sides.a.objectTypeRid,
                b_object_type_rid: values.sides.b.objectTypeRid,
                sides:             json(OntologyDB.LinkType.toSideRows(values.sides)),
                backing:           json(values.backing),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        await this.declareLineage(principal, values.rid, values);

        return OntologyDB.LinkType.toDomain(row, this.resource);
    }

    /** Replaces its sides and backing, and redeclares its lineage, in one transaction. */
    @Transactional()
    async replace(principal: Principal, rid: Ontology.LinkType.Rid, definition: LinkTypeDefinition): Promise<void> {
        requireAffected(await this.trx
            .updateTable('ontology.link_type')
            .set({
                a_object_type_rid: definition.sides.a.objectTypeRid,
                b_object_type_rid: definition.sides.b.objectTypeRid,
                sides:             json(OntologyDB.LinkType.toSideRows(definition.sides)),
                backing:           json(definition.backing),
            })
            .where('rid', '=', rid)
            .executeTakeFirst());

        await this.declareLineage(principal, rid, definition);
    }

    /** Null if the principal can't read it. A trashed one — or one in something trashed — is @Transactional's 404. */
    @Transactional()
    async get(principal: Principal, rid: Ontology.LinkType.Rid): Promise<Ontology.LinkType | null> {
        const row = await this.trx
            .selectFrom('ontology.link_type as l')
            .innerJoin('library.resource as r', 'r.rid', 'l.rid')
            .selectAll('r')
            .select(['l.ontology_rid', 'l.a_object_type_rid', 'l.b_object_type_rid', 'l.sides', 'l.backing'])
            .where('l.rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        return OntologyDB.LinkType.fromJoined(row);
    }

    /** Every live link type the principal can read (RLS), by name. */
    @Transactional()
    async list(principal: Principal): Promise<Ontology.LinkType[]> {
        const rows = await this.trx
            .selectFrom('ontology.link_type as l')
            .innerJoin('library.resource as r', 'r.rid', 'l.rid')
            .selectAll('r')
            .select(['l.ontology_rid', 'l.a_object_type_rid', 'l.b_object_type_rid', 'l.sides', 'l.backing'])
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        const linkTypes: Ontology.LinkType[] = [];

        for (const row of rows)
            linkTypes.push(OntologyDB.LinkType.fromJoined(row));

        return linkTypes;
    }

    /** The live link types the principal can read with this object type on either side, by name. */
    @Transactional()
    async listForObjectType(principal: Principal, objectTypeRid: Ontology.ObjectType.Rid): Promise<Ontology.LinkType[]> {
        const rows = await this.trx
            .selectFrom('ontology.link_type as l')
            .innerJoin('library.resource as r', 'r.rid', 'l.rid')
            .selectAll('r')
            .select(['l.ontology_rid', 'l.a_object_type_rid', 'l.b_object_type_rid', 'l.sides', 'l.backing'])
            .where((eb) => eb.or([eb('l.a_object_type_rid', '=', objectTypeRid), eb('l.b_object_type_rid', '=', objectTypeRid)]))
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        const linkTypes: Ontology.LinkType[] = [];

        for (const row of rows)
            linkTypes.push(OntologyDB.LinkType.fromJoined(row));

        return linkTypes;
    }

    /**
     * The side API names other link types already give these object types, by object type — trashed ones too,
     * as a restore would bring them back. Read it as the service (Principal.SELF): a name is taken whoever can see the link.
     */
    @Transactional()
    async getTakenApiNames(
        principal:      Principal,
        objectTypeRids: Ontology.ObjectType.Rid[],
        exceptRid:      Ontology.LinkType.Rid | null,
    ): Promise<Record<Ontology.ObjectType.Rid, Set<string>>> {
        const taken: Record<Ontology.ObjectType.Rid, Set<string>> = {};

        for (const objectTypeRid of objectTypeRids)
            taken[objectTypeRid] = new Set();

        let query = this.trx
            .selectFrom('ontology.link_type')
            .select(['rid', 'a_object_type_rid', 'b_object_type_rid', 'sides'])
            .where((eb) => eb.or([eb('a_object_type_rid', 'in', objectTypeRids), eb('b_object_type_rid', 'in', objectTypeRids)]));

        if (exceptRid)
            query = query.where('rid', '!=', exceptRid);

        for (const row of await query.execute()) {
            taken[row.a_object_type_rid]?.add(row.sides.a.apiName);
            taken[row.b_object_type_rid]?.add(row.sides.b.apiName);
        }

        return taken;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** Each object type → the link type, and its join dataset or intermediary object type → the link type. Declared by the link type. */
    private async declareLineage(principal: Principal, rid: Ontology.LinkType.Rid, definition: LinkTypeDefinition): Promise<void> {
        const upstreams = new Set<Library.Resource.Rid>([definition.sides.a.objectTypeRid, definition.sides.b.objectTypeRid]);

        if (definition.backing.kind === 'dataset')
            upstreams.add(definition.backing.datasetRid);

        if (definition.backing.kind === 'object')
            upstreams.add(definition.backing.objectTypeRid);

        const edges: Pick<Library.Lineage.Edge, 'upstreamRid' | 'downstreamRid'>[] = [];

        for (const upstreamRid of upstreams)
            edges.push({ upstreamRid, downstreamRid: rid });

        await this.library.lineage.declare(principal, rid, Foundations.MAIN_BRANCH, edges);       // joins this transaction
    }

}
