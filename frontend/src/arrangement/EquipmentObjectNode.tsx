import { Handle, NodeResizer, useConnection, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useLayoutEffect, useState } from "react";
import type { EquipmentObject } from "../types/contract";
import type { WorkspaceEdit } from "../shared/projectEdits";
import { objectLinkSideOf } from "../shared/worksheet";
import { memoLinkSideOf } from "../memo/memo";
import { equipmentBounds, equipmentPortLayout, equipmentTag } from "./arrangementView";
import { resolveDrawing } from "./symbols/drawing";
import { DrawingSvg } from "./symbols/DrawingSvg";
import { snapGridSize } from "../shared/grid";
import { ObjectLinkHandle } from "../shared/ObjectLinkHandle";
import { MemoAttachHandle } from "../memo/MemoAttachHandle";
import { EquipmentPopover } from "./ArrangementPopover";

export type EquipmentObjectNodeType = Node<
  {
    object: EquipmentObject;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "equipmentObject"
>;

export function EquipmentObjectNode({ id, selected, data }: NodeProps<EquipmentObjectNodeType>) {
  const { object, onEdit } = data;
  const bounds = equipmentBounds(object);
  const drawing = resolveDrawing(object.symbolId, object.drawing);
  const ports = equipmentPortLayout(object);
  const [hovered, setHovered] = useState(false);
  const [inspect, setInspect] = useState(false);
  const connecting = Boolean(useConnection().inProgress);
  const showPorts = Boolean(selected || hovered || connecting);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleSignature = `${object.inCount}:${object.outCount}:${objectLinkSideOf(object)}:${memoLinkSideOf(object)}:${bounds.rotation}:${bounds.width}x${bounds.height}:${object.drawing?.primitives.length ?? 0}:${object.drawing?.ports?.map((item) => `${item.id}:${item.x}:${item.y}`).join(",") ?? ""}`;

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [handleSignature, id, updateNodeInternals]);

  return (
    <article
      className={`pid-eq ${selected ? "is-selected" : ""} ${showPorts ? "is-hot" : ""}`}
      data-testid={`object-${id}`}
      style={{ width: bounds.width, height: bounds.height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setInspect(true);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={44}
        minHeight={44}
        onResize={() => updateNodeInternals(id)}
        onResizeEnd={(_event, params) =>
          onEdit({
            type: "updateEquipment",
            objectId: id,
            patch: { width: snapGridSize(params.width), height: snapGridSize(params.height) },
          })
        }
      />
      <ObjectLinkHandle
        nodeId={id}
        side={objectLinkSideOf(object)}
        onToggleSide={() =>
          onEdit({
            type: "setObjectLinkSide",
            objectId: id,
            side: objectLinkSideOf(object) === "top" ? "bottom" : "top",
          })
        }
      />
      <MemoAttachHandle
        nodeId={id}
        side={memoLinkSideOf(object)}
        onToggleSide={() =>
          onEdit({
            type: "setMemoLinkSide",
            objectId: id,
            side: memoLinkSideOf(object) === "top" ? "bottom" : "top",
          })
        }
      />
      <div
        className="pid-eq__symbol"
        style={{ width: bounds.size.width, height: bounds.size.height, transform: `rotate(${bounds.rotation}deg)` }}
      >
        <DrawingSvg drawing={drawing} title={equipmentTag(object)} />
      </div>
      <span className="pid-eq__tag">{equipmentTag(object)}</span>
      {ports.map((port) => (
        <Handle
          key={port.id}
          type="source"
          position={port.position}
          id={port.id}
          className={`pid-port pid-port--free pid-port--${port.side} pid-port--${port.id.startsWith("IN_") ? "in" : "out"} ${showPorts ? "is-visible" : ""}`}
          style={port.style}
          data-testid={`object-${id}-${port.id}`}
          data-port-category="arrangement-point"
          title={`${id}.${port.id}`}
        >
          <span className="pid-port__label">{port.id}</span>
        </Handle>
      ))}
      {inspect ? <EquipmentPopover object={object} onEdit={onEdit} onClose={() => setInspect(false)} /> : null}
    </article>
  );
}
