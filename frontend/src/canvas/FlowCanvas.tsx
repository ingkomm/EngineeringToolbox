import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CalculationObjectNode, type CalculationObjectNodeType } from "./CalculationObjectNode";
import { toFlowEdges, toFlowNodeRecords } from "./flowModel";
import { parseHandleId } from "../lib/display";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import type { MappingEdge, ProjectDocument } from "../types/contract";

const nodeTypes = { calculationObject: CalculationObjectNode };

const defaultEdgeOptions = {
  type: "smoothstep" as const,
  animated: false,
  className: "mapping-edge",
};

interface FlowCanvasProps {
  project: ProjectDocument;
  quantities: QuantitySpec[];
  onProjectChange: (project: ProjectDocument) => void;
  onGraphEvaluate: (project: ProjectDocument, dirtyObjectIds?: string[]) => void;
  onEdit: (edit: WorkspaceEdit) => void;
}

function toFlowNodes(
  project: ProjectDocument,
  quantities: QuantitySpec[],
  onEdit: (edit: WorkspaceEdit) => void,
): CalculationObjectNodeType[] {
  return toFlowNodeRecords(project, quantities, onEdit);
}

export function FlowCanvas({ project, quantities, onProjectChange, onGraphEvaluate, onEdit }: FlowCanvasProps) {
  const initialNodes = useMemo(() => toFlowNodes(project, quantities, onEdit), [onEdit, project, quantities]);
  const initialEdges = useMemo(() => toFlowEdges(project.edges), [project.edges]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CalculationObjectNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(toFlowNodes(project, quantities, onEdit));
    setEdges(toFlowEdges(project.edges));
  }, [onEdit, project, quantities, setEdges, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = parseHandleId(connection.sourceHandle);
      const target = parseHandleId(connection.targetHandle);
      if (!connection.source || !connection.target || source?.kind !== "out" || target?.kind !== "in") {
        return;
      }
      const alreadyTaken = project.edges.some(
        (edge) => edge.targetObjectId === connection.target && edge.targetVariableId === target.variableId,
      );
      if (alreadyTaken) return;

      const mapping: MappingEdge = {
        id: `edge-${connection.source}-${source.variableId}-${connection.target}-${target.variableId}`,
        sourceObjectId: connection.source,
        sourceVariableId: source.variableId,
        targetObjectId: connection.target,
        targetVariableId: target.variableId,
      };
      onGraphEvaluate(
        {
          ...project,
          edges: [...project.edges, mapping],
        },
        [mapping.sourceObjectId],
      );
    },
    [onGraphEvaluate, project],
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const source = parseHandleId(connection.sourceHandle);
    const target = parseHandleId(connection.targetHandle);
    return source?.kind === "out" && target?.kind === "in" && connection.source !== connection.target;
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.SmoothStep}
      onNodeDragStop={(_event, node) => {
        onProjectChange({
          ...project,
          objects: project.objects.map((object) =>
            object.id === node.id ? { ...object, position: node.position } : object,
          ),
        });
      }}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      deleteKeyCode={["Backspace", "Delete"]}
      onEdgesDelete={(deleted) => {
        const removed = new Set(deleted.map((edge) => edge.id));
        const next: ProjectDocument = {
          ...project,
          edges: project.edges.filter((edge) => !removed.has(edge.id)),
        };
        onGraphEvaluate(
          next,
          deleted.map((edge) => edge.target),
        );
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#243044" />
      <Controls />
      <MiniMap pannable zoomable nodeColor="#16324a" maskColor="rgba(6, 10, 16, 0.72)" />
      <Panel position="top-left" className="canvas-panel">
        <button
          type="button"
          className="ghost-btn"
          data-testid="btn-add-object"
          onClick={() => onEdit({ type: "addObject" })}
        >
          + 객체 추가
        </button>
      </Panel>
    </ReactFlow>
  );
}
