import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ArrangementObject, ElementView, ProjectDocument } from "../types/contract";
import { inputHandleId, outputHandleId } from "../lib/display";
import { OBJECT_ID_RE, VARIABLE_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { ArrangementSymbol } from "./arrangementSymbols";

export type ArrangementObjectNodeType = Node<
  {
    object: ArrangementObject;
    project: ProjectDocument;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "arrangementObject"
>;

type ConnectMode = "pipe" | "signal" | null;

function stopKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

function viewOf(object: ArrangementObject, id: string, fallback?: Partial<ElementView>): ElementView {
  return (
    object.view.elements[id] ?? {
      x: fallback?.x ?? 24,
      y: fallback?.y ?? 24,
      width: fallback?.width ?? 96,
      height: fallback?.height ?? 64,
      rotation: 0,
      zIndex: 0,
      visible: true,
    }
  );
}

function centerOf(view: ElementView): { x: number; y: number } {
  return { x: view.x + view.width / 2, y: view.y + view.height / 2 };
}

export function ArrangementObjectNode({ id, data }: NodeProps<ArrangementObjectNodeType>) {
  const { object, onEdit } = data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<ConnectMode>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const pointSignature = object.domain.points.map((item) => item.id).join("|");

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, pointSignature, object.view.elements, updateNodeInternals]);

  const selectedPoint = object.domain.points.find((item) => item.id === selectedId);

  const placed = useMemo(() => {
    return [
      ...object.domain.equipment.map((item) => ({ ...item, kind: "equipment" as const })),
      ...object.domain.valves.map((item) => ({ ...item, kind: "valve" as const })),
    ];
  }, [object.domain.equipment, object.domain.valves]);

  const elementCenter = (elementId: string) => {
    const view = viewOf(object, elementId, { width: 20, height: 20 });
    const preview = dragPreview[elementId];
    return centerOf(preview ? { ...view, ...preview } : view);
  };

  const onCanvasPointerDown = (event: ReactPointerEvent, elementId: string) => {
    event.stopPropagation();
    event.preventDefault();
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(elementId);
        setSelectedId(elementId);
        return;
      }
      if (connectFrom !== elementId) {
        onEdit({
          type: connectMode === "pipe" ? "addPipe" : "addSignal",
          objectId: id,
          sourceId: connectFrom,
          targetId: elementId,
        });
      }
      setConnectFrom(null);
      setConnectMode(null);
      setSelectedId(elementId);
      return;
    }
    setSelectedId(elementId);
    const view = viewOf(object, elementId);
    dragRef.current = {
      id: elementId,
      startX: event.clientX,
      startY: event.clientY,
      origX: view.x,
      origY: view.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    setDragPreview({ [drag.id]: { x: drag.origX + dx, y: drag.origY + dy } });
  };

  const onCanvasPointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const preview = dragPreview[drag.id];
    dragRef.current = null;
    setDragPreview({});
    if (!preview) return;
    onEdit({ type: "moveElement", objectId: id, elementId: drag.id, x: preview.x, y: preview.y });
  };

  return (
    <article
      className="arr-node"
      data-testid={`object-${id}`}
      style={{ width: object.view.width }}
    >
      <header className="arr-node__header">
        <span className="arr-node__kicker">Arrangement Object</span>
        <input
          className="calc-node__id nodrag"
          defaultValue={object.id}
          data-testid={`object-${id}-id`}
          onKeyDown={stopKeys}
          onBlur={(event) => {
            const nextId = event.target.value.trim();
            if (!OBJECT_ID_RE.test(nextId) || nextId === object.id) {
              event.target.value = object.id;
              return;
            }
            onEdit({ type: "updateObject", objectId: id, patch: { id: nextId } });
          }}
        />
        <input
          className="calc-row__name-input nodrag"
          defaultValue={object.name}
          data-testid={`object-${id}-name`}
          onKeyDown={stopKeys}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (!name || name === object.name) {
              event.target.value = object.name;
              return;
            }
            onEdit({ type: "updateObject", objectId: id, patch: { name } });
          }}
        />
        <button
          type="button"
          className="icon-btn nodrag"
          title="객체 삭제"
          data-testid={`object-${id}-delete`}
          onClick={() => onEdit({ type: "deleteObject", objectId: id })}
        >
          ×
        </button>
      </header>

      <div className="arr-toolbar nodrag nopan">
        <button type="button" className="ghost-btn nodrag" data-testid={`object-${id}-add-equipment`} onClick={() => onEdit({ type: "addEquipment", objectId: id })}>
          + Equipment
        </button>
        <button type="button" className="ghost-btn nodrag" data-testid={`object-${id}-add-valve`} onClick={() => onEdit({ type: "addValve", objectId: id })}>
          + Valve
        </button>
        <button
          type="button"
          className="ghost-btn nodrag"
          data-testid={`object-${id}-add-point`}
          onClick={() =>
            onEdit({
              type: "addPoint",
              objectId: id,
              attachedToId: selectedId && object.domain.equipment.some((item) => item.id === selectedId) ? selectedId : null,
            })
          }
        >
          + Point
        </button>
        <button
          type="button"
          className={`ghost-btn nodrag ${connectMode === "pipe" ? "ghost-btn--on" : ""}`}
          data-testid={`object-${id}-add-pipe`}
          onClick={() => {
            setConnectMode((value) => (value === "pipe" ? null : "pipe"));
            setConnectFrom(null);
          }}
        >
          Pipe
        </button>
        <button
          type="button"
          className={`ghost-btn nodrag ${connectMode === "signal" ? "ghost-btn--on" : ""}`}
          data-testid={`object-${id}-add-signal`}
          onClick={() => {
            setConnectMode((value) => (value === "signal" ? null : "signal"));
            setConnectFrom(null);
          }}
        >
          Signal
        </button>
        <button type="button" className="ghost-btn nodrag" data-testid={`object-${id}-add-annotation`} onClick={() => onEdit({ type: "addAnnotation", objectId: id })}>
          + Note
        </button>
      </div>
      {connectMode ? (
        <p className="arr-hint nodrag">
          {connectMode === "pipe" ? "Pipe" : "Signal"}: {connectFrom ? "대상 요소를 클릭하세요" : "시작 요소를 클릭하세요"}
        </p>
      ) : null}

      <div
        className="arr-canvas nodrag nopan nowheel"
        data-testid={`object-${id}-canvas`}
        style={{ width: object.view.width, height: object.view.height }}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedId(null);
          }
        }}
      >
        <svg className="arr-wires" width={object.view.width} height={object.view.height}>
          {object.domain.pipes.map((pipe) => {
            const a = elementCenter(pipe.sourceId);
            const b = elementCenter(pipe.targetId);
            return (
              <line
                key={pipe.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="arr-pipe"
                data-testid={`object-${id}-pipe-${pipe.id}`}
              />
            );
          })}
          {object.domain.signals.map((signal) => {
            const a = elementCenter(signal.sourceId);
            const b = elementCenter(signal.targetId);
            return (
              <line
                key={signal.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="arr-signal"
                data-testid={`object-${id}-signal-${signal.id}`}
              />
            );
          })}
        </svg>

        {placed.map((item) => {
          const view = viewOf(object, item.id, { width: 96, height: item.kind === "valve" ? 48 : 64 });
          const preview = dragPreview[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={`arr-item nodrag ${selectedId === item.id ? "arr-item--selected" : ""}`}
              data-testid={`object-${id}-${item.kind}-${item.id}`}
              style={{
                left: preview?.x ?? view.x,
                top: preview?.y ?? view.y,
                width: view.width,
                height: view.height,
                zIndex: view.zIndex,
                transform: `rotate(${view.rotation}deg)`,
              }}
              onPointerDown={(event) => onCanvasPointerDown(event, item.id)}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
            >
              <ArrangementSymbol
                symbolId={item.symbolId}
                title={item.name}
                selected={selectedId === item.id}
              />
              <span className="arr-item__label">{item.name}</span>
            </button>
          );
        })}

        {object.domain.points.map((point) => {
          const view = viewOf(object, point.id, { width: 20, height: 20 });
          const preview = dragPreview[point.id];
          const x = preview?.x ?? view.x;
          const y = preview?.y ?? view.y;
          return (
            <div
              key={point.id}
              className={`arr-point nodrag ${selectedId === point.id ? "arr-point--selected" : ""}`}
              data-testid={`object-${id}-point-${point.id}`}
              style={{ left: x, top: y, width: view.width, height: view.height, zIndex: view.zIndex + 2 }}
              onPointerDown={(event) => onCanvasPointerDown(event, point.id)}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={inputHandleId(point.id)}
                className="arr-point-handle arr-point-handle--in"
                data-testid={`handle-in-${point.id}`}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={outputHandleId(point.id)}
                className="arr-point-handle arr-point-handle--out"
                data-testid={`handle-out-${point.id}`}
              />
              <svg viewBox="0 0 20 20" className="arr-point__glyph" aria-label={point.name}>
                <circle cx="10" cy="10" r="6.5" />
                <path d="M10 3v14M3 10h14" />
              </svg>
            </div>
          );
        })}

        {object.domain.annotations.map((note) => {
          const view = viewOf(object, note.id, { width: 160, height: 36 });
          const preview = dragPreview[note.id];
          return (
            <div
              key={note.id}
              className="arr-note nodrag"
              data-testid={`object-${id}-annotation-${note.id}`}
              style={{
                left: preview?.x ?? view.x,
                top: preview?.y ?? view.y,
                width: view.width,
                minHeight: view.height,
              }}
              onPointerDown={(event) => onCanvasPointerDown(event, note.id)}
            >
              <textarea
                className="arr-note__text nodrag nowheel"
                defaultValue={note.text}
                data-testid={`object-${id}-annotation-${note.id}-text`}
                onKeyDown={stopKeys}
                onPointerDown={(event) => event.stopPropagation()}
                onBlur={(event) =>
                  onEdit({ type: "updateAnnotation", objectId: id, annotationId: note.id, text: event.target.value })
                }
              />
            </div>
          );
        })}
      </div>

      {selectedPoint ? (
        <div className="arr-inspector nodrag nopan">
          <span>Point</span>
          <input
            className="calc-node__id nodrag"
            key={`${selectedPoint.id}-id`}
            defaultValue={selectedPoint.id}
            data-testid={`object-${id}-point-${selectedPoint.id}-id`}
            onKeyDown={stopKeys}
            onBlur={(event) => {
              const nextId = event.target.value.trim();
              if (!VARIABLE_ID_RE.test(nextId) || nextId === selectedPoint.id) {
                event.target.value = selectedPoint.id;
                return;
              }
              onEdit({ type: "updatePoint", objectId: id, pointId: selectedPoint.id, patch: { id: nextId } });
              setSelectedId(nextId);
            }}
          />
          <input
            className="calc-row__name-input nodrag"
            key={`${selectedPoint.id}-name`}
            defaultValue={selectedPoint.name}
            data-testid={`object-${id}-point-${selectedPoint.id}-name`}
            onKeyDown={stopKeys}
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (!name || name === selectedPoint.name) {
                event.target.value = selectedPoint.name;
                return;
              }
              onEdit({ type: "updatePoint", objectId: id, pointId: selectedPoint.id, patch: { name } });
            }}
          />
        </div>
      ) : (
        <p className="arr-inspector arr-inspector--hint nodrag">Equipment를 선택한 뒤 Point를 추가하거나, 빈 공간 Point를 배치하세요. 계산은 수행하지 않습니다.</p>
      )}
    </article>
  );
}
