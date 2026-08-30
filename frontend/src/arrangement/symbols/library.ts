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
  category?: string;
}

export function normalizeCategory(path: string | undefined): string {
  return (path ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

export function uniqueCategory(existing: string[], path: string): string {
  const base = normalizeCategory(path);
  if (!base) return "";
  const used = new Set(existing.map(normalizeCategory));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function categoryOf(item: Pick<LibrarySymbol, "category">): string {
  return normalizeCategory(item.category);
}

export function moveLibrarySymbol(library: LibrarySymbol[], symbolId: string, direction: -1 | 1): LibrarySymbol[] {
  const current = library.find((item) => item.id === symbolId);
  if (!current) return library;
  const folder = categoryOf(current);
  const siblingIds = library.filter((item) => categoryOf(item) === folder).map((item) => item.id);
  const siblingIndex = siblingIds.indexOf(symbolId);
  const swapId = siblingIds[siblingIndex + direction];
  if (!swapId) return library;
  const from = library.findIndex((item) => item.id === symbolId);
  const to = library.findIndex((item) => item.id === swapId);
  const next = [...library];
  const fromItem = next[from]!;
  next[from] = next[to]!;
  next[to] = fromItem;
  return next;
}

export function libraryFolders(library: LibrarySymbol[], extra: string[] = []): string[] {
  const folders = new Set<string>(extra.map(normalizeCategory).filter(Boolean));
  for (const item of library) {
    const path = categoryOf(item);
    if (!path) continue;
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i += 1) folders.add(parts.slice(0, i).join("/"));
  }
  return [...folders].sort((a, b) => a.localeCompare(b, "en"));
}

export function deleteLibraryFolder(
  library: LibrarySymbol[],
  categories: string[],
  path: string,
): { library: LibrarySymbol[]; symbolCategories: string[] } {
  const folder = normalizeCategory(path);
  if (!folder) return { library, symbolCategories: categories };
  const parent = folder.includes("/") ? folder.split("/").slice(0, -1).join("/") : "";
  return {
    library: library.map((item) => {
      const cat = categoryOf(item);
      if (cat === folder || cat.startsWith(`${folder}/`)) {
        return { ...item, category: parent || undefined };
      }
      return item;
    }),
    symbolCategories: categories.filter((item) => {
      const name = normalizeCategory(item);
      return name !== folder && !name.startsWith(`${folder}/`);
    }),
  };
}

export function isArrangementSymbol(item: Pick<LibrarySymbol, "kind">): boolean {
  return item.kind === "equipment";
}

export function arrangementSymbols(library: LibrarySymbol[]): LibrarySymbol[] {
  return library.filter(isArrangementSymbol);
}

export function symbolsInFolder(library: LibrarySymbol[], folder: string): LibrarySymbol[] {
  const path = normalizeCategory(folder);
  return library.filter((item) => isArrangementSymbol(item) && categoryOf(item) === path);
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
    {
      id: "vessel",
      name: "Vessel",
      kind: "equipment",
      inCount: 1,
      outCount: 1,
      drawing: defaultDrawing("vessel"),
    },
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
