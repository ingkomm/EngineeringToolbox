import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect, type KeyboardEvent } from "react";
import type { PointObject } from "../types/contract";
import { OBJECT_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { POINT_CONNECTION_IDS, pointConnectionSide } from "../lib/worksheet";
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
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  return (
    <article className={`ws-point ${selected ? "ws-point--selected" : ""}`} data-testid={`object-${id}`}>
      <ObjectLinkHandle nodeId={id} />
      {POINT_CONNECTION_IDS.map((endId, index) => (
        <Handle
          key={endId}
          type="source"
          position={SIDE_POSITION[pointConnectionSide(endId)]}
          id={endId}
          className={`ws-point-handle ws-point-handle--${pointConnectionSide(endId)} ${
            object.connections[index] ? "ws-point-handle--on" : ""
          }`}
          data-testid={`object-${id}-${endId}`}
          title={`${id}.${endId}`}
        />
      ))}
      <div className="ws-point__core nodrag nopan">
        <input
          className="ws-point__id nodrag"
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
    </article>
  );
}
