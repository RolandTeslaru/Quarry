import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Foundations, type Graph, type Library, LineageExplorer } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { LineageExplorerHarness } from '../support/lineage-explorer-fixtures';

const MAIN = Foundations.MAIN_BRANCH;
const APPLICATION = 'lineage-explorer';

/** A saved exploration: its nodes are stored, its edges read when it's opened. */
describe('explorations', () => {

    let harness: LineageExplorerHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await LineageExplorerHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    const create = (parentRid: Library.Resource.Rid, nodes: LineageExplorer.Exploration['nodes'] = {}) => harness.explorations.create(user, {
        parentRid,
        name:        `Exploration ${Math.random()}`,
        description: null,
        branch:      MAIN,
        nodes,
        legend:      LineageExplorer.Legend.DEFAULT,
    });

    it('is a library resource', async () => {
        const projectRid = await harness.createProject(user);
        const exploration = await create(projectRid);

        expect(exploration).toMatchObject({ type: 'lineage-exploration', parentRid: projectRid, branch: MAIN, nodes: {} });
        await expect(harness.library.get(user, exploration.rid)).resolves.toMatchObject({ rid: exploration.rid, type: 'lineage-exploration' });
    });

    it('lists what the user can read, and not what\'s trashed', async () => {
        const reader = await harness.createUser('member');
        const shared = await harness.createProject(user);
        const hidden = await harness.createProject(user);
        const listed = await create(shared);
        const trashed = await create(shared);
        const other = await create(hidden);

        await harness.grant(user, shared, reader, 'viewer');
        await harness.trash(user, trashed.rid);

        const metas = await harness.explorations.list(reader);
        const rids = metas.map((exploration) => exploration.rid);

        expect(metas.every((exploration) => !('nodes' in exploration))).toBe(true);

        expect(rids).toContain(listed.rid);
        expect(rids).not.toContain(trashed.rid);
        expect(rids).not.toContain(other.rid);
    });

    it('opens with the edges among its nodes, read now', async () => {
        const projectRid = await harness.createProject(user);
        const { a, b, other } = await harness.createFolders(user, projectRid, ['a', 'b', 'other']);
        const exploration = await create(projectRid, {
            [a]: { x: 0, y: 0 },
            [b]: { x: 200, y: 0 },
        });

        const before = await harness.explorations.open(user, exploration.rid, APPLICATION);

        expect(before.graph.edges).toEqual({});
        expect(Object.keys(before.graph.nodes).sort()).toEqual([a, b].sort());

        await harness.library.lineage.declare(user, projectRid, MAIN, [
            { upstreamRid: a, downstreamRid: b },
            { upstreamRid: b, downstreamRid: other },        // not on the canvas
        ]);

        const after = await harness.explorations.open(user, exploration.rid, APPLICATION);

        expect(Object.keys(after.graph.edges)).toEqual([`${a}:${b}`]);
        expect(after.graph.edges[`${a}:${b}` as Graph.Edge.Id].lineageEdge).toEqual({
            upstreamRid:   a,
            downstreamRid: b,
            branch:        MAIN,
            declaredByRid: projectRid,
        });
    });

    it('save replaces the nodes and the legend', async () => {
        const projectRid = await harness.createProject(user);
        const { a, b } = await harness.createFolders(user, projectRid, ['a', 'b']);
        const exploration = await create(projectRid, { [a]: { x: 0, y: 0 } });
        const legend = { type: 'resource-type', isVisible: false } as const;

        const saved = await harness.explorations.save(user, exploration.rid, { nodes: { [b]: { x: 10, y: 20 } }, legend });

        expect(saved.nodes).toEqual({ [b]: { x: 10, y: 20 } });
        expect(saved.legend).toEqual(legend);

        const opened = await harness.explorations.open(user, exploration.rid, APPLICATION);

        expect(opened.exploration.nodes).toEqual({ [b]: { x: 10, y: 20 } });
        expect(opened.exploration.legend).toEqual(legend);
        expect(Object.keys(opened.graph.nodes)).toEqual([b]);
    });

    it('a viewer may open but not save', async () => {
        const viewer = await harness.createUser('member');
        const projectRid = await harness.createProject(user);
        const exploration = await create(projectRid);

        await harness.grant(user, projectRid, viewer, 'viewer');

        await expect(harness.explorations.open(viewer, exploration.rid, APPLICATION)).resolves.toMatchObject({ exploration: { rid: exploration.rid } });
        await expect(harness.explorations.save(viewer, exploration.rid, { nodes: {}, legend: LineageExplorer.Legend.DEFAULT })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('someone who can only discover it can\'t open it', async () => {
        const discoverer = await harness.createUser('member');
        const projectRid = await harness.createProject(user);
        const exploration = await create(projectRid);

        await harness.grant(user, projectRid, discoverer, 'discoverer');

        await expect(harness.explorations.open(discoverer, exploration.rid, APPLICATION)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a node the viewer can\'t see isn\'t in the graph, but stays in the exploration', async () => {
        const viewer = await harness.createUser('member');
        const shared = await harness.createProject(user);
        const hidden = await harness.createProject(user);
        const { a } = await harness.createFolders(user, shared, ['a']);
        const { secret } = await harness.createFolders(user, hidden, ['secret']);
        const nodes = { [a]: { x: 0, y: 0 }, [secret]: { x: 200, y: 0 } };
        const exploration = await create(shared, nodes);

        await harness.grant(user, shared, viewer, 'viewer');
        await harness.library.lineage.declare(user, shared, MAIN, []);

        const opened = await harness.explorations.open(viewer, exploration.rid, APPLICATION);

        expect(Object.keys(opened.graph.nodes)).toEqual([a]);
        expect(opened.exploration.nodes).toEqual(nodes);
    });

    it('a trashed node drops out of the graph', async () => {
        const projectRid = await harness.createProject(user);
        const { a, b } = await harness.createFolders(user, projectRid, ['a', 'b']);
        const exploration = await create(projectRid, { [a]: { x: 0, y: 0 }, [b]: { x: 200, y: 0 } });

        await harness.library.lineage.declare(user, projectRid, MAIN, [{ upstreamRid: a, downstreamRid: b }]);
        await harness.trash(user, b);

        const opened = await harness.explorations.open(user, exploration.rid, APPLICATION);

        expect(Object.keys(opened.graph.nodes)).toEqual([a]);
        expect(opened.graph.edges).toEqual({});
    });

    it('a trashed exploration is gone', async () => {
        const projectRid = await harness.createProject(user);
        const exploration = await create(projectRid);

        await harness.trash(user, exploration.rid);

        await expect(harness.explorations.open(user, exploration.rid, APPLICATION)).rejects.toBeInstanceOf(NotFoundException);
    });
});
