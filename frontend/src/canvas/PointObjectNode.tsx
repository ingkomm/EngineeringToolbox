import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect, type KeyboardEvent } from "react";
import type { PointObject } from "../types/contract";
import { OBJECT_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { pointConnectionIds } from "../lib/worksheet";

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

function handleStyle(index: number, count: number): { left: string; top: string } {
  const angle = Math.PI + (2 * Math.PI * index) / count;
  return {
    left: `${50 + 46 * Math.cos(angle)}%`,
    top: `${50 + 46 * Math.sin(angle)}%`,
  };
}

export function PointObjectNode({ id, selected, data }: NodeProps<PointObjectNodeType>) {
  const { object, onEdit } = data;
  const ends = pointConnectionIds(object.connectionCount);
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [ends.join("|"), id, updateNodeInternals]);

  return (
    <article className={`ws-point ${selected ? "ws-point--selected" : ""}`} data-testid={`object-${id}`}>
      {ends.map((endId, index) => (
        <Handle
          key={endId}
          type="source"
          position={Position.Left}
          id={endId}
          className={`ws-point-handle ${object.connections[index] ? "ws-point-handle--on" : ""}`}
          style={handleStyle(index, ends.length)}
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
        <label className="ws-point__count">
          <input
            className="arr-count nodrag"
            type="number"
            min={2}
            max={4}
            value={object.connectionCount}
            data-testid={`object-${id}-count`}
            onKeyDown={stopKeys}
            onChange={(event) =>
              onEdit({
                type: "updatePoint",
                objectId: id,
                patch: { connectionCount: Number(event.target.value) },
              })
            }
          />
        </label>
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
