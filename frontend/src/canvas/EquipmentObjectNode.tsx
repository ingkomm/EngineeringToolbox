import { Handle, NodeResizer, useConnection, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useLayoutEffect, useState } from "react";
import type { EquipmentObject } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { objectLinkSideOf } from "../lib/worksheet";
import { equipmentBounds, equipmentPortLayout, equipmentTag } from "../lib/arrangementView";
import { resolveDrawing } from "./symbols/drawing";
import { DrawingSvg } from "./symbols/DrawingSvg";
import { evenGridSize } from "./symbols/grid";
import { ObjectLinkHandle } from "./ObjectLinkHandle";
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
  const handleSignature = `${object.inCount}:${object.outCount}:${objectLinkSideOf(object)}:${bounds.rotation}:${bounds.width}x${bounds.height}:${object.drawing?.primitives.length ?? 0}`;

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
        onResizeEnd={(_event, params) =>
          onEdit({
            type: "updateEquipment",
            objectId: id,
            patch: { width: evenGridSize(params.width), height: evenGridSize(params.height) },
          })
        }
      />
      <ObjectLinkHandle
        nodeId={id}
        side={objectLinkSideOf(object)}
        hidden={!showPorts}
        onToggleSide={() =>
          onEdit({
            type: "setObjectLinkSide",
            objectId: id,
            side: objectLinkSideOf(object) === "top" ? "bottom" : "top",
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
          className={`pid-port pid-port--${port.id.startsWith("IN_") ? "in" : "out"} ${showPorts ? "is-visible" : ""}`}
          style={port.style}
          data-testid={`object-${id}-${port.id}`}
          title={`${id}.${port.id}`}
        >
          <span className="pid-port__label">{port.id}</span>
        </Handle>
      ))}
      {inspect ? <EquipmentPopover object={object} onEdit={onEdit} onClose={() => setInspect(false)} /> : null}
    </article>
  );
}
