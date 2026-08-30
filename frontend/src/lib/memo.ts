import type { MemoLink, MemoObject, WorksheetObject } from "../types/contract";
import { newStableId } from "./ids";

export const MEMO_ATTACHMENT_HANDLE = "MEMO";
export const MEMO_DEFAULT_SIZE = { width: 200, height: 140 };

export function isMemoObject(object: WorksheetObject): object is MemoObject {
  return object.kind === "memo";
}

export function isMemoAttachmentHandle(portId: string | null | undefined): boolean {
  return portId === MEMO_ATTACHMENT_HANDLE;
}

export function emptyMemo(position?: { x: number; y: number }): MemoObject {
  return {
    kind: "memo",
    id: newStableId("m"),
    title: "",
    content: "",
    table: null,
    links: [],
    position: position ?? { x: 80, y: 88 },
    size: { ...MEMO_DEFAULT_SIZE },
  };
}

export function cloneMemo(memo: MemoObject, position?: { x: number; y: number }): MemoObject {
  const id = newStableId("m");
  return {
    ...memo,
    id,
    position: position ?? { x: memo.position.x + 36, y: memo.position.y + 36 },
    table: memo.table ? { cells: memo.table.cells.map((row) => row.map((cell) => cell)) } : null,
    links: memo.links.map((link) => ({
      ...link,
      id: newStableId("l"),
      memoId: id,
    })),
  };
}

export function emptyMemoTable(): { cells: string[][] } {
  return {
    cells: [
      ["", ""],
      ["", ""],
    ],
  };
}

export function stringifyCells(cells: unknown): string[][] {
  if (!Array.isArray(cells)) return [];
  return cells.map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : [],
  );
}

export function memoLinkEdgeId(linkId: string): string {
  return `memolink:${linkId}`;
}

export function parseMemoLinkEdgeId(edgeId: string): string | null {
  return edgeId.startsWith("memolink:") ? edgeId.slice("memolink:".length) : null;
}

export function normalizeMemo(object: MemoObject, objectIds: Set<string>): MemoObject {
  const links = (object.links ?? []).filter(
    (link): link is MemoLink =>
      Boolean(link?.id && link.targetObjectId && objectIds.has(link.targetObjectId) && link.targetObjectId !== object.id),
  );
  const legacy = (object as MemoObject & { tables?: Array<{ cells?: unknown }> }).tables;
  const rawTable = object.table ?? (legacy?.[0] ? { cells: legacy[0].cells } : null);
  return {
    kind: "memo",
    id: object.id,
    title: object.title ?? "",
    content: object.content ?? "",
    table: rawTable ? { cells: stringifyCells(rawTable.cells) } : null,
    links: links.map((link) => ({ ...link, memoId: object.id })),
    position: object.position ?? { x: 80, y: 88 },
    size: {
      width: Math.max(160, object.size?.width ?? MEMO_DEFAULT_SIZE.width),
      height: Math.max(110, object.size?.height ?? MEMO_DEFAULT_SIZE.height),
    },
    objectLinkSide: object.objectLinkSide === "bottom" ? "bottom" : "top",
  };
}
