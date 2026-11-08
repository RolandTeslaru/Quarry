import { BaseEdge, getStraightPath, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'

/**
 * A straight line from border to border, wherever the nodes are: it leaves each node at the point facing
 * the other, so it ignores the handles. React Flow's floating edge example, drawn straight.
 */
export function FloatingEdge({ id, source, target, markerEnd, style }: EdgeProps) {
    const sourceNode = useInternalNode(source)
    const targetNode = useInternalNode(target)

    // Not measured yet: nothing to draw from.
    if (!sourceNode?.measured.width || !targetNode?.measured.width)
        return null

    const start = getBorderPoint(sourceNode, targetNode)
    const end = getBorderPoint(targetNode, sourceNode)

    const [path] = getStraightPath({
        sourceX: start.x,
        sourceY: start.y,
        targetX: end.x,
        targetY: end.y,
    })

    return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}

/** Where the line from `node`'s centre to `other`'s centre crosses `node`'s border. */
function getBorderPoint(node: InternalNode, other: InternalNode) {
    const halfWidth = (node.measured.width ?? 0) / 2
    const halfHeight = (node.measured.height ?? 0) / 2

    const centreX = node.internals.positionAbsolute.x + halfWidth
    const centreY = node.internals.positionAbsolute.y + halfHeight
    const otherX = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2
    const otherY = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2

    // The direction to the other centre, in the node's own units (its half sides are 1), turned 45°: then the
    // border is the square |u| + |v| = 1, and scaling the direction onto it gives the crossing.
    const u = (otherX - centreX) / (2 * halfWidth) - (otherY - centreY) / (2 * halfHeight)
    const v = (otherX - centreX) / (2 * halfWidth) + (otherY - centreY) / (2 * halfHeight)
    const scale = 1 / (Math.abs(u) + Math.abs(v))

    return {
        x: halfWidth * (scale * u + scale * v) + centreX,
        y: halfHeight * (-scale * u + scale * v) + centreY,
    }
}
