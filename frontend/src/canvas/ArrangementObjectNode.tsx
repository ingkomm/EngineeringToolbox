import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ArrangementEquipment, ArrangementObject, ElementView, PointEnd } from "../types/contract";
import { inputHandleId, outputHandleId } from "../lib/display";
import { OBJECT_ID_RE, VARIABLE_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { equipmentPortIds } from "../lib/worksheet";
import { ArrangementSymbol } from "./arrangementSymbols";

export type ArrangementObjectNodeType = Node<
  {
    object: ArrangementObject;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "arrangementObject"
>;

type LinkDrag =
  | { kind: "from-point"; pointId: string; end: "a" | "b"; x: number; y: number }
  | { kind: "from-port"; equipmentId: string; portId: string; x: number; y: number };

function stopKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

function viewOf(object: ArrangementObject, id: string, fallback?: Partial<ElementView>): ElementView {
  return (
    object.view.elements[id] ?? {
      x: fallback?.x ?? 24,
      y: fallback?.y ?? 24,
      width: fallback?.width ?? 112,
      height: fallback?.height ?? 72,
      rotation: 0,
      zIndex: 0,
      visible: true,
    }
  );
}

function portAnchor(view: ElementView, equipment: ArrangementEquipment, portId: string): { x: number; y: number } {
  const { ins, outs } = equipmentPortIds(equipment);
  const isIn = ins.includes(portId);
  const list = isIn ? ins : outs;
  const index = Math.max(0, list.indexOf(portId));
  const slot = list.length <= 1 ? 0.5 : (index + 1) / (list.length + 1);
  return {
    x: isIn ? view.x : view.x + view.width,
    y: view.y + view.height * slot,
  };
}

function pointEndAnchor(view: ElementView, end: "a" | "b"): { x: number; y: number } {
  return {
    x: end === "a" ? view.x : view.x + view.width,
    y: view.y + view.height / 2,
  };
}

function canvasCoords(canvas: HTMLElement, event: { clientX: number; clientY: number }): { x: number; y: number } {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

export function ArrangementObjectNode({ id, data }: NodeProps<ArrangementObjectNodeType>) {
  const { object, onEdit } = data;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<Record<string, { x: number; y: number }>>({});
  const [linkDrag, setLinkDrag] = useState<LinkDrag | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const pointSignature = object.domain.points.map((item) => item.id).join("|");
  const selectedEquipment = object.domain.equipment.find((item) => item.id === selectedId);

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, pointSignature, object.view.elements, updateNodeInternals]);

  const resolvedView = (elementId: string, fallback?: Partial<ElementView>) => {
    const view = viewOf(object, elementId, fallback);
    const preview = dragPreview[elementId];
    return preview ? { ...view, ...preview } : view;
  };

  const startMove = (event: ReactPointerEvent, elementId: string) => {
    event.stopPropagation();
    event.preventDefault();
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
    if (linkDrag && canvasRef.current) {
      const point = canvasCoords(canvasRef.current, event);
      setLinkDrag({ ...linkDrag, x: point.x, y: point.y });
    }
    const drag = dragRef.current;
    if (!drag) return;
    setDragPreview({ [drag.id]: { x: drag.origX + event.clientX - drag.startX, y: drag.origY + event.clientY - drag.startY } });
  };

  const finishMove = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const preview = dragPreview[drag.id];
    dragRef.current = null;
    setDragPreview({});
    if (!preview) return;
    onEdit({ type: "moveElement", objectId: id, elementId: drag.id, x: preview.x, y: preview.y });
  };

  const finishLink = (event: ReactPointerEvent) => {
    if (!linkDrag) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const portHost = hit?.closest("[data-arr-port]") as HTMLElement | null;
    const pointHost = hit?.closest("[data-arr-point-end]") as HTMLElement | null;
    if (linkDrag.kind === "from-point") {
      if (portHost?.dataset.arrPort) {
        const [equipmentId, portId] = portHost.dataset.arrPort.split(":");
        onEdit({
          type: "connectPointEnd",
          objectId: id,
          pointId: linkDrag.pointId,
          end: linkDrag.end,
          equipmentId: equipmentId ?? null,
          portId: portId ?? null,
        });
      } else {
        onEdit({
          type: "connectPointEnd",
          objectId: id,
          pointId: linkDrag.pointId,
          end: linkDrag.end,
          equipmentId: null,
          portId: null,
        });
      }
    } else if (pointHost?.dataset.arrPointEnd) {
      const [pointId, end] = pointHost.dataset.arrPointEnd.split(":");
      if (pointId && (end === "a" || end === "b")) {
        onEdit({
          type: "connectPointEnd",
          objectId: id,
          pointId,
          end,
          equipmentId: linkDrag.equipmentId,
          portId: linkDrag.portId,
        });
      }
    }
    setLinkDrag(null);
  };

  const startLinkFromPoint = (event: ReactPointerEvent, pointId: string, end: "a" | "b") => {
    event.stopPropagation();
    event.preventDefault();
    if (!canvasRef.current) return;
    const point = canvasCoords(canvasRef.current, event);
    setSelectedId(pointId);
    setLinkDrag({ kind: "from-point", pointId, end, x: point.x, y: point.y });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startLinkFromPort = (event: ReactPointerEvent, equipmentId: string, portId: string) => {
    event.stopPropagation();
    event.preventDefault();
    if (!canvasRef.current) return;
    const point = canvasCoords(canvasRef.current, event);
    setSelectedId(equipmentId);
    setLinkDrag({ kind: "from-port", equipmentId, portId, x: point.x, y: point.y });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const wireFrom = (end: PointEnd | null, pointView: ElementView, which: "a" | "b") => {
    if (!end) return null;
    const host = object.domain.equipment.find((item) => item.id === end.equipmentId);
    if (!host) return null;
    const eqView = resolvedView(host.id);
    return { from: pointEndAnchor(pointView, which), to: portAnchor(eqView, host, end.portId) };
  };

  let rubber: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (linkDrag) {
    if (linkDrag.kind === "from-point") {
      const view = resolvedView(linkDrag.pointId, { width: 88, height: 28 });
      const from = pointEndAnchor(view, linkDrag.end);
      rubber = { x1: from.x, y1: from.y, x2: linkDrag.x, y2: linkDrag.y };
    } else {
      const host = object.domain.equipment.find((item) => item.id === linkDrag.equipmentId);
      if (host) {
        const from = portAnchor(resolvedView(host.id), host, linkDrag.portId);
        rubber = { x1: from.x, y1: from.y, x2: linkDrag.x, y2: linkDrag.y };
      }
    }
  }

  return (
    <article className="arr-node" data-testid={`object-${id}`} style={{ width: object.view.width }}>
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
        <button type="button" className="ghost-btn nodrag" data-testid={`object-${id}-add-point`} onClick={() => onEdit({ type: "addPoint", objectId: id })}>
          + Point
        </button>
      </div>
      <p className="arr-hint nodrag">Point 양끝을 Equipment In/Out에 끌어다 놓으세요. 계산은 하지 않습니다.</p>

      <div
        ref={canvasRef}
        className="arr-canvas nodrag nopan nowheel"
        data-testid={`object-${id}-canvas`}
        style={{ width: object.view.width, height: object.view.height }}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={(event) => {
          if (linkDrag) finishLink(event);
          else finishMove();
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setSelectedId(null);
        }}
      >
        <svg className="arr-wires" width={object.view.width} height={object.view.height}>
          {object.domain.points.flatMap((point) => {
            const view = resolvedView(point.id, { width: 88, height: 28 });
            const lines = [
              wireFrom(point.a, view, "a"),
              wireFrom(point.b, view, "b"),
            ];
            return lines.map((line, index) =>
              line ? (
                <line
                  key={`${point.id}-${index}`}
                  x1={line.from.x}
                  y1={line.from.y}
                  x2={line.to.x}
                  y2={line.to.y}
                  className="arr-point-link"
                  data-testid={`object-${id}-point-${point.id}-link-${index === 0 ? "a" : "b"}`}
                />
              ) : null,
            );
          })}
          {rubber ? (
            <line x1={rubber.x1} y1={rubber.y1} x2={rubber.x2} y2={rubber.y2} className="arr-point-link arr-point-link--preview" />
          ) : null}
        </svg>

        {object.domain.equipment.map((item) => {
          const view = resolvedView(item.id);
          const ports = equipmentPortIds(item);
          return (
            <div
              key={item.id}
              className={`arr-eq nodrag ${selectedId === item.id ? "arr-eq--selected" : ""}`}
              data-testid={`object-${id}-equipment-${item.id}`}
              style={{ left: view.x, top: view.y, width: view.width, height: view.height, zIndex: view.zIndex }}
              onPointerDown={(event) => startMove(event, item.id)}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={finishMove}
            >
              <ArrangementSymbol symbolId={item.symbolId} title={item.name} selected={selectedId === item.id} />
              <span className="arr-item__label">{item.name}</span>
              {ports.ins.map((portId) => {
                const anchor = portAnchor(view, item, portId);
                return (
                  <button
                    key={portId}
                    type="button"
                    className="arr-eq-port arr-eq-port--in nodrag"
                    data-arr-port={`${item.id}:${portId}`}
                    data-testid={`object-${id}-equipment-${item.id}-${portId}`}
                    style={{ top: anchor.y - view.y }}
                    title={`${item.id}.${portId}`}
                    onPointerDown={(event) => startLinkFromPort(event, item.id, portId)}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={finishLink}
                  >
                    {portId}
                  </button>
                );
              })}
              {ports.outs.map((portId) => {
                const anchor = portAnchor(view, item, portId);
                return (
                  <button
                    key={portId}
                    type="button"
                    className="arr-eq-port arr-eq-port--out nodrag"
                    data-arr-port={`${item.id}:${portId}`}
                    data-testid={`object-${id}-equipment-${item.id}-${portId}`}
                    style={{ top: anchor.y - view.y }}
                    title={`${item.id}.${portId}`}
                    onPointerDown={(event) => startLinkFromPort(event, item.id, portId)}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={finishLink}
                  >
                    {portId}
                  </button>
                );
              })}
            </div>
          );
        })}

        {object.domain.points.map((point) => {
          const view = resolvedView(point.id, { width: 88, height: 28 });
          return (
            <div
              key={point.id}
              className={`arr-point arr-point--bar nodrag ${selectedId === point.id ? "arr-point--selected" : ""}`}
              data-testid={`object-${id}-point-${point.id}`}
              style={{ left: view.x, top: view.y, width: view.width, height: view.height, zIndex: view.zIndex + 2 }}
              onPointerDown={(event) => startMove(event, point.id)}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={finishMove}
            >
              <Handle
                type="target"
                position={Position.Top}
                id={inputHandleId(point.id)}
                className="arr-point-handle arr-point-handle--in"
                data-testid={`handle-in-${point.id}`}
              />
              <Handle
                type="source"
                position={Position.Bottom}
                id={outputHandleId(point.id)}
                className="arr-point-handle arr-point-handle--out"
                data-testid={`handle-out-${point.id}`}
              />
              <button
                type="button"
                className={`arr-point-end arr-point-end--a nodrag ${point.a ? "arr-point-end--on" : ""}`}
                data-arr-point-end={`${point.id}:a`}
                data-testid={`object-${id}-point-${point.id}-a`}
                onPointerDown={(event) => startLinkFromPoint(event, point.id, "a")}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={finishLink}
              />
              <span className="arr-point__id">{point.id}</span>
              <button
                type="button"
                className={`arr-point-end arr-point-end--b nodrag ${point.b ? "arr-point-end--on" : ""}`}
                data-arr-point-end={`${point.id}:b`}
                data-testid={`object-${id}-point-${point.id}-b`}
                onPointerDown={(event) => startLinkFromPoint(event, point.id, "b")}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={finishLink}
              />
            </div>
          );
        })}
      </div>

      {selectedEquipment ? (
        <div className="arr-inspector arr-inspector--ports nodrag nopan" data-testid={`object-${id}-equipment-ports`}>
          <span>{selectedEquipment.id} ports</span>
          <label>
            In
            <input
              className="arr-count nodrag"
              type="number"
              min={0}
              max={8}
              value={selectedEquipment.inCount}
              data-testid={`object-${id}-equipment-${selectedEquipment.id}-in-count`}
              onKeyDown={stopKeys}
              onChange={(event) =>
                onEdit({
                  type: "setEquipmentPorts",
                  objectId: id,
                  equipmentId: selectedEquipment.id,
                  inCount: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Out
            <input
              className="arr-count nodrag"
              type="number"
              min={0}
              max={8}
              value={selectedEquipment.outCount}
              data-testid={`object-${id}-equipment-${selectedEquipment.id}-out-count`}
              onKeyDown={stopKeys}
              onChange={(event) =>
                onEdit({
                  type: "setEquipmentPorts",
                  objectId: id,
                  equipmentId: selectedEquipment.id,
                  outCount: Number(event.target.value),
                })
              }
            />
          </label>
        </div>
      ) : null}

      {object.domain.points.length > 0 ? (
        <div className="arr-inspector nodrag nopan" data-testid={`object-${id}-points`}>
          {object.domain.points.map((point) => (
            <div className="arr-inspector__row" key={point.id}>
              <span>Point</span>
              <input
                className="calc-node__id nodrag"
                defaultValue={point.id}
                data-testid={`object-${id}-point-${point.id}-id`}
                onKeyDown={stopKeys}
                onFocus={() => setSelectedId(point.id)}
                onBlur={(event) => {
                  const nextId = event.target.value.trim();
                  if (!VARIABLE_ID_RE.test(nextId) || nextId === point.id) {
                    event.target.value = point.id;
                    return;
                  }
                  onEdit({ type: "updatePoint", objectId: id, pointId: point.id, patch: { id: nextId } });
                  setSelectedId(nextId);
                }}
              />
              <input
                className="calc-row__name-input nodrag"
                defaultValue={point.name}
                data-testid={`object-${id}-point-${point.id}-name`}
                onKeyDown={stopKeys}
                onFocus={() => setSelectedId(point.id)}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (!name || name === point.name) {
                    event.target.value = point.name;
                    return;
                  }
                  onEdit({ type: "updatePoint", objectId: id, pointId: point.id, patch: { name } });
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="arr-inspector arr-inspector--hint nodrag">+ Point를 추가한 뒤 양끝을 Equipment 포트에 연결하세요.</p>
      )}
    </article>
  );
}
