import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ArrangementLinkEdge } from "./ArrangementLinkEdge";
import { CalculationObjectNode } from "./CalculationObjectNode";
import { EquipmentObjectNode } from "./EquipmentObjectNode";
import { MappingEdge } from "./MappingEdge";
import { PointObjectNode } from "./PointObjectNode";
import { mergeFlowNodes, toFlowEdges, toFlowNodeRecords } from "./flowModel";
import { parseHandleId } from "../lib/display";
import { type WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import type { ProjectDocument } from "../types/contract";
import {
  OBJECT_LINK_HANDLE,
  canConnectObjectLink,
  isCalculationObject,
  isLayoutObject,
  isLayoutPortId,
  isObjectLinkHandle,
  isValueFlowEdge,
} from "../lib/worksheet";

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
  onUndo?: () => void;
  onRedo?: () => void;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
}

function CanvasZoomHotkeys() {
  const { zoomIn, zoomOut } = useReactFlow();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "PageUp" || event.code === "PageUp") {
        event.preventDefault();
        void zoomIn();
        return;
      }
      if (event.key === "PageDown" || event.code === "PageDown") {
        event.preventDefault();
        void zoomOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut]);
  return null;
}

export function FlowCanvas({ project, quantities, onProjectChange, onEdit, onUndo, onRedo }: FlowCanvasProps) {
  const onToggle = useCallback((edgeId: string) => {
    onEdit({ type: "toggleEdge", edgeId });
  }, [onEdit]);
  const onToggleCollapsed = useCallback((edgeId: string) => {
    onEdit({ type: "toggleEdgeCollapsed", edgeId });
  }, [onEdit]);
  const onToggleDirection = useCallback((pointId: string, end: string) => {
    onEdit({ type: "togglePointLink", pointId, end });
  }, [onEdit]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(toFlowNodeRecords(project, quantities, onEdit) as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(project, onToggle, onToggleCollapsed, onToggleDirection, onEdit),
  );
  const [snap, setSnap] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [clipboard, setClipboard] = useState<string[]>([]);
  const didFit = useRef(false);

  useEffect(() => {
    const nextNodes = toFlowNodeRecords(project, quantities, onEdit);
    setNodes((current) => mergeFlowNodes(current, nextNodes as Node[]));
    setEdges(toFlowEdges(project, onToggle, onToggleCollapsed, onToggleDirection, onEdit));
  }, [onEdit, onToggle, onToggleCollapsed, onToggleDirection, project, quantities, setEdges, setNodes]);

  const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id);
  const selectedLayoutIds = selectedIds.filter((id) => project.objects.some((item) => item.id === id && isLayoutObject(item)));

  const onInit = useCallback((instance: { fitView: (options?: { padding?: number }) => void }) => {
    if (didFit.current) return;
    didFit.current = true;
    instance.fitView({ padding: 0.18 });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const sourceObject = project.objects.find((item) => item.id === connection.source);
      const targetObject = project.objects.find((item) => item.id === connection.target);
      if (!sourceObject || !targetObject) return;

      if (
        (isObjectLinkHandle(connection.sourceHandle) || isObjectLinkHandle(connection.targetHandle)) &&
        ((isCalculationObject(sourceObject) && isLayoutObject(targetObject)) ||
          (isLayoutObject(sourceObject) && isCalculationObject(targetObject)))
      ) {
        const calc = isCalculationObject(sourceObject) ? sourceObject : targetObject;
        const layout = isLayoutObject(sourceObject) ? sourceObject : targetObject;
        if (!canConnectObjectLink(project, calc.id, layout.id)) return;
        onEdit({
          type: "connectLink",
          objectId: calc.id,
          targetObjectId: layout.id,
          targetPortId: OBJECT_LINK_HANDLE,
        });
        return;
      }

      if (
        isLayoutObject(sourceObject) &&
        isLayoutObject(targetObject) &&
        isLayoutPortId(connection.sourceHandle) &&
        isLayoutPortId(connection.targetHandle)
      ) {
        onEdit({
          type: "connectArrangement",
          sourceObjectId: sourceObject.id,
          sourcePortId: connection.sourceHandle,
          targetObjectId: targetObject.id,
          targetPortId: connection.targetHandle,
        });
        return;
      }

      const source = parseHandleId(connection.sourceHandle);
      const target = parseHandleId(connection.targetHandle);
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
    [onEdit, project],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const sourceObject = project.objects.find((item) => item.id === connection.source);
      const targetObject = project.objects.find((item) => item.id === connection.target);
      if (!sourceObject || !targetObject) return false;

      if (isObjectLinkHandle(connection.sourceHandle) || isObjectLinkHandle(connection.targetHandle)) {
        if (
          !(
            (isCalculationObject(sourceObject) && isLayoutObject(targetObject)) ||
            (isLayoutObject(sourceObject) && isCalculationObject(targetObject))
          )
        ) {
          return false;
        }
        const calc = isCalculationObject(sourceObject) ? sourceObject : targetObject;
        const layout = isLayoutObject(sourceObject) ? sourceObject : targetObject;
        return canConnectObjectLink(project, calc.id, layout.id);
      }
      if (isLayoutObject(sourceObject) && isLayoutObject(targetObject)) {
        return isLayoutPortId(connection.sourceHandle) && isLayoutPortId(connection.targetHandle);
      }

      const source = parseHandleId(connection.sourceHandle);
      const target = parseHandleId(connection.targetHandle);
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

  const copySelected = useCallback(() => {
    if (selectedIds.length) setClipboard(selectedIds);
  }, [selectedIds]);
  const pasteClipboard = useCallback(() => {
    if (clipboard.length) onEdit({ type: "duplicateObjects", objectIds: clipboard });
  }, [clipboard, onEdit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "c") {
        copySelected();
        return;
      }
      if (meta && event.key.toLowerCase() === "v") {
        pasteClipboard();
        return;
      }
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo?.();
        return;
      }
      if ((meta && event.key.toLowerCase() === "y") || (meta && event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        onRedo?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelected, onRedo, onUndo, pasteClipboard]);

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
      onPaneClick={() => setMenu(null)}
      onNodeContextMenu={(event, node) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, ids: node.selected ? selectedIds : [node.id] });
      }}
      onEdgeDoubleClick={(_event, edge) => {
        onEdit({ type: "deleteEdges", edgeIds: [edge.id] });
      }}
      onNodeDragStop={(_event, _node, dragged) => {
        const moved = new Map(dragged.map((node) => [node.id, node.position]));
        onProjectChange({
          ...project,
          objects: project.objects.map((object) =>
            moved.has(object.id) ? { ...object, position: moved.get(object.id)! } : object,
          ),
        });
      }}
      deleteKeyCode={["Backspace", "Delete"]}
      onEdgesDelete={(deleted) => {
        onEdit({ type: "deleteEdges", edgeIds: deleted.map((edge) => edge.id) });
      }}
      onNodesDelete={(deleted) => {
        deleted.forEach((node) => onEdit({ type: "deleteObject", objectId: node.id }));
      }}
      multiSelectionKeyCode="Shift"
      selectionOnDrag={selectMode}
      selectionMode={SelectionMode.Partial}
      panOnDrag={selectMode ? [1] : true}
      snapToGrid={snap}
      snapGrid={[11, 11]}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#243044" />
      <Controls className="ws-zoom-controls" />
      <CanvasZoomHotkeys />
      <Panel position="top-left" className="canvas-panel canvas-panel--pid">
        <button
          type="button"
          className="ghost-btn"
          data-testid="btn-add-object"
          onClick={() => onEdit({ type: "addObject" })}
        >
          Cal. 추가
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
        <button
          type="button"
          className={`ghost-btn ${selectMode ? "ghost-btn--on" : ""}`}
          data-testid="btn-select-mode"
          onClick={() => setSelectMode((value) => !value)}
        >
          영역 선택
        </button>
        <button
          type="button"
          className={`ghost-btn ${snap ? "ghost-btn--on" : ""}`}
          data-testid="btn-grid-snap"
          onClick={() => setSnap((value) => !value)}
        >
          Grid snap
        </button>
      </Panel>
      {selectedIds.length > 0 ? (
        <Panel position="bottom-right" className="canvas-panel pid-selection-bar">
          <button type="button" className="ghost-btn" data-testid="btn-copy-objects" onClick={copySelected}>
            복사
          </button>
          <button
            type="button"
            className="ghost-btn"
            data-testid="btn-paste-objects"
            disabled={!clipboard.length}
            onClick={pasteClipboard}
          >
            붙여넣기
          </button>
          {selectedLayoutIds.length > 0 ? (
            <>
              <button type="button" className="ghost-btn" onClick={() => onEdit({ type: "rotateEquipment", objectIds: selectedLayoutIds, delta: 90 })}>
                회전
              </button>
              <button type="button" className="ghost-btn" onClick={() => onEdit({ type: "alignObjects", objectIds: selectedLayoutIds, mode: "left" })}>
                정렬
              </button>
              <button type="button" className="ghost-btn" onClick={() => onEdit({ type: "alignObjects", objectIds: selectedLayoutIds, mode: "h-gap" })}>
                간격
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => selectedIds.forEach((objectId) => onEdit({ type: "deleteObject", objectId }))}
          >
            삭제
          </button>
        </Panel>
      ) : null}
      {menu ? (
        <div className="pid-menu" style={{ left: menu.x, top: menu.y }}>
          <button type="button" onClick={() => { setClipboard(menu.ids); setMenu(null); }}>
            복사
          </button>
          <button type="button" onClick={() => { pasteClipboard(); setMenu(null); }}>
            붙여넣기
          </button>
          {menu.ids.some((id) => project.objects.some((item) => item.id === id && isLayoutObject(item))) ? (
            <button type="button" onClick={() => { onEdit({ type: "rotateEquipment", objectIds: menu.ids, delta: 90 }); setMenu(null); }}>
              90° 회전
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              menu.ids.forEach((objectId) => onEdit({ type: "deleteObject", objectId }));
              setMenu(null);
            }}
          >
            삭제
          </button>
        </div>
      ) : null}
    </ReactFlow>
  );
}