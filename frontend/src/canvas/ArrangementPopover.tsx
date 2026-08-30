import type { KeyboardEvent } from "react";
import type { ArrangementLinkKind, EquipmentObject, PointObject } from "../types/contract";
import { OBJECT_ID_RE, VARIABLE_ID_RE, type WorkspaceEdit } from "../lib/projectEdits";
import { SYMBOL_GROUPS, SYMBOL_REGISTRY } from "./symbols/registry";
import { POINT_CONNECTION_IDS } from "../lib/worksheet";
import { equipmentTag, linkKindOf, showArrowOf } from "../lib/arrangementView";

function stopKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

export function EquipmentPopover({
  object,
  onEdit,
  onClose,
  onEditSymbol,
}: {
  object: EquipmentObject;
  onEdit: (edit: WorkspaceEdit) => void;
  onClose: () => void;
  onEditSymbol?: () => void;
}) {
  return (
    <div className="pid-pop nodrag nopan" data-testid={`object-${object.id}-popover`} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <strong>Equipment</strong>
        <button type="button" className="icon-btn" onClick={onClose}>
          ×
        </button>
      </header>
      <label>
        ID
        <input
          className="pid-pop__input"
          defaultValue={object.id}
          data-testid={`object-${object.id}-id`}
          onKeyDown={stopKeys}
          onBlur={(event) => {
            const nextId = event.target.value.trim();
            if (!OBJECT_ID_RE.test(nextId) || nextId === object.id) {
              event.target.value = object.id;
              return;
            }
            onEdit({ type: "updateEquipment", objectId: object.id, patch: { id: nextId } });
          }}
        />
      </label>
      <label>
        Tag
        <input
          className="pid-pop__input"
          defaultValue={object.tag ?? ""}
          placeholder={equipmentTag(object)}
          data-testid={`object-${object.id}-tag`}
          onKeyDown={stopKeys}
          onBlur={(event) => onEdit({ type: "updateEquipment", objectId: object.id, patch: { tag: event.target.value } })}
        />
      </label>
      <label>
        Name
        <input
          className="pid-pop__input"
          defaultValue={object.name}
          data-testid={`object-${object.id}-name`}
          onKeyDown={stopKeys}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (!name) {
              event.target.value = object.name;
              return;
            }
            onEdit({ type: "updateEquipment", objectId: object.id, patch: { name } });
          }}
        />
      </label>
      <label>
        Symbol
        <select
          className="pid-pop__input"
          value={object.symbolId}
          data-testid={`object-${object.id}-symbol`}
          onChange={(event) => onEdit({ type: "updateEquipment", objectId: object.id, patch: { symbolId: event.target.value } })}
        >
          {SYMBOL_GROUPS.map((group) => (
            <optgroup key={group.id} label={`${group.clause} ${group.labelKo}`}>
              {SYMBOL_REGISTRY.filter((item) => item.group === group.id).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="pid-pop__row">
        <label>
          In
          <input
            className="pid-pop__input"
            type="number"
            min={0}
            max={8}
            value={object.inCount}
            data-testid={`object-${object.id}-in-count`}
            onKeyDown={stopKeys}
            onChange={(event) =>
              onEdit({ type: "setEquipmentPorts", objectId: object.id, inCount: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Out
          <input
            className="pid-pop__input"
            type="number"
            min={0}
            max={8}
            value={object.outCount}
            data-testid={`object-${object.id}-out-count`}
            onKeyDown={stopKeys}
            onChange={(event) =>
              onEdit({ type: "setEquipmentPorts", objectId: object.id, outCount: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <button type="button" className="ghost-btn" data-testid={`object-${object.id}-edit-symbol`} onClick={onEditSymbol}>
        심볼 편집
      </button>
    </div>
  );
}

export function PointPopover({
  object,
  onEdit,
  onClose,
}: {
  object: PointObject;
  onEdit: (edit: WorkspaceEdit) => void;
  onClose: () => void;
}) {
  return (
    <div className="pid-pop nodrag nopan" data-testid={`object-${object.id}-popover`} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <strong>Point</strong>
        <button type="button" className="icon-btn" onClick={onClose}>
          ×
        </button>
      </header>
      <label>
        ID
        <input
          className="pid-pop__input"
          defaultValue={object.id}
          data-testid={`object-${object.id}-id`}
          onKeyDown={stopKeys}
          onBlur={(event) => {
            const nextId = event.target.value.trim();
            if (!VARIABLE_ID_RE.test(nextId) || nextId === object.id) {
              event.target.value = object.id;
              return;
            }
            onEdit({ type: "updatePoint", objectId: object.id, patch: { id: nextId } });
          }}
        />
      </label>
      <label>
        Name
        <input
          className="pid-pop__input"
          defaultValue={object.name}
          data-testid={`object-${object.id}-name`}
          onKeyDown={stopKeys}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (!name) {
              event.target.value = object.name;
              return;
            }
            onEdit({ type: "updatePoint", objectId: object.id, patch: { name } });
          }}
        />
      </label>
      {POINT_CONNECTION_IDS.map((endId, index) => {
        const end = object.connections[index];
        if (!end) return null;
        return (
          <div key={endId} className="pid-pop__link">
            <span>
              {endId} → {end.objectId}.{end.portId}
            </span>
            <label>
              종류
              <select
                className="pid-pop__input"
                value={linkKindOf(end)}
                onChange={(event) =>
                  onEdit({
                    type: "updatePointEnd",
                    pointId: object.id,
                    end: endId,
                    patch: { linkKind: event.target.value as ArrangementLinkKind },
                  })
                }
              >
                <option value="pipe">Pipe</option>
                <option value="signal">Signal</option>
              </select>
            </label>
            <label className="pid-pop__check">
              <input
                type="checkbox"
                checked={end.reversed === true}
                onChange={() => onEdit({ type: "togglePointLink", pointId: object.id, end: endId })}
              />
              방향 반전
            </label>
            <label className="pid-pop__check">
              <input
                type="checkbox"
                checked={showArrowOf(end)}
                onChange={(event) =>
                  onEdit({
                    type: "updatePointEnd",
                    pointId: object.id,
                    end: endId,
                    patch: { showArrow: event.target.checked },
                  })
                }
              />
              화살표
            </label>
          </div>
        );
      })}
    </div>
  );
}
