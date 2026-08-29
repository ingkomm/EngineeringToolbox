import { useCallback, useEffect, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ArrangementLinkEdge } from "./ArrangementLinkEdge";
import { CalculationObjectNode } from "./CalculationObjectNode";
import { EquipmentObjectNode } from "./EquipmentObjectNode";
import { MappingEdge } from "./MappingEdge";
import { PointObjectNode } from "./PointObjectNode";
import { mergeFlowNodes, toFlowEdges, toFlowNodeRecords } from "./flowModel";
import { parseHandleId } from "../lib/display";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import type { ProjectDocument } from "../types/contract";
import { isCalculationObject, isLayoutObject, isPointObject, isValueFlowEdge } from "../lib/worksheet";

const nodeTypes = {
  calculationObject: CalculationObjectNode,
  equipmentObject: EquipmentObjectNode,
  pointObject: PointObjectNode,
};
const edgeTypes = { mapping: MappingEdge, arrangementLink: ArrangementLinkEdge };

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

function isLayoutPortHandle(handleId: string | null | undefined): boolean {
  return Boolean(handleId && /^(IN|OUT|C)_\d+$/.test(handleId));
}

export function FlowCanvas({ project, quantities, onProjectChange, onEdit }: FlowCanvasProps) {
  const onToggle = useCallback((edgeId: string) => {
    onEdit({ type: "toggleEdge", edgeId });
  }, [onEdit]);
  const onToggleCollapsed = useCallback((edgeId: string) => {
    onEdit({ type: "toggleEdgeCollapsed", edgeId });
  }, [onEdit]);
  const onToggleDirection = useCallback((pointId: string, end: string) => {
    onEdit({ type: "togglePointLink", pointId, end });
  }, [onEdit]);

  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(project, quantities, onEdit));
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(project, onToggle, onToggleCollapsed, onToggleDirection),
  );
  const didFit = useRef(false);

  useEffect(() => {
    const nextNodes = toFlowNodes(project, quantities, onEdit);
    setNodes((current) => mergeFlowNodes(current, nextNodes));
    setEdges(toFlowEdges(project, onToggle, onToggleCollapsed, onToggleDirection));
  }, [onEdit, onToggle, onToggleCollapsed, onToggleDirection, project, quantities, setEdges, setNodes]);

  const onInit = useCallback((instance: { fitView: (options?: { padding?: number }) => void }) => {
    if (didFit.current) return;
    didFit.current = true;
    instance.fitView({ padding: 0.18 });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target && connection.sourceHandle === connection.targetHandle) return;
      const sourceObject = project.objects.find((item) => item.id === connection.source);
      const targetObject = project.objects.find((item) => item.id === connection.target);
      if (!sourceObject || !targetObject) return;

      if (isPointObject(sourceObject) && isLayoutObject(targetObject) && isLayoutPortHandle(connection.sourceHandle)) {
        const port = isLayoutPortHandle(connection.targetHandle) ? connection.targetHandle : targetObject.id;
        onEdit({
          type: "connectPointEnd",
          pointId: sourceObject.id,
          end: connection.sourceHandle!,
          targetObjectId: targetObject.id,
          targetPortId: port!,
          reversed: false,
        });
        return;
      }
      if (isLayoutObject(sourceObject) && isPointObject(targetObject) && isLayoutPortHandle(connection.targetHandle)) {
        const port = isLayoutPortHandle(connection.sourceHandle) ? connection.sourceHandle : sourceObject.id;
        onEdit({
          type: "connectPointEnd",
          pointId: targetObject.id,
          end: connection.targetHandle!,
          targetObjectId: sourceObject.id,
          targetPortId: port!,
          reversed: true,
        });
        return;
      }

      const source = parseHandleId(connection.sourceHandle);
      const target = parseHandleId(connection.targetHandle);
      if (source?.kind === "link" && isCalculationObject(sourceObject) && isLayoutObject(targetObject)) {
        onEdit({
          type: "connectLink",
          objectId: sourceObject.id,
          linkId: source.variableId,
          targetObjectId: targetObject.id,
          targetPortId: isLayoutPortHandle(connection.targetHandle) ? connection.targetHandle : targetObject.id,
        });
        return;
      }
      if (source?.kind !== "out" || target?.kind !== "in") return;
      if (!isCalculationObject(sourceObject) || !isCalculationObject(targetObject)) return;
      onEdit({
        type: "connectMapping",
        sourceObjectId: connection.source,
        sourceVariableId: source.variableId,
        targetObjectId: connection.target,
        targetVariableId: target.variableId,
      });
    },
    [onEdit, project.objects],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target && connection.sourceHandle === connection.targetHandle) return false;
      const sourceObject = project.objects.find((item) => item.id === connection.source);
      const targetObject = project.objects.find((item) => item.id === connection.target);
      if (!sourceObject || !targetObject) return false;

      if (isPointObject(sourceObject) && isLayoutObject(targetObject)) {
        return isLayoutPortHandle(connection.sourceHandle);
      }
      if (isLayoutObject(sourceObject) && isPointObject(targetObject)) {
        return isLayoutPortHandle(connection.targetHandle);
      }

      const source = parseHandleId(connection.sourceHandle);
      const target = parseHandleId(connection.targetHandle);
      if (source?.kind === "link" && isCalculationObject(sourceObject) && isLayoutObject(targetObject)) {
        return true;
      }
      if (source?.kind !== "out" || target?.kind !== "in") return false;
      if (!isCalculationObject(sourceObject) || !isCalculationObject(targetObject)) return false;
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
      connectionMode={ConnectionMode.Loose}
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
          data-testid="btn-add-equipment"
          onClick={() => onEdit({ type: "addEquipment" })}
        >
          + Equipment
        </button>
        <button
          type="button"
          className="ghost-btn"
          data-testid="btn-add-point"
          onClick={() => onEdit({ type: "addPoint" })}
        >
          + Point
        </button>
      </Panel>
    </ReactFlow>
  );
}
