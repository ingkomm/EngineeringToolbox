import type { MemoLink, MemoObject, MemoSection, WorksheetObject } from "../types/contract";
import { newStableId } from "./ids";

export const MEMO_ATTACHMENT_HANDLE = "MEMO";
export const MEMO_RECEIVE_HANDLE = `${MEMO_ATTACHMENT_HANDLE}-in`;
export const MEMO_DEFAULT_SIZE = { width: 360, height: 180 };

export function isMemoObject(object: WorksheetObject): object is MemoObject {
  return object.kind === "memo";
}

export function isMemoAttachmentHandle(portId: string | null | undefined): boolean {
  return portId === MEMO_ATTACHMENT_HANDLE || portId === MEMO_RECEIVE_HANDLE;
}

export function memoLinkSideOf(object: { memoLinkSide?: "top" | "bottom" | null }): "top" | "bottom" {
  return object.memoLinkSide === "bottom" ? "bottom" : "top";
}

export function emptyMemo(position?: { x: number; y: number }): MemoObject {
  return {
    kind: "memo",
    id: newStableId("m"),
    title: "",
    sections: [],
    links: [],
    position: position ?? { x: 80, y: 88 },
    size: { ...MEMO_DEFAULT_SIZE },
  };
}

export function newMemoTextSection(content = ""): MemoSection {
  return { id: newStableId("s"), type: "text", content };
}

export function newMemoTableSection(): MemoSection {
  return {
    id: newStableId("s"),
    type: "table",
    cells: [
      ["", ""],
      ["", ""],
    ],
  };
}

export function cloneMemo(memo: MemoObject, position?: { x: number; y: number }): MemoObject {
  const id = newStableId("m");
  return {
    ...memo,
    id,
    position: position ?? { x: memo.position.x + 36, y: memo.position.y + 36 },
    sections: memo.sections.map((section) =>
      section.type === "text"
        ? { ...section, id: newStableId("s") }
        : { ...section, id: newStableId("s"), cells: section.cells.map((row) => [...row]) },
    ),
    links: memo.links.map((link) => ({
      ...link,
      id: newStableId("l"),
      memoId: id,
    })),
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
  return {
    kind: "memo",
    id: object.id,
    title: object.title ?? "",
    sections: migrateSections(object),
    links: links.map((link) => ({ ...link, memoId: object.id })),
    position: object.position ?? { x: 80, y: 88 },
    size: {
      width: Math.max(160, object.size?.width ?? MEMO_DEFAULT_SIZE.width),
      height: Math.max(110, object.size?.height ?? MEMO_DEFAULT_SIZE.height),
    },
    objectLinkSide: object.objectLinkSide === "bottom" ? "bottom" : "top",
  };
}

function migrateSections(object: MemoObject): MemoSection[] {
  if (Array.isArray(object.sections) && object.sections.length) {
    const sections: MemoSection[] = [];
    for (const [index, section] of object.sections.entries()) {
      if (section?.type === "table") {
        sections.push({ id: section.id || `s_t${index}`, type: "table", cells: stringifyCells(section.cells) });
      } else if (section?.type === "text") {
        sections.push({ id: section.id || `s_x${index}`, type: "text", content: section.content ?? "" });
      }
    }
    return sections;
  }
  const legacy = object as MemoObject & {
    content?: string;
    table?: { cells?: unknown } | null;
    tables?: Array<{ cells?: unknown }>;
  };
  const sections: MemoSection[] = [];
  if (legacy.content?.trim()) sections.push(newMemoTextSection(legacy.content));
  if (legacy.table?.cells) sections.push({ id: newStableId("s"), type: "table", cells: stringifyCells(legacy.table.cells) });
  for (const table of legacy.tables ?? []) {
    sections.push({ id: newStableId("s"), type: "table", cells: stringifyCells(table.cells) });
  }
  return sections;
}
