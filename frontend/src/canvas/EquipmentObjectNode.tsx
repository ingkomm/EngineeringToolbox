import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect, type KeyboardEvent } from "react";
import type { EquipmentObject } from "../types/contract";
import { OBJECT_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { equipmentPortIds } from "../lib/worksheet";
import { ArrangementSymbol } from "./arrangementSymbols";
import { ObjectLinkHandle } from "./ObjectLinkHandle";

export type EquipmentObjectNodeType = Node<
  {
    object: EquipmentObject;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "equipmentObject"
>;

function stopKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

export function EquipmentObjectNode({ id, selected, data }: NodeProps<EquipmentObjectNodeType>) {
  const { object, onEdit } = data;
  const ports = equipmentPortIds(object);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleSignature = `${object.inCount}:${object.outCount}`;

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [handleSignature, id, updateNodeInternals]);

  return (
    <article className={`ws-eq ${selected ? "ws-eq--selected" : ""}`} data-testid={`object-${id}`}>
      <ObjectLinkHandle nodeId={id} />
      <header className="ws-eq__header">
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
      <div className="ws-eq__body">
        <ArrangementSymbol symbolId={object.symbolId} title={object.name} selected={selected} />
        {ports.ins.map((portId, index) => (
          <Handle
            key={portId}
            type="source"
            position={Position.Left}
            id={portId}
            className="ws-eq-handle ws-eq-handle--in"
            style={{ top: `${((index + 1) / (ports.ins.length + 1)) * 100}%` }}
            data-testid={`object-${id}-${portId}`}
            title={`${id}.${portId}`}
          >
            {portId}
          </Handle>
        ))}
        {ports.outs.map((portId, index) => (
          <Handle
            key={portId}
            type="source"
            position={Position.Right}
            id={portId}
            className="ws-eq-handle ws-eq-handle--out"
            style={{ top: `${((index + 1) / (ports.outs.length + 1)) * 100}%` }}
            data-testid={`object-${id}-${portId}`}
            title={`${id}.${portId}`}
          >
            {portId}
          </Handle>
        ))}
      </div>
      <div className="ws-eq__ports nodrag nopan">
        <label>
          In
          <input
            className="arr-count nodrag"
            type="number"
            min={0}
            max={8}
            value={object.inCount}
            data-testid={`object-${id}-in-count`}
            onKeyDown={stopKeys}
            onChange={(event) =>
              onEdit({
                type: "setEquipmentPorts",
                objectId: id,
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
            value={object.outCount}
            data-testid={`object-${id}-out-count`}
            onKeyDown={stopKeys}
            onChange={(event) =>
              onEdit({
                type: "setEquipmentPorts",
                objectId: id,
                outCount: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
    </article>
  );
}
