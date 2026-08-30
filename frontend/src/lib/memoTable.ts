import type { ObjectValueReference, ProjectDocument, TableBlock, TableCell } from "../types/contract";
import { isCalculationObject } from "./worksheet";
import { formatValue } from "./display";

export function displayObjectReference(project: ProjectDocument, reference: ObjectValueReference): string {
  const object = project.objects.find((item) => item.id === reference.objectId);
  if (!object) return "Missing";
  if (!isCalculationObject(object) || !reference.subId) {
    const name = object.kind === "memo" ? object.title || object.id : object.name;
    return name;
  }
  const input = object.inputs.find((item) => item.id === reference.subId);
  const output = object.outputs.find((item) => item.id === reference.subId);
  const row = input ?? output;
  if (!row) return "Missing";
  const name = row.name || row.id;
  const value = formatValue(row.value);
  if (reference.displayMode === "value") return value;
  if (reference.displayMode === "name") return name;
  return `${name} ${value}`;
}

export function parseCsv(text: string): string[][] {
  const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((row) => row.length > 0);
  const delimiter = text.includes("\t") ? "\t" : ",";
  return rows.map((row) => row.split(delimiter));
}

export function tableToCsv(block: TableBlock): string {
  const header = block.columns.map((column) => column.name).join(",");
  const body = block.rows.map((row) =>
    block.columns
      .map((column) => {
        const cell = row.cells[column.id];
        if (!cell) return "";
        if (cell.type === "text") return escapeCsv(cell.value);
        if (cell.type === "number") return cell.value == null ? "" : String(cell.value);
        if (cell.type === "boolean") return cell.value ? "true" : "false";
        return "";
      })
      .join(","),
  );
  return [header, ...body].join("\n");
}

export function csvToTablePatch(block: TableBlock, text: string): Pick<TableBlock, "columns" | "rows"> {
  const grid = parseCsv(text);
  if (grid.length === 0) return { columns: block.columns, rows: block.rows };
  const width = Math.max(...grid.map((row) => row.length), 1);
  const columns = Array.from({ length: width }, (_, index) => {
    return block.columns[index] ?? { id: `c_csv_${index + 1}`, name: grid[0]?.[index] || `C${index + 1}` };
  });
  const dataRows = grid.slice(block.columns.length ? 1 : 0);
  const rows = dataRows.map((row, rowIndex) => ({
    id: block.rows[rowIndex]?.id ?? `r_csv_${rowIndex + 1}`,
    cells: Object.fromEntries(
      columns.map((column, index) => [column.id, { type: "text" as const, value: row[index] ?? "" } satisfies TableCell]),
    ),
  }));
  return { columns, rows };
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
