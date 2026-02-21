
import {
  forceSimulation,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceLink,
} from "d3-force"
import { Node, Edge, XYPosition } from "@xyflow/react"

export function applyForceLayout(
  nodes: Node[],
  edges: Edge[],
  width = 800,
  height = 600
) {
  // D3 expects plain objects, so clone
  const simNodes = nodes.map((n) => ({
    ...n,
    x: n.position?.x ?? 0,
    y: n.position?.y ?? 0,
  }))
  const simEdges = edges.map((e) => ({ ...e }))

  const simulation = forceSimulation(simNodes as any)
    .force("charge", forceManyBody().strength(-400))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collision", forceCollide().radius(50))
    .force(
      "link",
      forceLink(simEdges as any)
        .id((d: any) => d.id)
        .distance(160)
        .strength(0.4)
    )
    .stop()

  for (let i = 0; i < 400; i++) simulation.tick()

  // Center the graph: translate so the bounding box center is at (width/2, height/2)
  if (simNodes.length > 0) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of simNodes as any[]) {
      const x = n.x ?? 0
      const y = n.y ?? 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1
    const centerX = minX + spanX / 2
    const centerY = minY + spanY / 2
    const offsetX = width / 2 - centerX
    const offsetY = height / 2 - centerY
    for (const n of simNodes as any[]) {
      n.x = (n.x ?? 0) + offsetX
      n.y = (n.y ?? 0) + offsetY
    }
  }

  // Important: return React Flow nodes with position intact
  return simNodes.map((n: any) => {
    const orig = nodes.find((o) => o.id === n.id)!
    return {
      ...orig, // keep id, data, type, style, etc.
      position: { x: n.x, y: n.y } as XYPosition,
      data: orig.data ?? {}, // React Flow requires data
    }
  })
}
