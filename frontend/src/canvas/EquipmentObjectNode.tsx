import { Handle, NodeResizer, Position, useConnection, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useLayoutEffect, useState } from "react";
import type { EquipmentObject } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { equipmentPortIds, objectLinkSideOf } from "../lib/worksheet";
import { equipmentBounds, equipmentTag, portSide } from "../lib/arrangementView";
import { resolveSymbol } from "./symbols/registry";
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
  const ports = equipmentPortIds(object);
  const bounds = equipmentBounds(object);
  const symbol = resolveSymbol(object.symbolId);
  const [hovered, setHovered] = useState(false);
  const [inspect, setInspect] = useState(false);
  const connecting = Boolean(useConnection().inProgress);
  const showPorts = Boolean(selected || hovered || connecting);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleSignature = `${object.inCount}:${object.outCount}:${objectLinkSideOf(object)}:${bounds.rotation}:${bounds.width}x${bounds.height}`;

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
        minWidth={48}
        minHeight={32}
        onResizeEnd={(_event, params) =>
          onEdit({
            type: "updateEquipment",
            objectId: id,
            patch: { width: Math.round(params.width), height: Math.round(Math.max(24, params.height)) },
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
        {symbol.render(equipmentTag(object))}
      </div>
      <span className="pid-eq__tag">{equipmentTag(object)}</span>
      {ports.ins.map((portId, index) => (
        <Handle
          key={portId}
          type="source"
          position={portSide("in", bounds.rotation)}
          id={portId}
          className={`pid-port pid-port--in ${showPorts ? "is-visible" : ""}`}
          style={{ [axisFor(portSide("in", bounds.rotation))]: `${((index + 1) / (ports.ins.length + 1)) * 100}%` }}
          data-testid={`object-${id}-${portId}`}
          title={`${id}.${portId}`}
        >
          <span className="pid-port__label">{portId}</span>
        </Handle>
      ))}
      {ports.outs.map((portId, index) => (
        <Handle
          key={portId}
          type="source"
          position={portSide("out", bounds.rotation)}
          id={portId}
          className={`pid-port pid-port--out ${showPorts ? "is-visible" : ""}`}
          style={{ [axisFor(portSide("out", bounds.rotation))]: `${((index + 1) / (ports.outs.length + 1)) * 100}%` }}
          data-testid={`object-${id}-${portId}`}
          title={`${id}.${portId}`}
        >
          <span className="pid-port__label">{portId}</span>
        </Handle>
      ))}
      {inspect ? <EquipmentPopover object={object} onEdit={onEdit} onClose={() => setInspect(false)} /> : null}
    </article>
  );
}

function axisFor(position: Position): "top" | "left" {
  return position === Position.Left || position === Position.Right ? "top" : "left";
}
