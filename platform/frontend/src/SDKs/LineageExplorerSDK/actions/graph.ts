import dagre from '@dagrejs/dagre'
import { Graph, LineageExplorer, type Library } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { describeError, errorMessage } from '@/SDKs/api'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { LineageExplorerSDKImpl } from '../sdk'

const FIT_VIEW_OPTIONS = {
    padding:  0.2,
    duration: 200,
}

/** `LineageExplorerSDK.actions.graph`: edits to the open exploration's canvas. Nothing is saved until Save. */
export class GraphActions extends ActionGroup<LineageExplorerSDKImpl> {

    protected readonly log = log.withContext('LineageExplorer.Actions.Graph')

    /** Brings in what feeds the node, or what it feeds, one hop away. */
    public async expand(rid: LineageExplorer.Graph.Node.Rid, direction: LineageExplorer.Document.Direction): Promise<void> {
        const document = this.sdk.document
        const resourceRid = this.sdk.selectors.node.get(document, rid).libraryResource.rid
        const request = {
            branch:         document.exploration.branch,
            depth:          1,
            includeTrashed: false,
        }

        try {
            let read: Library.API.Lineage.Get.Response

            if (direction === 'upstream')
                read = await LibrarySDK.actions.lineage.getUpstream(resourceRid, request)
            else
                read = await LibrarySDK.actions.lineage.getDownstream(resourceRid, request)

            this.sdk.setDocument(d => {
                d.reducers.lineage.addNeighbours(d, rid, direction, read.resources, this.sdk.getNodeSizes())
            })

            await this.refreshEdges()
        } catch (error) {
            this.log.error('expand failed', describeError(error))
            NotificationSDK.toast.error("Couldn't expand the lineage", { description: errorMessage(error) })

            throw error
        }
    }

    public openAddResource(): void {
        LibrarySDK.dialogs.openLibrarySelector({
            accept:   ['dataset', 'source'],
            onSelect: resource => this.addResource(resource),
        })
    }

    /** A resource already on the canvas stays where it is. */
    public async addResource(resource: Library.Resource.Base): Promise<void> {
        const document = this.sdk.document

        if (this.sdk.selectors.node.has(document, LineageExplorer.Graph.Node.getRid(resource.rid)))
            return

        try {
            this.sdk.setDocument(d => {
                d.reducers.resource.add(d, resource, this.sdk.getNodeSizes())
            })

            await this.refreshEdges()
        } catch (error) {
            this.log.error('add resource failed', describeError(error))
            NotificationSDK.toast.error("Couldn't add the resource", { description: errorMessage(error) })

            throw error
        }
    }

    public remove(rids: Set<LineageExplorer.Graph.Node.Rid>): void {
        this.sdk.setDocument(d => {
            for (const rid of rids)
                d.reducers.node.remove(d, rid)
        })
    }

    /** Where nodes were dropped: the canvas reports them once, when a drag stops. */
    public setPositions(positions: Record<LineageExplorer.Graph.Node.Rid, LineageExplorer.Graph.Node['position']>): void {
        this.sdk.setDocument(d => {
            d.reducers.layout.node.setPositions(d, positions)
        })
    }

    /**
     * Dagre, left to right: sources on the left, each node at its size. Dagre centres a column's nodes on one x;
     * they're then aligned on their left edges instead, as Foundry's hierarchy is.
     */
    public arrange(): void {
        const document = this.sdk.document
        const sizes = this.sdk.getNodeSizes()
        const graph = new dagre.graphlib.Graph()

        graph.setGraph({
            rankdir: 'LR',
            ranksep: Graph.Document.COLUMN_GAP,
            nodesep: Graph.Document.ROW_GAP,
        })
        graph.setDefaultEdgeLabel(() => ({}))

        const rids = Object.keys(document.nodes) as LineageExplorer.Graph.Node.Rid[]

        for (const rid of rids)
            graph.setNode(rid, this.sdk.selectors.layout.getSize(sizes, rid))

        for (const edge of Object.values(document.edges))
            graph.setEdge(edge.sourceRid, edge.targetRid)

        dagre.layout(graph)

        // A column is every node Dagre put on the same centre x; its left edge is set by its widest node.
        const columnWidths: Record<number, number> = {}

        for (const rid of rids) {
            const { x } = graph.node(rid)

            columnWidths[x] = Math.max(columnWidths[x] ?? 0, this.sdk.selectors.layout.getSize(sizes, rid).width)
        }

        const positions: Record<LineageExplorer.Graph.Node.Rid, LineageExplorer.Graph.Node['position']> = {}

        for (const rid of rids) {
            const { x, y } = graph.node(rid)

            positions[rid] = {
                x: x - columnWidths[x] / 2,
                y: y - this.sdk.selectors.layout.getSize(sizes, rid).height / 2,
            }
        }

        this.sdk.setDocument(d => {
            d.reducers.layout.node.setPositions(d, positions)
        })

        // The canvas has taken the new positions by the next frame.
        window.requestAnimationFrame(() => {
            void this.sdk.runtime.reactFlow?.fitView(FIT_VIEW_OPTIONS)
        })
    }

    /** Edges are never saved: they're read again, among the nodes on the canvas, whenever nodes are added. */
    public async refreshEdges(): Promise<void> {
        const document = this.sdk.document

        const { edges } = await LibrarySDK.actions.lineage.getGraph({
            rids:   this.sdk.selectors.exploration.getResourceRids(document),
            branch: document.exploration.branch,
        })

        this.sdk.setDocument(d => {
            d.reducers.lineage.setEdges(d, edges)
        })
    }
}
