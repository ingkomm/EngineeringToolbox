import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MemoObject } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { contentPreview, MEMO_ATTACHMENT_HANDLE } from "../lib/memo";
import { snapGridSize } from "./symbols/grid";

export type MemoObjectNodeType = Node<
  {
    object: MemoObject;
    onEdit: (edit: WorkspaceEdit) => void;
    onOpen: (objectId: string) => void;
  },
  "memoObject"
>;

export function MemoObjectNode({ id, selected, data }: NodeProps<MemoObjectNodeType>) {
  const { object, onEdit, onOpen } = data;
  const preview = contentPreview(object.content);
  const table = object.tables[0];

  return (
    <article
      className={`memo-node ${selected ? "is-selected" : ""}`}
      data-testid={`object-${id}`}
      style={{ width: object.size.width, height: object.size.height }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onOpen(id);
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
      <Handle
        type="source"
        position={Position.Top}
        id={MEMO_ATTACHMENT_HANDLE}
        className="memo-attach"
        data-port-category="memo-attachment"
        data-testid={`object-${id}-memo`}
        title="Memo"
        isConnectable
      />
      <p className="memo-node__kicker">MEMO</p>
      <h3 className="memo-node__title">{object.title.trim() || "제목 없음"}</h3>
      {preview ? <p className="memo-node__preview">{preview}</p> : <p className="memo-node__preview memo-node__preview--empty">빈 기록</p>}
      {table ? (
        <table className="memo-node__table">
          <tbody>
            {table.cells.slice(0, 3).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.slice(0, 3).map((cell, colIndex) => (
                  <td key={colIndex}>{cell === null || cell === "" ? "" : String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </article>
  );
}
