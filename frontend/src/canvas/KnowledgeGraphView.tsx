import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import { deriveKnowledgeGraph, hierarchyWindow, type GraphKind } from "../lib/knowledgeGraph";
import { backlinksTo, isMemoObject } from "../lib/memo";
import type { ProjectDocument } from "../types/contract";

const KIND_COLOR: Record<GraphKind, string> = {
  memo: "#c4a574",
  calculation: "#3ecf8e",
  equipment: "#7dd3fc",
  point: "#f0b429",
  tag: "#c084fc",
};

export function KnowledgeGraphView({
  project,
  onOpenObject,
}: {
  project: ProjectDocument;
  onOpenObject: (objectId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphCanvas project={project} onOpenObject={onOpenObject} />
    </ReactFlowProvider>
  );
}

function KnowledgeGraphCanvas({
  project,
  onOpenObject,
}: {
  project: ProjectDocument;
  onOpenObject: (objectId: string) => void;
}) {
  const graph = useMemo(() => deriveKnowledgeGraph(project), [project]);
  const [kinds, setKinds] = useState<Record<GraphKind, boolean>>({
    memo: true,
    calculation: true,
    equipment: true,
    point: true,
    tag: true,
  });
  const [query, setQuery] = useState("");
  const [showValueFlow, setShowValueFlow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [depth, setDepth] = useState<"all" | "1" | "2" | "3">("all");

  const hierarchyIds =
    depth !== "all" && selectedId && !selectedId.startsWith("tag:")
      ? hierarchyWindow(project, selectedId, Number(depth))
      : null;
  const visible = new Set(
    graph.nodes
      .filter((node) => kinds[node.kind])
      .filter((node) => !query || node.label.toLowerCase().includes(query.toLowerCase()) || node.id.toLowerCase().includes(query.toLowerCase()))
      .filter((node) => {
        if (!hierarchyIds) return true;
        if (node.kind === "tag") {
          return graph.edges.some((edge) => edge.kind === "tag" && edge.target === node.id && hierarchyIds.has(edge.source));
        }
        return hierarchyIds.has(node.id) || graph.edges.some((edge) => hierarchyIds.has(edge.source) && edge.target === node.id);
      })
      .map((node) => node.id),
  );
  const nodes: Node[] = graph.nodes
    .filter((node) => visible.has(node.id))
    .map((node, index) => ({
      id: node.id,
      position: { x: 80 + (index % 6) * 160, y: 60 + Math.floor(index / 6) * 100 },
      data: { label: node.label },
      style: {
        background: KIND_COLOR[node.kind],
        color: "#111827",
        borderRadius: node.kind === "tag" ? 18 : node.kind === "point" ? 20 : 6,
        fontSize: 11,
        padding: 6,
        opacity: selectedId && selectedId !== node.id && !neighbor(graph.edges, selectedId, node.id) ? 0.28 : 1,
      },
    }));
  const edges: Edge[] = graph.edges
    .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
    .filter((edge) => showValueFlow || edge.kind !== "value-flow")
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      style: {
        stroke: edge.kind === "tag" ? "#c084fc" : edge.kind === "hierarchy" ? "#e2e8f0" : "#94a3b8",
        strokeDasharray: edge.kind === "memo-attachment" || edge.kind === "tag" ? "4 3" : undefined,
      },
    }));

  const selected = project.objects.find((item) => item.id === selectedId);
  const backlinks = selectedId ? backlinksTo(project, selectedId) : [];

  return (
    <div className="kg-view" data-testid="knowledge-graph">
      <aside className="kg-view__filters">
        <input value={query} placeholder="검색" data-testid="kg-search" onChange={(event) => setQuery(event.target.value)} />
        {(Object.keys(kinds) as GraphKind[]).map((kind) => (
          <label key={kind}>
            <input type="checkbox" checked={kinds[kind]} onChange={() => setKinds((current) => ({ ...current, [kind]: !current[kind] }))} />
            {kind}
          </label>
        ))}
        <label>
          <input type="checkbox" checked={showValueFlow} onChange={() => setShowValueFlow((value) => !value)} />
          Calc value flow
        </label>
        <label>
          Parent/Child 깊이
          <select data-testid="kg-depth" value={depth} onChange={(event) => setDepth(event.target.value as typeof depth)}>
            <option value="all">전체</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
        {selected ? (
          <div className="kg-inspector" data-testid="kg-inspector">
            <p>{isMemoObject(selected) ? selected.title || selected.id : selected.name}</p>
            <p>{selected.kind ?? "calculation"}</p>
            <p>Backlinks {backlinks.length}</p>
            <ul>
              {backlinks.map((link) => (
                <li key={link.id}>{link.sourceMemoId}</li>
              ))}
            </ul>
          </div>
        ) : selectedId?.startsWith("tag:") ? (
          <div className="kg-inspector" data-testid="kg-inspector">
            <p>{graph.nodes.find((node) => node.id === selectedId)?.label}</p>
            <p>tag</p>
          </div>
        ) : null}
      </aside>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_event, node) => setSelectedId(node.id)}
        nodesDraggable
        panOnScroll
        zoomOnScroll
        onNodeDoubleClick={(_event, node) => {
          if (!node.id.startsWith("tag:")) onOpenObject(node.id);
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

function neighbor(edges: Array<{ source: string; target: string }>, selected: string, other: string): boolean {
  return edges.some(
    (edge) =>
      (edge.source === selected && edge.target === other) || (edge.target === selected && edge.source === other),
  );
}
