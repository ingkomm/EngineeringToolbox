import { newStableId } from "../lib/ids";
import { csvToTablePatch, displayObjectReference, tableToCsv } from "../lib/memoTable";
import type { StatusBlock, TableBlock, TableCell, ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import { isCalculationObject } from "../lib/worksheet";

export function StatusBlockEditor({
  memoId,
  block,
  onEdit,
}: {
  memoId: string;
  block: StatusBlock;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const patch = (items: StatusBlock["items"]) =>
    onEdit({ type: "updateMemoBlock", objectId: memoId, blockId: block.id, patch: { items } });
  return (
    <div className="memo-status">
      {block.items.map((item) => (
        <div key={item.id} className="memo-status__row">
          <input
            value={item.label ?? ""}
            placeholder="label"
            onChange={(event) =>
              patch(block.items.map((row) => (row.id === item.id ? { ...row, label: event.target.value } : row)))
            }
          />
          <input
            value={item.value}
            placeholder="value"
            onChange={(event) =>
              patch(block.items.map((row) => (row.id === item.id ? { ...row, value: event.target.value } : row)))
            }
          />
          <input
            type="color"
            value={item.color ?? "#94a3b8"}
            onChange={(event) =>
              patch(block.items.map((row) => (row.id === item.id ? { ...row, color: event.target.value } : row)))
            }
          />
          <button type="button" onClick={() => patch(block.items.filter((row) => row.id !== item.id))}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => patch([...block.items, { id: newStableId("s"), label: "", value: "", color: "#94a3b8" }])}
      >
        + 표시
      </button>
    </div>
  );
}

export function TableBlockEditor({
  memoId,
  block,
  project,
  onEdit,
}: {
  memoId: string;
  block: TableBlock;
  project: ProjectDocument;
  onEdit: (edit: WorkspaceEdit) => void;
}) {
  const patch = (next: Partial<TableBlock>) =>
    onEdit({ type: "updateMemoBlock", objectId: memoId, blockId: block.id, patch: next });

  const setCell = (rowId: string, columnId: string, cell: TableCell) =>
    patch({
      rows: block.rows.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: cell } } : row,
      ),
    });

  return (
    <div className="memo-table">
      <div className="memo-table__tools">
        <button
          type="button"
          onClick={() => {
            const id = newStableId("c");
            patch({
              columns: [...block.columns, { id, name: `C${block.columns.length + 1}` }],
              rows: block.rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: { type: "text", value: "" } } })),
            });
          }}
        >
          + 열
        </button>
        <button
          type="button"
          onClick={() =>
            patch({
              rows: [
                ...block.rows,
                {
                  id: newStableId("r"),
                  cells: Object.fromEntries(block.columns.map((column) => [column.id, { type: "text" as const, value: "" }])),
                },
              ],
            })
          }
        >
          + 행
        </button>
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([tableToCsv(block)], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "memo-table.csv";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          CSV 내보내기
        </button>
      </div>
      <textarea
        className="memo-table__paste"
        placeholder="CSV 붙여넣기"
        data-testid={`memo-${memoId}-table-paste-${block.id}`}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (!text.includes(",") && !text.includes("\t")) return;
          event.preventDefault();
          patch(csvToTablePatch(block, text));
        }}
      />
      <table>
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th key={column.id}>
                <input
                  value={column.name}
                  onChange={(event) =>
                    patch({
                      columns: block.columns.map((item) =>
                        item.id === column.id ? { ...item, name: event.target.value } : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      columns: block.columns.filter((item) => item.id !== column.id),
                      rows: block.rows.map((row) => {
                        const { [column.id]: _removed, ...cells } = row.cells;
                        return { ...row, cells };
                      }),
                    })
                  }
                >
                  ×
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.id}>
              {block.columns.map((column) => {
                const cell = row.cells[column.id] ?? { type: "text" as const, value: "" };
                return (
                  <td key={column.id}>
                    {cell.type === "object-reference" ? (
                      <span className="memo-table__ref">{displayObjectReference(project, cell.reference)}</span>
                    ) : cell.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={cell.value}
                        onChange={(event) => setCell(row.id, column.id, { type: "boolean", value: event.target.checked })}
                      />
                    ) : cell.type === "number" ? (
                      <input
                        type="number"
                        value={cell.value ?? ""}
                        onChange={(event) =>
                          setCell(row.id, column.id, {
                            type: "number",
                            value: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                    ) : (
                      <input
                        value={cell.value}
                        onChange={(event) => setCell(row.id, column.id, { type: "text", value: event.target.value })}
                      />
                    )}
                    <select
                      value={cell.type}
                      onChange={(event) => {
                        const type = event.target.value as TableCell["type"];
                        if (type === "object-reference") {
                          const calc = project.objects.find(isCalculationObject);
                          const sub = calc?.outputs[0] ?? calc?.inputs[0];
                          setCell(row.id, column.id, {
                            type: "object-reference",
                            reference: {
                              objectId: calc?.id ?? "",
                              subId: sub?.id,
                              targetKind: outputKind(calc, sub?.id),
                              displayMode: "name-and-value",
                            },
                          });
                          return;
                        }
                        if (type === "boolean") setCell(row.id, column.id, { type: "boolean", value: false });
                        else if (type === "number") setCell(row.id, column.id, { type: "number", value: null });
                        else setCell(row.id, column.id, { type: "text", value: "" });
                      }}
                    >
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="object-reference">calc ref</option>
                    </select>
                    {cell.type === "object-reference" ? (
                      <select
                        value={`${cell.reference.objectId}::${cell.reference.subId ?? ""}`}
                        onChange={(event) => {
                          const [objectId, subId] = event.target.value.split("::");
                          const object = project.objects.find((item) => item.id === objectId);
                          setCell(row.id, column.id, {
                            type: "object-reference",
                            reference: {
                              objectId: objectId ?? "",
                              subId: subId || undefined,
                              targetKind: outputKind(object, subId),
                              displayMode: "name-and-value",
                            },
                          });
                        }}
                      >
                        {project.objects.filter(isCalculationObject).flatMap((object) =>
                          [...object.outputs, ...object.inputs].map((item) => (
                            <option key={`${object.id}:${item.id}`} value={`${object.id}::${item.id}`}>
                              {object.name}.{item.id}
                            </option>
                          )),
                        )}
                      </select>
                    ) : null}
                  </td>
                );
              })}
              <td>
                <button type="button" onClick={() => patch({ rows: block.rows.filter((item) => item.id !== row.id) })}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function outputKind(object: ProjectDocument["objects"][number] | undefined, subId?: string): "calc-input" | "calc-output" | "object" {
  if (!object || !isCalculationObject(object) || !subId) return "object";
  if (object.outputs.some((item) => item.id === subId)) return "calc-output";
  if (object.inputs.some((item) => item.id === subId)) return "calc-input";
  return "object";
}
