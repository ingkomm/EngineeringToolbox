import type { MemoLink, MemoObject, SimpleTable, WorksheetObject } from "../types/contract";
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
    tables: [],
    links: [],
    position: position ?? { x: 80, y: 88 },
    size: { ...MEMO_DEFAULT_SIZE },
  };
}

export function cloneMemo(memo: MemoObject, position?: { x: number; y: number }): MemoObject {
  const id = newStableId("m");
  const linkIdMap = new Map(memo.links.map((link) => [link.id, newStableId("l")]));
  return {
    ...memo,
    id,
    position: position ?? { x: memo.position.x + 36, y: memo.position.y + 36 },
    tables: memo.tables.map((table) => ({
      id: newStableId("t"),
      cells: table.cells.map((row) => [...row]),
    })),
    links: memo.links.map((link) => ({
      ...link,
      id: linkIdMap.get(link.id) ?? newStableId("l"),
      memoId: id,
    })),
  };
}

export function emptyTable(): SimpleTable {
  return {
    id: newStableId("t"),
    cells: [
      ["", ""],
      ["", ""],
    ],
  };
}

export function contentPreview(content: string, lines = 4): string {
  return content
    .split(/\n/)
    .slice(0, lines)
    .join("\n")
    .trim();
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
  return {
    kind: "memo",
    id: object.id,
    title: object.title ?? "",
    content: object.content ?? "",
    tables: (object.tables ?? []).map((table) => ({
      id: table.id || newStableId("t"),
      cells: Array.isArray(table.cells) ? table.cells.map((row) => (Array.isArray(row) ? [...row] : [])) : [],
    })),
    links: links.map((link) => ({ ...link, memoId: object.id })),
    position: object.position ?? { x: 80, y: 88 },
    size: {
      width: Math.max(160, object.size?.width ?? MEMO_DEFAULT_SIZE.width),
      height: Math.max(110, object.size?.height ?? MEMO_DEFAULT_SIZE.height),
    },
  };
}
