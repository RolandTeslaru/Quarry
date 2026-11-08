import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Foundations, type Graph, LineageExplorer } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { LineageExplorerHarness } from '../support/lineage-explorer-fixtures';

const MAIN = Foundations.MAIN_BRANCH;

/** The service as a process, reached through the main server's proxy with the shared API clients. */
describe('explorations over HTTP', () => {

    let harness: LineageExplorerHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await LineageExplorerHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('creates, saves and opens one', async () => {
        const api = await harness.getApi(user);
        const projectRid = await harness.createProject(user);
        const { a, b } = await harness.createFolders(user, projectRid, ['a', 'b']);

        await harness.library.lineage.declare(user, projectRid, MAIN, [{ upstreamRid: a, downstreamRid: b }]);

        const { exploration } = await LineageExplorer.API.Exploration.create(api, {
            parentRid:   projectRid,
            name:        'Everything',
            description: null,
            branch:      MAIN,
            nodes:       { [a]: { x: 0, y: 0 } },
            legend:      LineageExplorer.Legend.DEFAULT,
            edgeType:    'bezier',
        });

        const nodes = { [a]: { x: 0, y: 0 }, [b]: { x: 240, y: 0 } };
        const saved = await LineageExplorer.API.Exploration.save(api, exploration.rid, { nodes, legend: LineageExplorer.Legend.DEFAULT, edgeType: 'bezier' });

        expect(saved.exploration.nodes).toEqual(nodes);

        const opened = await LineageExplorer.API.Exploration.open(api, exploration.rid, { application: 'lineage-explorer' });
        const nodeB = LineageExplorer.Graph.Node.getRid(b);

        expect(opened.exploration.name).toBe('Everything');
        expect(opened.exploration.nodes).toEqual(nodes);
        expect(opened.graph.nodes[nodeB].position).toEqual({ x: 240, y: 0 });
        expect(opened.graph.nodes[nodeB].libraryResource.name).toBe('b');
        expect(Object.keys(opened.graph.edges)).toEqual([`${a}:${b}`]);
        expect(opened.graph.edges[`${a}:${b}` as Graph.Edge.Id].lineageEdge).toEqual({
            upstreamRid:   a,
            downstreamRid: b,
            branch:        MAIN,
            declaredByRid: projectRid,
        });
    });
});
