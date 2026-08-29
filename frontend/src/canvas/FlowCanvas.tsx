import { useCallback, useEffect, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ArrangementObjectNode } from "./ArrangementObjectNode";
import { CalculationObjectNode } from "./CalculationObjectNode";
import { MappingEdge } from "./MappingEdge";
import { mergeFlowNodes, toFlowEdges, toFlowNodeRecords } from "./flowModel";
import { parseHandleId } from "../lib/display";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import type { ProjectDocument } from "../types/contract";
import { isArrangementObject, isCalculationObject, isValueFlowEdge } from "../lib/worksheet";

const nodeTypes = {
  calculationObject: CalculationObjectNode,
  arrangementObject: ArrangementObjectNode,
};
const edgeTypes = { mapping: MappingEdge };

const defaultEdgeOptions = {
  type: "mapping" as const,
  animated: false,
  className: "mapping-edge",
};

interface FlowCanvasProps {
  project: ProjectDocument;
  quantities: QuantitySpec[];
  onProjectChange: (project: ProjectDocument) => void;
  onEdit: (edit: WorkspaceEdit) => void;
}

function toFlowNodes(
  project: ProjectDocument,
  quantities: QuantitySpec[],
  onEdit: (edit: WorkspaceEdit) => void,
) {
  return toFlowNodeRecords(project, quantities, onEdit);
}

function endpointExists(
  project: ProjectDocument,
  objectId: string | null | undefined,
  portId: string,
  role: "source" | "target",
): boolean {
  if (!objectId) return false;
  const object = project.objects.find((item) => item.id === objectId);
  if (!object) return false;
  if (isArrangementObject(object)) {
    return object.domain.points.some((point) => point.id === portId);
  }
  if (!isCalculationObject(object)) return false;
  return role === "source"
    ? object.outputs.some((item) => item.id === portId)
    : object.inputs.some((item) => item.id === portId);
}

export function FlowCanvas({ project, quantities, onProjectChange, onEdit }: FlowCanvasProps) {
  const onToggle = useCallback((edgeId: string) => {
    onEdit({ type: "toggleEdge", edgeId });
  }, [onEdit]);
  const onToggleCollapsed = useCallback((edgeId: string) => {
    onEdit({ type: "toggleEdgeCollapsed", edgeId });
  }, [onEdit]);

  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(project, quantities, onEdit));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(project, onToggle, onToggleCollapsed));
  const didFit = useRef(false);

  useEffect(() => {
    const nextNodes = toFlowNodes(project, quantities, onEdit);
    setNodes((current) => mergeFlowNodes(current, nextNodes));
    setEdges(toFlowEdges(project, onToggle, onToggleCollapsed));
  }, [onEdit, onToggle, onToggleCollapsed, project, quantities, setEdges, setNodes]);

  const onInit = useCallback((instance: { fitView: (options?: { padding?: number }) => void }) => {
    if (didFit.current) return;
    didFit.current = true;
    instance.fitView({ padding: 0.18 });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = parseHandleId(connection.sourceHandle);
      const target = parseHandleId(connection.targetHandle);
      if (!connection.source || !connection.target || source?.kind !== "out" || target?.kind !== "in") {
        return;
      }
      const sourceObject = project.objects.find((item) => item.id === connection.source);
      const targetObject = project.objects.find((item) => item.id === connection.target);
      const relationType =
        (sourceObject && isArrangementObject(sourceObject)) ||
        (targetObject && isArrangementObject(targetObject))
          ? "association"
          : "value_flow";
      onEdit({
        type: "connectMapping",
        sourceObjectId: connection.source,
        sourceVariableId: source.variableId,
        targetObjectId: connection.target,
        targetVariableId: target.variableId,
        relationType,
      });
    },
    [onEdit, project.objects],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = parseHandleId(connection.sourceHandle);
      const target = parseHandleId(connection.targetHandle);
      if (source?.kind !== "out" || target?.kind !== "in" || connection.source === connection.target) {
        return false;
      }
      const sourceObject = project.objects.find((item) => item.id === connection.source);
      const targetObject = project.objects.find((item) => item.id === connection.target);
      if (!sourceObject || !targetObject) return false;
      if (isArrangementObject(sourceObject) || isArrangementObject(targetObject)) {
        return (
          endpointExists(project, connection.source, source.variableId, "source") &&
          endpointExists(project, connection.target, target.variableId, "target")
        );
      }
      if (!isCalculationObject(targetObject)) return false;
      if (targetObject.calculations.some((item) => item.id === source.variableId)) return false;
      const sourceBusy = project.edges.some(
        (edge) =>
          isValueFlowEdge(edge) &&
          edge.sourceObjectId === connection.source &&
          edge.sourceVariableId === source.variableId,
      );
      const targetBusy = project.edges.some(
        (edge) =>
          isValueFlowEdge(edge) &&
          edge.targetObjectId === connection.target &&
          edge.targetVariableId === target.variableId,
      );
      return !sourceBusy && !targetBusy;
    },
    [project],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.SmoothStep}
      onInit={onInit}
      onNodeDragStop={(_event, node) => {
        onProjectChange({
          ...project,
          objects: project.objects.map((object) =>
            object.id === node.id ? { ...object, position: node.position } : object,
          ),
        });
      }}
      deleteKeyCode={["Backspace", "Delete"]}
      onEdgesDelete={(deleted) => {
        onEdit({ type: "deleteEdges", edgeIds: deleted.map((edge) => edge.id) });
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#243044" />
      <Controls />
      <Panel position="top-left" className="canvas-panel">
        <button
          type="button"
          className="ghost-btn"
          data-testid="btn-add-object"
          onClick={() => onEdit({ type: "addObject" })}
        >
          + 객체 추가
        </button>
        <button
          type="button"
          className="ghost-btn"
          data-testid="btn-add-arrangement"
          onClick={() => onEdit({ type: "addArrangement" })}
        >
          + Arrangement
        </button>
      </Panel>
    </ReactFlow>
  );
}
