import { Handle, Position, useConnection, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useLayoutEffect, useState } from "react";
import type { PointObject } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { POINT_CONNECTION_IDS, objectLinkSideOf, pointConnectionSide } from "../lib/worksheet";
import { ObjectLinkHandle } from "./ObjectLinkHandle";
import { PointPopover } from "./ArrangementPopover";

export type PointObjectNodeType = Node<
  {
    object: PointObject;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "pointObject"
>;

const SIDE_POSITION: Record<"left" | "right" | "bottom" | "top", Position> = {
  left: Position.Left,
  right: Position.Right,
  bottom: Position.Bottom,
  top: Position.Top,
};

export function PointObjectNode({ id, selected, data }: NodeProps<PointObjectNodeType>) {
  const { object, onEdit } = data;
  const side = objectLinkSideOf(object);
  const linked = object.connections.some(Boolean);
  const [hovered, setHovered] = useState(false);
  const [inspect, setInspect] = useState(false);
  const connecting = Boolean(useConnection().inProgress);
  const hot = Boolean(selected || hovered || connecting);
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, side, updateNodeInternals]);

  return (
    <article
      className={`pid-pt ${selected ? "is-selected" : ""} ${linked ? "is-linked" : ""} ${hot ? "is-hot" : ""}`}
      data-testid={`object-${id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setInspect(true);
      }}
    >
      <ObjectLinkHandle
        nodeId={id}
        side={side}
        hidden={!hot}
        onToggleSide={() =>
          onEdit({
            type: "setObjectLinkSide",
            objectId: id,
            side: side === "top" ? "bottom" : "top",
          })
        }
      />
      {POINT_CONNECTION_IDS.map((endId, index) => (
        <Handle
          key={endId}
          type="source"
          position={SIDE_POSITION[pointConnectionSide(endId)]}
          id={endId}
          className={`pid-port pid-port--pt pid-port--${pointConnectionSide(endId)} ${
            object.connections[index] ? "is-on" : ""
          } ${hot ? "is-visible" : ""}`}
          data-testid={`object-${id}-${endId}`}
          title={`${id}.${endId}`}
        />
      ))}
      <span className={`pid-pt__dot ${linked ? "is-on" : ""}`} />
      {hot ? <span className="pid-pt__id">{object.id}</span> : null}
      {inspect ? <PointPopover object={object} onEdit={onEdit} onClose={() => setInspect(false)} /> : null}
    </article>
  );
}
