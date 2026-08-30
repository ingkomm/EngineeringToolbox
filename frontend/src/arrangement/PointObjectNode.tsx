import { Handle, Position, useConnection, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useLayoutEffect, useState } from "react";
import type { PointObject } from "../types/contract";
import type { WorkspaceEdit } from "../shared/projectEdits";
import { POINT_CONNECTION_IDS, isObjectLinkHandle, objectLinkSideOf, pointConnectionSide } from "../shared/worksheet";
import { isMemoAttachmentHandle, memoLinkSideOf } from "../memo/memo";
import { POINT_NODE_SIZE } from "../shared/grid";
import { ObjectLinkHandle } from "../shared/ObjectLinkHandle";
import { MemoAttachHandle } from "../memo/MemoAttachHandle";
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
  const memoSide = memoLinkSideOf(object);
  const linked = object.connections.some(Boolean);
  const [hovered, setHovered] = useState(false);
  const [inspect, setInspect] = useState(false);
  const connecting = useConnection();
  const connectingFrom = connecting.fromHandle?.id;
  const pipeConnectable =
    !connecting.inProgress ||
    (!isMemoAttachmentHandle(connectingFrom) && !isObjectLinkHandle(connectingFrom));
  const fromThis = connecting.inProgress && connecting.fromNode?.id === id;
  const hot = Boolean(selected || hovered || fromThis);
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, side, memoSide, updateNodeInternals]);

  return (
    <article
      className={`pid-pt ${selected ? "is-selected" : ""} ${linked ? "is-linked" : ""} ${hot ? "is-hot" : ""}`}
      data-testid={`object-${id}`}
      style={{ width: POINT_NODE_SIZE, height: POINT_NODE_SIZE }}
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
        onToggleSide={() =>
          onEdit({
            type: "setObjectLinkSide",
            objectId: id,
            side: side === "top" ? "bottom" : "top",
          })
        }
      />
      <MemoAttachHandle
        nodeId={id}
        side={memoSide}
        role="target"
        onToggleSide={() =>
          onEdit({
            type: "setMemoLinkSide",
            objectId: id,
            side: memoSide === "top" ? "bottom" : "top",
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
          data-port-category="arrangement-point"
          title={`${id}.${endId}`}
          isConnectable={pipeConnectable}
        />
      ))}
      <span className={`pid-pt__dot ${linked ? "is-on" : ""}`} />
      {hot ? <span className="pid-pt__id">{object.id}</span> : null}
      {inspect ? <PointPopover object={object} onEdit={onEdit} onClose={() => setInspect(false)} /> : null}
    </article>
  );
}
