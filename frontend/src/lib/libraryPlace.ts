import type { WorkspaceEdit } from "./projectEdits";

export type LibraryDragPayload =
  | { place: "point" }
  | { place: "calculation" }
  | { place: "equipment"; symbolId: string };

const PREFIX = "engcalc-library:";

/** Click and drop both create instances through the same workspace edits. */
export function libraryPlaceEdit(
  payload: LibraryDragPayload,
  position?: { x: number; y: number },
): WorkspaceEdit {
  if (payload.place === "calculation") return { type: "addObject", position };
  if (payload.place === "point") return { type: "addPoint", position };
  return { type: "addEquipment", symbolId: payload.symbolId, position };
}

export function encodeLibraryDrag(payload: LibraryDragPayload): string {
  return `${PREFIX}${JSON.stringify(payload)}`;
}

export function parseLibraryDrag(raw: string): LibraryDragPayload | null {
  if (!raw.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(PREFIX.length)) as LibraryDragPayload;
    if (parsed.place === "point" || parsed.place === "calculation") return parsed;
    if (parsed.place === "equipment" && typeof parsed.symbolId === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
