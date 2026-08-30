import type { SymbolDrawing } from "./drawing";
import { blankDrawing, defaultDrawing } from "./drawing";

export type LibrarySymbolKind = "equipment" | "point";

export interface LibrarySymbol {
  id: string;
  name: string;
  kind: LibrarySymbolKind;
  inCount?: number;
  outCount?: number;
  drawing?: SymbolDrawing | null;
}

export function defaultSymbolLibrary(): LibrarySymbol[] {
  return [
    {
      id: "pump",
      name: "Pump",
      kind: "equipment",
      inCount: 1,
      outCount: 1,
      drawing: defaultDrawing("pump"),
    },
    {
      id: "valve",
      name: "Valve",
      kind: "equipment",
      inCount: 1,
      outCount: 1,
      drawing: defaultDrawing("valve"),
    },
    { id: "point", name: "Point", kind: "point" },
  ];
}

export function libraryOf(project: { symbolLibrary?: LibrarySymbol[] | null }): LibrarySymbol[] {
  return project.symbolLibrary ?? defaultSymbolLibrary();
}

export function findLibrarySymbol(
  project: { symbolLibrary?: LibrarySymbol[] | null },
  symbolId: string | undefined,
): LibrarySymbol | undefined {
  return libraryOf(project).find((item) => item.id === symbolId);
}

export function firstEquipmentSymbol(project: { symbolLibrary?: LibrarySymbol[] | null }): LibrarySymbol {
  return libraryOf(project).find((item) => item.kind === "equipment") ?? defaultSymbolLibrary()[0]!;
}

export function nextLibrarySymbolId(library: LibrarySymbol[]): string {
  let n = 1;
  const used = new Set(library.map((item) => item.id));
  while (used.has(`sym_${n}`)) n += 1;
  return `sym_${n}`;
}

export function newBlankEquipmentSymbol(library: LibrarySymbol[]): LibrarySymbol {
  const id = nextLibrarySymbolId(library);
  return {
    id,
    name: nextLibraryName(library, "Symbol"),
    kind: "equipment",
    inCount: 1,
    outCount: 1,
    drawing: blankDrawing(),
  };
}

export function nextLibraryName(library: LibrarySymbol[], base: string): string {
  const used = new Set(library.map((item) => item.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
