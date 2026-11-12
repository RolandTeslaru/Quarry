import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Dataset, Foundations, type Library, Ontology } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { OntologyHarness } from '../support/ontology-fixtures';

/** Link types (docs/design/ontology.md §5, §6): two sides and a backing, checked when saved, read with mapping states. */
describe('link types', () => {

    let harness: OntologyHarness;
    let user: Principal.User;
    let projectRid: Library.Project.Rid;
    let relationships: Dataset.Rid;
    let officer: Ontology.ObjectType;
    let entity: Ontology.ObjectType;
    let position: Ontology.ObjectType;

    beforeAll(async () => {
        harness = await OntologyHarness.start();
        user = await harness.createUser();
        projectRid = await harness.createProject(user);

        const officers = await harness.createDataset(user, projectRid, 'officers', 'node_id,name,entity_id,age\no1,Ada,e1,34\no2,Bo,e2,51\n');
        const entities = await harness.createDataset(user, projectRid, 'entities', 'node_id,name\ne1,Acme\ne2,Globex\n');
        const positions = await harness.createDataset(user, projectRid, 'positions', 'position_id,officer_id,entity_id,role\np1,o1,e1,director\n');

        relationships = await harness.createDataset(user, projectRid, 'relationships', 'from_id,to_id\no1,e1\no2,e1\n');

        officer = await createObjectType('Officer', officers, {
            nodeId:   { displayName: 'Node ID', description: null, type: 'string', column: 'node_id' },
            name:     { displayName: 'Name', description: null, type: 'string', column: 'name' },
            entityId: { displayName: 'Entity ID', description: null, type: 'string', column: 'entity_id' },
            age:      { displayName: 'Age', description: null, type: 'long', column: 'age' },
        }, 'nodeId');
        entity = await createObjectType('Entity', entities, {
            nodeId: { displayName: 'Node ID', description: null, type: 'string', column: 'node_id' },
            name:   { displayName: 'Name', description: null, type: 'string', column: 'name' },
        }, 'nodeId');
        position = await createObjectType('Position', positions, {
            positionId: { displayName: 'Position ID', description: null, type: 'string', column: 'position_id' },
            officerId:  { displayName: 'Officer ID', description: null, type: 'string', column: 'officer_id' },
            entityId:   { displayName: 'Entity ID', description: null, type: 'string', column: 'entity_id' },
            role:       { displayName: 'Role', description: null, type: 'string', column: 'role' },
        }, 'positionId');
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function createObjectType(name: string, backingDatasetRid: Dataset.Rid, properties: Ontology.ObjectType['properties'], primaryKey: string): Promise<Ontology.ObjectType> {
        const { objectType } = await harness.as(user, () => harness.objectTypes.create(user, {
            parentRid:         projectRid,
            name,
            description:       null,
            apiName:           name,
            pluralDisplayName: `${name}s`,
            ui:                { icon: 'person', color: 'blue' },
            backingDatasetRid,
            primaryKey,
            titleProperty:     primaryKey,
            properties,
        }));

        return objectType;
    }

    /** A side of a link: from this object type, named this, leading to one object or many. */
    function side(objectType: Ontology.ObjectType, apiName: string, cardinality: Ontology.LinkType.Side.Cardinality): Ontology.LinkType.Side {
        return { objectTypeRid: objectType.rid, displayName: apiName, apiName, cardinality };
    }

    /** Named after its sides: names are unique in a folder, and these object types have many links. */
    function request(sides: Ontology.LinkType['sides'], backing: Ontology.LinkType.Backing): Ontology.API.LinkType.Create.Request {
        return { parentRid: projectRid, name: `${sides.a.apiName} ↔ ${sides.b.apiName}`, description: null, sides, backing };
    }

    it("by a foreign key: named after its object types, listed from both, its lineage from both", async () => {
        const { linkType, mappingHealth } = await harness.as(user, () => harness.linkTypes.create(user, {
            ...request(
                { a: side(officer, 'employer', 'one'), b: side(entity, 'employees', 'many') },
                { kind: 'foreign-key', foreignKey: { side: 'a', property: 'entityId' } },
            ),
            name: null,
        }));

        expect(linkType).toMatchObject({ type: 'link-type', name: 'Officer ↔ Entity', ontologyRid: Ontology.DEFAULT_RID });
        expect(mappingHealth).toEqual({ foreignKey: 'ok' });
        expect(await harness.as(user, () => harness.linkTypes.get(user, linkType.rid))).toEqual({ linkType, mappingHealth });
        expect((await harness.as(user, () => harness.linkTypes.listForObjectType(user, entity.rid))).map((link) => link.rid)).toContain(linkType.rid);
        expect((await harness.as(user, () => harness.linkTypes.listForObjectType(user, officer.rid))).map((link) => link.rid)).toContain(linkType.rid);

        const { edges } = await harness.library.lineage.getUpstream(user, linkType.rid, Foundations.MAIN_BRANCH);
        const upstreams = edges.map((edge) => edge.upstreamRid).sort();

        expect(upstreams).toEqual([officer.rid, entity.rid].sort());
    });

    it('by a foreign key: refuses the wrong cardinality, and a key of another type than what it points at', async () => {
        await expect(harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'employerMany', 'many'), b: side(entity, 'employeesMany', 'many') },
            { kind: 'foreign-key', foreignKey: { side: 'a', property: 'entityId' } },
        )))).rejects.toThrow(/holds the foreign key, so it leads to one object/);

        await expect(harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'byAge', 'one'), b: side(entity, 'ofAge', 'many') },
            { kind: 'foreign-key', foreignKey: { side: 'a', property: 'age' } },
        )))).rejects.toThrow(/foreignKey: not the same type as the primary key/);
    });

    it('by a join dataset: many to many, a column per side, its lineage from the dataset too', async () => {
        const { linkType, mappingHealth } = await harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'relatedEntities', 'many'), b: side(entity, 'relatedOfficers', 'many') },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'to_id' } },
        )));

        expect(mappingHealth).toEqual({ a: 'ok', b: 'ok' });

        const { edges } = await harness.library.lineage.getUpstream(user, linkType.rid, Foundations.MAIN_BRANCH);

        expect(edges.map((edge) => edge.upstreamRid)).toContain(relationships);

        await expect(harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'missingEntities', 'many'), b: side(entity, 'missingOfficers', 'many') },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'nope' } },
        )))).rejects.toThrow(/b: not there/);
    });

    it('through an intermediary object type: how a link gets properties of its own', async () => {
        const { linkType, mappingHealth } = await harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'heldPositionsAt', 'many'), b: side(entity, 'positionHolders', 'many') },
            { kind: 'object', objectTypeRid: position.rid, foreignKeys: { a: 'officerId', b: 'entityId' } },
        )));

        expect(mappingHealth).toEqual({ a: 'ok', b: 'ok' });
        expect((await harness.library.lineage.getUpstream(user, linkType.rid, Foundations.MAIN_BRANCH)).edges.map((edge) => edge.upstreamRid)).toContain(position.rid);
    });

    it("names each side once on its object type: not a property's name, not another link's, not both sides of a self-link", async () => {
        await harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'colleagues', 'many'), b: side(entity, 'staff', 'many') },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'to_id' } },
        )));

        await expect(harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'name', 'many'), b: side(entity, 'staffNamed', 'many') },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'to_id' } },
        )))).rejects.toThrow(/Side a: its object type has a property named name/);

        await expect(harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'colleagues', 'many'), b: side(entity, 'otherStaff', 'many') },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'to_id' } },
        )))).rejects.toThrow(/Side a: another link of its object type is already named colleagues/);

        await expect(harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'relatives', 'many'), b: side(officer, 'relatives', 'many') },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'to_id' } },
        )))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is replaced whole: its own names are free to keep', async () => {
        const { linkType } = await harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'partners', 'many'), b: side(entity, 'partneredWith', 'many') },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'to_id' } },
        )));

        const { linkType: replaced } = await harness.as(user, () => harness.linkTypes.replace(user, linkType.rid, {
            sides:   { a: side(officer, 'partners', 'many'), b: side(entity, 'partnerOfficers', 'many') },
            backing: linkType.backing,
        }));

        expect(replaced.sides.b.apiName).toBe('partnerOfficers');
    });

    it('refuses an object type it can\'t find, and lists none for one', async () => {
        const unknown = Ontology.ObjectType.createRid();

        await expect(harness.as(user, () => harness.linkTypes.create(user, request(
            { a: side(officer, 'ghosts', 'many'), b: { ...side(entity, 'ghostOfficers', 'many'), objectTypeRid: unknown } },
            { kind: 'dataset', datasetRid: relationships, columns: { a: 'from_id', b: 'to_id' } },
        )))).rejects.toBeInstanceOf(NotFoundException);

        await expect(harness.as(user, () => harness.linkTypes.listForObjectType(user, unknown))).rejects.toBeInstanceOf(NotFoundException);
    });
});
