import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  SelectionMode,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ArrangementLinkEdge } from "../arrangement/ArrangementLinkEdge";
import { CalculationObjectNode } from "../calculation/CalculationObjectNode";
import { EquipmentObjectNode } from "../arrangement/EquipmentObjectNode";
import { MappingEdge } from "../calculation/MappingEdge";
import { MemoLinkEdge } from "../memo/MemoLinkEdge";
import { MemoObjectNode } from "../memo/MemoObjectNode";
import { PointObjectNode } from "../arrangement/PointObjectNode";
import { mergeFlowNodes, toFlowEdges, toFlowNodeRecords } from "./flowModel";
import { CANVAS_GRID, POINT_NODE_SIZE, snapPositionToGrid, toTopLeftPosition } from "./grid";
import { parseHandleId } from "./display";
import { type WorkspaceEdit } from "./projectEdits";
import { parseLibraryDrag, libraryPlaceEdit } from "./libraryPlace";
import { associationConnectTargets, isValidCanvasConnection } from "./connectionRules";
import { isMemoAttachmentHandle, isMemoObject, MEMO_ATTACHMENT_HANDLE, MEMO_RECEIVE_HANDLE } from "../memo/memo";
import { findLibrarySymbol } from "../arrangement/symbols/library";
import { equipmentBounds } from "../arrangement/arrangementView";
import type { QuantitySpec } from "./quantities";
import type { ProjectDocument } from "../types/contract";
import {
  OBJECT_LINK_HANDLE,
  isCalculationObject,
  isLayoutObject,
  isLayoutPortId,
  isObjectLinkHandle,
} from "./worksheet";

const nodeTypes = {
  calculationObject: CalculationObjectNode,
  equipmentObject: EquipmentObjectNode,
  pointObject: PointObjectNode,
  memoObject: MemoObjectNode,
};
const edgeTypes = { mapping: MappingEdge, arrangementLink: ArrangementLinkEdge, memoLink: MemoLinkEdge };

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

  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useNodesState<Node>(toFlowNodeRecords(project, quantities, onEdit) as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(project, onToggle, onToggleCollapsed, onToggleDirection, onEdit),
  );
  const [snap, setSnap] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [clipboard, setClipboard] = useState<string[]>([]);
  const [connectingHandleId, setConnectingHandleId] = useState<string | null>(null);
  const didFit = useRef(false);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const nextNodes = toFlowNodeRecords(project, quantities, onEdit);
    setNodes((current) => mergeFlowNodes(current, nextNodes as Node[]));
    setEdges(toFlowEdges(project, onToggle, onToggleCollapsed, onToggleDirection, onEdit));
  }, [onEdit, onToggle, onToggleCollapsed, onToggleDirection, project, quantities, setEdges, setNodes]);

  const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id);
  const selectedLayoutIds = selectedIds.filter((id) => project.objects.some((item) => item.id === id && isLayoutObject(item)));

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        if (!snap) return next;
        const moved = new Set(
          changes.filter((change) => change.type === "position").map((change) => change.id),
        );
        if (moved.size === 0) return next;
        return next.map((node) =>
          moved.has(node.id) ? { ...node, position: snapPositionToGrid(node.position) } : node,
        );
      });
    },
    [setNodes, snap],
  );

  const onInit = useCallback((instance: { fitView: (options?: { padding?: number }) => void }) => {
    if (didFit.current) return;
    didFit.current = true;
    instance.fitView({ padding: 0.18 });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidCanvasConnection(project, connection)) return;
      if (!connection.source || !connection.target) return;
      const sourceObject = project.objects.find((item) => item.id === connection.source);
      const targetObject = project.objects.find((item) => item.id === connection.target);
      if (!sourceObject || !targetObject) return;

      if (
        isMemoObject(sourceObject) &&
        !isMemoObject(targetObject) &&
        connection.sourceHandle === MEMO_ATTACHMENT_HANDLE &&
        connection.targetHandle === MEMO_RECEIVE_HANDLE
      ) {
        onEdit({ type: "connectMemoLink", memoId: sourceObject.id, targetObjectId: targetObject.id });
        return;
      }

      if (isObjectLinkHandle(connection.sourceHandle) || isObjectLinkHandle(connection.targetHandle)) {
        const assoc = associationConnectTargets(project, connection.source, connection.target);
        if (!assoc) return;
        onEdit({
          type: "connectLink",
          objectId: assoc.calcId,
          targetObjectId: assoc.layoutId,
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
    (connection: Connection | Edge) => isValidCanvasConnection(project, connection),
    [project],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const payload = parseLibraryDrag(event.dataTransfer.getData("text/plain"));
      if (!payload) return;
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const snapped = snap ? snapPositionToGrid(flow) : flow;
      let position = snapped;
      if (payload.place === "point") {
        position = toTopLeftPosition(snapped, POINT_NODE_SIZE, POINT_NODE_SIZE);
      } else if (payload.place === "equipment") {
        const template = findLibrarySymbol(project, payload.symbolId);
        const width = template?.drawing?.width ?? 99;
        const height = template?.drawing?.height ?? 77;
        position = toTopLeftPosition(snapped, width, height);
      }
      onEdit(libraryPlaceEdit(payload, position));
    },
    [onEdit, project, screenToFlowPosition, snap],
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
      onDragOver={onDragOver}
      onDrop={onDrop}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={isMemoAttachmentHandle(connectingHandleId) ? 20 : 6}
      className={
        isMemoAttachmentHandle(connectingHandleId)
          ? "rf-connecting-memo"
          : connectingHandleId
            ? "rf-connecting-port"
            : undefined
      }
      onConnectStart={(_event, params) => setConnectingHandleId(params.handleId ?? null)}
      onConnectEnd={() => setConnectingHandleId(null)}
      onInit={onInit}
      onPaneClick={() => setMenu(null)}
      onNodeContextMenu={(event, node) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, ids: node.selected ? selectedIds : [node.id] });
      }}
      onEdgeDoubleClick={(_event, edge) => {
        onEdit({ type: "deleteEdges", edgeIds: [edge.id] });
      }}
      onNodeDrag={(_event, node) => {
        updateNodeInternals(node.id);
      }}
      onNodeDragStop={(_event, _node, dragged) => {
        dragged.forEach((node) => updateNodeInternals(node.id));
        const moved = new Map(
          dragged.map((node) => {
            const object = project.objects.find((item) => item.id === node.id);
            if (object && isLayoutObject(object) && !isCalculationObject(object)) {
              const bounds =
                object.kind === "equipment"
                  ? equipmentBounds(object)
                  : { width: POINT_NODE_SIZE, height: POINT_NODE_SIZE };
              const center = snap ? snapPositionToGrid(node.position) : node.position;
              return [node.id, toTopLeftPosition(center, bounds.width, bounds.height)] as const;
            }
            return [node.id, snap ? snapPositionToGrid(node.position) : node.position] as const;
          }),
        );
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
      snapToGrid={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={CANVAS_GRID} size={1.4} color="#243044" />
      <Controls className="ws-zoom-controls" />
      <CanvasZoomHotkeys />
      <Panel position="top-left" className="canvas-panel canvas-panel--pid">
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