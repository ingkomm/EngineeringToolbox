import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect, type KeyboardEvent } from "react";
import type { PointObject } from "../types/contract";
import { OBJECT_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { POINT_CONNECTION_IDS, objectLinkSideOf, pointConnectionSide } from "../lib/worksheet";
import { ObjectLinkHandle } from "./ObjectLinkHandle";

export type PointObjectNodeType = Node<
  {
    object: PointObject;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "pointObject"
>;

function stopKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

const SIDE_POSITION: Record<"left" | "right" | "bottom", Position> = {
  left: Position.Left,
  right: Position.Right,
  bottom: Position.Bottom,
};

export function PointObjectNode({ id, selected, data }: NodeProps<PointObjectNodeType>) {
  const { object, onEdit } = data;
  const side = objectLinkSideOf(object);
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, side, updateNodeInternals]);

  return (
    <article
      className={`ws-node ws-node--point ws-point ${selected ? "is-selected ws-point--selected" : ""}`}
      data-testid={`object-${id}`}
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
      {POINT_CONNECTION_IDS.map((endId, index) => (
        <Handle
          key={endId}
          type="source"
          position={SIDE_POSITION[pointConnectionSide(endId)]}
          id={endId}
          className={`ws-port ws-point-handle ws-point-handle--${pointConnectionSide(endId)} ${
            object.connections[index] ? "ws-point-handle--on" : ""
          }`}
          data-testid={`object-${id}-${endId}`}
          title={`${id}.${endId}`}
        >
          <span className="ws-port__label">{endId}</span>
        </Handle>
      ))}
      <div className="ws-point__core nodrag nopan">
        <span className="ws-node__name ws-point__name">{object.name}</span>
        <div className="ws-node__tools ws-reveal">
          <input
            className="ws-node__id ws-point__id nodrag"
            defaultValue={object.id}
            data-testid={`object-${id}-id`}
            onKeyDown={stopKeys}
            onBlur={(event) => {
              const nextId = event.target.value.trim();
              if (!OBJECT_ID_RE.test(nextId) || nextId === object.id) {
                event.target.value = object.id;
                return;
              }
              onEdit({ type: "updatePoint", objectId: id, patch: { id: nextId } });
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
        </div>
      </div>
    </article>
  );
}
