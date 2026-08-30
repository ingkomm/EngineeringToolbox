import type { MemoObject, SimpleTable } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";

export function MemoEditor({
  memo,
  onEdit,
  onClose,
}: {
  memo: MemoObject;
  onEdit: (edit: WorkspaceEdit) => void;
  onClose: () => void;
}) {
  return (
    <div className="memo-focus" data-testid="memo-editor">
      <button type="button" className="memo-focus__scrim" onClick={onClose} aria-label="닫기" />
      <div className="memo-focus__panel">
        <header className="memo-focus__head">
          <input
            className="memo-focus__title"
            value={memo.title}
            placeholder="제목"
            data-testid={`memo-${memo.id}-title`}
            onChange={(event) => onEdit({ type: "updateMemo", objectId: memo.id, patch: { title: event.target.value } })}
          />
          <button type="button" className="ghost-btn" data-testid="btn-close-memo-editor" onClick={onClose}>
            닫기
          </button>
        </header>
        <textarea
          className="memo-block__text"
          value={memo.content}
          placeholder="본문"
          data-testid={`memo-${memo.id}-content`}
          onChange={(event) => onEdit({ type: "updateMemo", objectId: memo.id, patch: { content: event.target.value } })}
        />
        {memo.tables.map((table) => (
          <SimpleTableEditor key={table.id} memoId={memo.id} table={table} onEdit={onEdit} />
        ))}
        <button type="button" data-testid={`memo-${memo.id}-add-table`} onClick={() => onEdit({ type: "addMemoTable", objectId: memo.id })}>
          표 추가
        </button>
      </div>
    </div>
  );
}

function SimpleTableEditor({
  memoId,
  table,
  onEdit,
}: {
  memoId: string;
  table: SimpleTable;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const cells = table.cells.length ? table.cells : [[""]];
  const colCount = Math.max(1, ...cells.map((row) => row.length));
  const setCells = (next: SimpleTable["cells"]) =>
    onEdit({ type: "updateMemoTable", objectId: memoId, tableId: table.id, cells: next });

  const setCell = (rowIndex: number, colIndex: number, value: string) => {
    const next = cells.map((row, r) =>
      row.concat(Array.from({ length: Math.max(0, colCount - row.length) }, () => "")).map((cell, c) =>
        r === rowIndex && c === colIndex ? value : cell,
      ),
    );
    setCells(next);
  };

  return (
    <div className="memo-table" data-testid={`memo-table-${table.id}`}>
      <table>
        <tbody>
          {cells.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: colCount }, (_, colIndex) => (
                <td key={colIndex}>
                  <input
                    value={row[colIndex] == null ? "" : String(row[colIndex])}
                    onChange={(event) => setCell(rowIndex, colIndex, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="memo-table__tools">
        <button type="button" onClick={() => setCells([...cells, Array.from({ length: colCount }, () => "")])}>
          행 추가
        </button>
        <button type="button" onClick={() => setCells(cells.map((row) => [...row, ""]))}>
          열 추가
        </button>
        <button type="button" disabled={cells.length <= 1} onClick={() => setCells(cells.slice(0, -1))}>
          행 삭제
        </button>
        <button
          type="button"
          disabled={colCount <= 1}
          onClick={() => setCells(cells.map((row) => row.slice(0, -1)))}
        >
          열 삭제
        </button>
        <button type="button" onClick={() => onEdit({ type: "removeMemoTable", objectId: memoId, tableId: table.id })}>
          표 삭제
        </button>
      </div>
    </div>
  );
}
