/* eslint-disable @typescript-eslint/no-explicit-any */
// forceLayout.ts
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
    .force("charge", forceManyBody().strength(-200))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collision", forceCollide().radius(60))
    .force(
      "link",
      forceLink(simEdges as any)
        .id((d: any) => d.id)
        .distance(120)
        .strength(0.5)
    )
    .stop()

  for (let i = 0; i < 300; i++) simulation.tick()

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
