import { useEffect, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MemoObject } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { MEMO_ATTACHMENT_HANDLE } from "../lib/memo";
import { objectLinkSideOf } from "../lib/worksheet";
import { snapGridSize } from "./symbols/grid";

export type MemoObjectNodeType = Node<
  {
    object: MemoObject;
    onEdit: (edit: WorkspaceEdit) => void;
  },
  "memoObject"
>;

export function MemoObjectNode({ id, selected, data }: NodeProps<MemoObjectNodeType>) {
  const { object, onEdit } = data;
  const [editing, setEditing] = useState(false);
  const [tableSelected, setTableSelected] = useState(false);
  const side = objectLinkSideOf(object);
  const table = object.table;

  useEffect(() => {
    if (!selected) {
      setEditing(false);
      setTableSelected(false);
    }
  }, [selected]);

  return (
    <article
      className={`memo-node ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""}`}
      data-testid={`object-${id}`}
      style={{ width: object.size.width, height: object.size.height }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={110}
        onResizeEnd={(_event, params) =>
          onEdit({
            type: "updateMemo",
            objectId: id,
            patch: { size: { width: snapGridSize(params.width), height: snapGridSize(params.height) } },
          })
        }
      />
      <div className={`memo-attach-cluster memo-attach-cluster--${side}`}>
        <Handle
          type="source"
          position={side === "bottom" ? Position.Bottom : Position.Top}
          id={MEMO_ATTACHMENT_HANDLE}
          className="memo-attach"
          data-port-category="memo-attachment"
          data-testid={`object-${id}-memo`}
          title="Memo"
          isConnectable
        />
        <button
          type="button"
          className="memo-attach-side nodrag nopan"
          data-testid={`object-${id}-memo-side`}
          title={side === "top" ? "연결점을 하단으로" : "연결점을 상단으로"}
          onClick={(event) => {
            event.stopPropagation();
            onEdit({
              type: "setObjectLinkSide",
              objectId: id,
              side: side === "top" ? "bottom" : "top",
            });
          }}
        >
          {side === "top" ? "↓" : "↑"}
        </button>
      </div>
      <p className="memo-node__kicker">MEMO</p>
      {editing ? (
        <input
          className="memo-node__title-input nodrag nopan nowheel"
          value={object.title}
          placeholder="제목"
          data-testid={`memo-${id}-title`}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => onEdit({ type: "updateMemo", objectId: id, patch: { title: event.target.value } })}
          onFocus={() => setTableSelected(false)}
        />
      ) : (
        <h3 className="memo-node__title">{object.title.trim() || "제목 없음"}</h3>
      )}
      {editing ? (
        <textarea
          className="memo-node__body nodrag nopan nowheel"
          value={object.content}
          placeholder="본문"
          data-testid={`memo-${id}-content`}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => onEdit({ type: "updateMemo", objectId: id, patch: { content: event.target.value } })}
          onFocus={() => setTableSelected(false)}
        />
      ) : object.content.trim() ? (
        <p className="memo-node__preview">{object.content}</p>
      ) : (
        <p className="memo-node__preview memo-node__preview--empty">빈 기록</p>
      )}
      {table ? (
        <div
          className={`memo-node__table-wrap ${tableSelected ? "is-selected" : ""}`}
          onClick={(event) => {
            if (!editing) return;
            event.stopPropagation();
            setTableSelected(true);
          }}
        >
          <table className="memo-node__table">
            <tbody>
              {table.cells.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, colIndex) => (
                    <td key={colIndex}>
                      {editing ? (
                        <input
                          className="nodrag nopan nowheel"
                          value={cell}
                          onMouseDown={(event) => event.stopPropagation()}
                          onFocus={() => setTableSelected(true)}
                          onChange={(event) => {
                            const cells = table.cells.map((current, r) =>
                              current.map((value, c) => (r === rowIndex && c === colIndex ? event.target.value : value)),
                            );
                            onEdit({ type: "updateMemoTable", objectId: id, cells });
                          }}
                        />
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {editing && tableSelected ? (
            <div className="memo-table__tools">
              <button type="button" className="nodrag" onClick={() => onEdit({ type: "updateMemoTable", objectId: id, cells: [...table.cells, table.cells[0]?.map(() => "") ?? [""]] })}>
                행 추가
              </button>
              <button type="button" className="nodrag" onClick={() => onEdit({ type: "updateMemoTable", objectId: id, cells: table.cells.map((row) => [...row, ""]) })}>
                열 추가
              </button>
              <button
                type="button"
                className="nodrag"
                disabled={table.cells.length <= 1}
                onClick={() => onEdit({ type: "updateMemoTable", objectId: id, cells: table.cells.slice(0, -1) })}
              >
                행 삭제
              </button>
              <button
                type="button"
                className="nodrag"
                disabled={(table.cells[0]?.length ?? 0) <= 1}
                onClick={() => onEdit({ type: "updateMemoTable", objectId: id, cells: table.cells.map((row) => row.slice(0, -1)) })}
              >
                열 삭제
              </button>
              <button type="button" className="nodrag" onClick={() => onEdit({ type: "removeMemoTable", objectId: id })}>
                표 삭제
              </button>
            </div>
          ) : null}
        </div>
      ) : editing ? (
        <button
          type="button"
          className="memo-node__add-table nodrag"
          data-testid={`memo-${id}-add-table`}
          onClick={(event) => {
            event.stopPropagation();
            onEdit({ type: "addMemoTable", objectId: id });
            setTableSelected(true);
          }}
        >
          + 표 추가
        </button>
      ) : null}
    </article>
  );
}
