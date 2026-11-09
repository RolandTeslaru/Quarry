import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Foundations, type Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeHarness, MAIN } from '../support/forge-fixtures';

const edge = (upstreamRid: Library.Resource.Rid, downstreamRid: Library.Resource.Rid) => `${upstreamRid} → ${downstreamRid}`;

/** Publishing recipes declares the producer's lineage, in the publish's transaction. */
describe('lineage from publishing recipes', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('declares each input → each output, as the producer', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'lookup', 'a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw', 'lookup'], outputs: ['a', 'b'] },
        ]);

        expect(await harness.getLineage(projectRid)).toEqual([
            edge(datasets.raw, datasets.a),
            edge(datasets.raw, datasets.b),
            edge(datasets.lookup, datasets.a),
            edge(datasets.lookup, datasets.b),
        ].sort());
    });

    it('a recipe with no inputs: producer → output', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['synced']);

        await harness.publish(user, projectRid, datasets, [{ name: 'Sync', inputs: [], outputs: ['synced'] }]);

        expect(await harness.getLineage(projectRid)).toEqual([edge(projectRid, datasets.synced)]);
    });

    it('a republish replaces the producer\'s edges', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'other', 'a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['raw'], outputs: ['b'] },
        ]);
        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['other'], outputs: ['a'] }]);

        expect(await harness.getLineage(projectRid)).toEqual([edge(datasets.other, datasets.a)]);
    });

    it('publishing nothing clears them', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        await harness.publish(user, projectRid, datasets, []);

        expect(await harness.getLineage(projectRid)).toEqual([]);
    });

    it('keeps branches apart', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'other', 'a']);
        const develop = Foundations.Branch.parse('develop');

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['other'], outputs: ['a'] }], develop);

        expect(await harness.getLineage(projectRid)).toEqual([edge(datasets.raw, datasets.a)]);
        expect(await harness.getLineage(projectRid, develop)).toEqual([edge(datasets.other, datasets.a)]);
    });

    it('reads one hop, in each direction', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'], outputs: ['b'] },
        ]);

        const expected = { branch: MAIN, declaredByRid: projectRid };

        const upstream = await harness.library.lineage.getUpstream(user, datasets.b, MAIN);
        const downstream = await harness.library.lineage.getDownstream(user, datasets.raw, MAIN);

        expect(upstream.edges).toEqual([{ ...expected, upstreamRid: datasets.a, downstreamRid: datasets.b }]);
        expect(downstream.edges).toEqual([{ ...expected, upstreamRid: datasets.raw, downstreamRid: datasets.a }]);
        expect(Object.keys(upstream.resources).sort()).toEqual([datasets.a, datasets.b].sort());
    });

    it('a read hides a trashed neighbour, and the edge survives', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        await harness.trash(user, datasets.raw);

        const { edges } = await harness.library.lineage.getUpstream(user, datasets.a, MAIN);

        expect(edges).toEqual([]);
        expect(await harness.getLineage(projectRid)).toEqual([edge(datasets.raw, datasets.a)]);
    });

    it('includes a trashed neighbour, and walks through it, when asked', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'], outputs: ['b'] },
        ]);
        await harness.trash(user, datasets.a);

        const { edges } = await harness.library.lineage.getUpstream(user, datasets.b, MAIN, { depth: 2, includeTrashed: true });

        expect(edges.map((found) => edge(found.upstreamRid, found.downstreamRid)).sort()).toEqual([
            edge(datasets.a, datasets.b),
            edge(datasets.raw, datasets.a),
        ].sort());
    });

    it('walks as many hops as asked, and stops at the end of the graph', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'], outputs: ['b'] },
            { name: 'C', inputs: ['b'], outputs: ['c'] },
        ]);

        const walk = async (depth: number) => {
            const { edges } = await harness.library.lineage.getDownstream(user, datasets.raw, MAIN, { depth, includeTrashed: false });

            return edges.map((found) => found.downstreamRid).sort();
        };

        expect(await walk(2)).toEqual([datasets.a, datasets.b].sort());
        expect(await walk(100)).toEqual([datasets.a, datasets.b, datasets.c].sort());
    });

    it('a resource the reader can\'t discover stops the walk', async () => {
        const reader = await harness.createUser('member');
        const start = await harness.createDatasets(user, ['raw']);
        const hidden = await harness.createDatasets(user, ['a']);
        const end = await harness.createDatasets(user, ['b']);
        const datasets = { ...start.datasets, ...hidden.datasets, ...end.datasets };

        await harness.grant(user, start.projectRid, reader, 'viewer');
        await harness.grant(user, end.projectRid, reader, 'viewer');
        await harness.publish(user, start.projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'], outputs: ['b'] },
        ]);

        const { edges } = await harness.library.lineage.getDownstream(reader, datasets.raw, MAIN, { depth: 5, includeTrashed: false });

        expect(edges).toEqual([]);
    });

    it('a cycle ends, each edge once', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['b'], outputs: ['a'] },
            { name: 'B', inputs: ['a'], outputs: ['b'] },
        ]);

        const { edges } = await harness.library.lineage.getDownstream(user, datasets.a, MAIN, { depth: 10, includeTrashed: false });

        expect(edges).toHaveLength(2);
    });

    it('a read hides an end the reader can\'t discover, even from the declarer\'s editor', async () => {
        const editor = await harness.createUser('member');
        const output = await harness.createDatasets(user, ['a']);
        const input = await harness.createDatasets(user, ['raw']);
        const datasets = { ...output.datasets, ...input.datasets };

        await harness.grant(user, output.projectRid, editor, 'editor');
        await harness.grant(user, input.projectRid, editor, 'viewer');
        await harness.publish(editor, output.projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        const before = await harness.library.lineage.getUpstream(editor, datasets.a, MAIN);

        expect(before.edges).toHaveLength(1);

        await harness.revoke(input.projectRid, editor);

        const after = await harness.library.lineage.getUpstream(editor, datasets.a, MAIN);

        expect(after.edges).toEqual([]);
    });

    it('reads the edges among a set of resources, leaving out what isn\'t there', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'gone']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a', 'gone'], outputs: ['b'] },
        ]);
        await harness.trash(user, datasets.gone);

        const edges = await harness.library.lineage.getEdgesBetween(user, [datasets.a, datasets.b, datasets.gone], MAIN);

        expect(edges.map((found) => edge(found.upstreamRid, found.downstreamRid))).toEqual([edge(datasets.a, datasets.b)]);
    });

    it('reads no edges among no resources', async () => {
        await expect(harness.library.lineage.getEdgesBetween(user, [], MAIN)).resolves.toEqual([]);
    });

    it('reads a graph of a set of resources, leaving out what isn\'t there', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'gone']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a', 'gone'], outputs: ['b'] },
        ]);
        await harness.trash(user, datasets.gone);

        const graph = await harness.library.lineage.getEdgesAndResources(user, [datasets.a, datasets.b, datasets.gone], MAIN);

        expect(graph.edges.map((found) => edge(found.upstreamRid, found.downstreamRid))).toEqual([edge(datasets.a, datasets.b)]);
        expect(Object.keys(graph.resources).sort()).toEqual([datasets.a, datasets.b].sort());
    });

    it('reads an empty graph of no resources', async () => {
        await expect(harness.library.lineage.getEdgesAndResources(user, [], MAIN)).resolves.toEqual({ resources: {}, edges: [] });
    });

    it('lists main, then the branches with an edge the reader can see', async () => {
        const release = Foundations.Branch.parse(`release-${Date.now()}`);
        const hotfix = Foundations.Branch.parse(`hotfix-${Date.now()}`);
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'gone']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }], release);
        await harness.publish(user, projectRid, datasets, [{ name: 'G', inputs: ['raw'], outputs: ['gone'] }], hotfix);
        await harness.trash(user, datasets.gone);

        const branches = await harness.library.lineage.getBranches(user);

        expect(branches[0]).toBe(MAIN);
        expect(branches.lastIndexOf(MAIN)).toBe(0);
        expect(branches).toContain(release);
        expect(branches).not.toContain(hotfix);
    });

    it('reads over HTTP from the main server', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'], outputs: ['b'] },
        ]);

        const api = await harness.getApi(user);
        const { data } = await api.get(`/api/resources/${datasets.b}/lineage/upstream`, { params: { depth: 2, includeTrashed: false } });

        expect(data.edges).toHaveLength(2);
        expect(data.resources[datasets.raw].name).toBe('raw');

        const canvas = await api.post('/api/resources/lineage/graph', { rids: [datasets.a, datasets.b] });

        expect(canvas.data.edges).toHaveLength(1);

        const branches = await api.get('/api/resources/lineage/branches');

        expect(branches.data.branches[0]).toBe(MAIN);
    });

    it('a republish reaches an edge to a dataset the publisher has since lost', async () => {
        const editor = await harness.createUser('member');
        const output = await harness.createDatasets(user, ['a']);
        const input = await harness.createDatasets(user, ['raw']);
        const replacement = await harness.createDatasets(user, ['other']);
        const datasets = { ...output.datasets, ...input.datasets, ...replacement.datasets };

        await harness.grant(user, output.projectRid, editor, 'editor');
        await harness.grant(user, input.projectRid, editor, 'viewer');
        await harness.grant(user, replacement.projectRid, editor, 'viewer');

        await harness.publish(editor, output.projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        await harness.revoke(input.projectRid, editor);
        await harness.publish(editor, output.projectRid, datasets, [{ name: 'A', inputs: ['other'], outputs: ['a'] }]);

        expect(await harness.getLineage(output.projectRid)).toEqual([edge(datasets.other, datasets.a)]);
    });
});
