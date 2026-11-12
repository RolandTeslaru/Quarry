import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Dataset, Foundations, type Library, Ontology } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { OntologyHarness } from '../support/ontology-fixtures';

/** Object types (docs/design/ontology.md §4, §6): created from a dataset, checked against its schema when saved, read with mapping states. */
describe('object types', () => {

    let harness: OntologyHarness;
    let user: Principal.User;
    let projectRid: Library.Project.Rid;
    let entities: Dataset.Rid;

    beforeAll(async () => {
        harness = await OntologyHarness.start();
        user = await harness.createUser();
        projectRid = await harness.createProject(user);
        entities = await harness.createDataset(user, projectRid, 'entities', 'node_id,name,valuation\ne1,Acme,1.5\ne2,Globex,2.5\n');
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** An Offshore Entity on `entities`, with whatever the test changes — its name and API name its own: both are unique. */
    function request(changes: Partial<Ontology.API.ObjectType.Create.Request> = {}): Ontology.API.ObjectType.Create.Request {
        const apiName = `OffshoreEntity${Math.floor(Math.random() * 1e9)}`;

        return {
            parentRid:         projectRid,
            name:              apiName,
            description:       null,
            apiName,
            pluralDisplayName: 'Offshore Entities',
            ui:                { icon: 'office', color: 'blue' },
            backingDatasetRid: entities,
            primaryKey:        'nodeId',
            titleProperty:     'name',
            properties: {
                nodeId:    { displayName: 'Node ID', description: null, type: 'string', column: 'node_id' },
                name:      { displayName: 'Name', description: null, type: 'string', column: 'name' },
                valuation: { displayName: 'Valuation', description: 'In millions', type: 'double', column: 'valuation' },
            },
            ...changes,
        };
    }

    it('is created from a dataset in the default ontology: a library resource, its properties in order, every mapping ok', async () => {
        const created = request();
        const { objectType, mappingHealth } = await harness.as(user, () => harness.objectTypes.create(user, created));

        expect(objectType).toMatchObject({ type: 'object-type', name: created.name, parentRid: projectRid, ontologyRid: Ontology.DEFAULT_RID, backingDatasetRid: entities });
        expect(Object.keys(objectType.properties)).toEqual(['nodeId', 'name', 'valuation']);
        expect(mappingHealth).toEqual({ nodeId: 'ok', name: 'ok', valuation: 'ok' });
        expect(await harness.as(user, () => harness.objectTypes.get(user, objectType.rid))).toEqual({ objectType, mappingHealth });
    });

    it('declares its lineage: its backing dataset → it', async () => {
        const { objectType } = await harness.as(user, () => harness.objectTypes.create(user, request()));
        const { edges } = await harness.library.lineage.getUpstream(user, objectType.rid, Foundations.MAIN_BRANCH);

        expect(edges).toMatchObject([{ upstreamRid: entities, downstreamRid: objectType.rid, declaredByRid: objectType.rid }]);
    });

    it("refuses a definition that doesn't fit the dataset, naming each problem", async () => {
        const properties = {
            nodeId:    { displayName: 'Node ID', description: null, type: 'string' as const, column: 'node_id' },
            name:      { displayName: 'Name', description: null, type: 'long' as const, column: 'name' },
            address:   { displayName: 'Address', description: null, type: 'string' as const, column: 'address' },
            valuation: { displayName: 'Valuation', description: null, type: 'double' as const, column: 'valuation' },
        };

        const refused = harness.as(user, () => harness.objectTypes.create(user, request({ properties, primaryKey: 'valuation', titleProperty: 'title' })));

        await expect(refused).rejects.toBeInstanceOf(BadRequestException);
        await expect(refused).rejects.toThrow(/name: column name isn't a long.*address: the backing dataset has no column address.*primary key valuation is a double.*title title isn't one of its properties/);
    });

    it('refuses a dataset with no columns yet', async () => {
        const empty = await harness.createDataset(user, projectRid, 'empty', null);

        await expect(harness.as(user, () => harness.objectTypes.create(user, request({ backingDatasetRid: empty })))).rejects.toThrow(/has no columns/);
    });

    it('takes an API name once per ontology', async () => {
        const first = request();

        await harness.as(user, () => harness.objectTypes.create(user, first));

        await expect(harness.as(user, () => harness.objectTypes.create(user, request({ apiName: first.apiName, name: `${first.name} again` })))).rejects.toBeInstanceOf(ConflictException);
    });

    it("reads its mappingHealth against the dataset's schema now: a dropped column is missing, a retyped one incompatible", async () => {
        const dataset = await harness.createDataset(user, projectRid, 'changing', 'node_id,name,valuation\ne1,Acme,1.5\n');
        const { objectType } = await harness.as(user, () => harness.objectTypes.create(user, request({ backingDatasetRid: dataset })));

        await harness.upload(user, dataset, 'node_id,valuation\ne1,high\n');

        expect((await harness.as(user, () => harness.objectTypes.get(user, objectType.rid))).mappingHealth).toEqual({ nodeId: 'ok', name: 'missing-column', valuation: 'incompatible-type' });
    });

    it('reads every mapping as missing once its backing dataset is trashed', async () => {
        const dataset = await harness.createDataset(user, projectRid, 'trashed', 'node_id,name,valuation\ne1,Acme,1.5\n');
        const { objectType } = await harness.as(user, () => harness.objectTypes.create(user, request({ backingDatasetRid: dataset })));

        await harness.trash(user, dataset);

        expect((await harness.as(user, () => harness.objectTypes.get(user, objectType.rid))).mappingHealth).toEqual({ nodeId: 'missing-column', name: 'missing-column', valuation: 'missing-column' });
    });

    it('is replaced whole, checked again, with its lineage redeclared for a new backing dataset', async () => {
        const { objectType } = await harness.as(user, () => harness.objectTypes.create(user, request()));
        const officers = await harness.createDataset(user, projectRid, 'officers', 'node_id,name\no1,Ada\n');

        const { objectType: replaced, mappingHealth } = await harness.as(user, () => harness.objectTypes.replace(user, objectType.rid, {
            ...request({ apiName: objectType.apiName }),
            backingDatasetRid: officers,
            properties: {
                nodeId: { displayName: 'Node ID', description: null, type: 'string', column: 'node_id' },
                name:   { displayName: 'Name', description: null, type: 'string', column: 'name' },
            },
        }));

        expect(replaced).toMatchObject({ rid: objectType.rid, backingDatasetRid: officers });
        expect(mappingHealth).toEqual({ nodeId: 'ok', name: 'ok' });
        expect((await harness.library.lineage.getUpstream(user, objectType.rid, Foundations.MAIN_BRANCH)).edges).toMatchObject([{ upstreamRid: officers }]);

        await expect(harness.as(user, () => harness.objectTypes.replace(user, objectType.rid, { ...request({ apiName: objectType.apiName }), titleProperty: 'nope' }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is hidden from someone with no access, and read-only to a viewer', async () => {
        const { objectType } = await harness.as(user, () => harness.objectTypes.create(user, request()));
        const stranger = await harness.createUser('member');
        const viewer = await harness.createUser('member');

        await harness.grant(user, projectRid, viewer, 'viewer');

        await expect(harness.as(stranger, () => harness.objectTypes.get(stranger, objectType.rid))).rejects.toBeInstanceOf(NotFoundException);
        expect((await harness.as(viewer, () => harness.objectTypes.get(viewer, objectType.rid))).objectType.rid).toBe(objectType.rid);
        await expect(harness.as(viewer, () => harness.objectTypes.replace(viewer, objectType.rid, request({ apiName: objectType.apiName })))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('is created and read through the main server, as browsers do', async () => {
        const api = await harness.getApi(user);
        const created = await Ontology.API.ObjectType.create(api, request());

        expect((await Ontology.API.ObjectType.get(api, created.objectType.rid)).objectType).toEqual(created.objectType);
    });
});
