import type {
  MemoBlock,
  MemoLink,
  MemoLinkTargetKind,
  MemoObject,
  ObjectKind,
  ObjectLinkBlock,
  ProjectDocument,
  TagRef,
  TextBlock,
  WorksheetObject,
} from "../types/contract";
import { newStableId } from "./ids";

export const MEMO_ATTACHMENT_HANDLE = "MEMO";
export const MEMO_DEFAULT_SIZE = { width: 220, height: 148 };
export const SCHEMA_VERSION = 2;

export function isMemoObject(object: WorksheetObject): object is MemoObject {
  return object.kind === "memo";
}

export function isMemoAttachmentHandle(portId: string | null | undefined): boolean {
  return portId === MEMO_ATTACHMENT_HANDLE;
}

export function memoTitleOf(memo: MemoObject): string {
  return memo.title?.trim() || "";
}

export function normalizeTagLabel(label: string): TagRef | null {
  const trimmed = label.trim().replace(/^#/, "").replace(/\s+/g, " ");
  if (!trimmed) return null;
  return { label: trimmed, normalizedKey: trimmed.toLowerCase() };
}

export function addTag(tags: TagRef[], label: string): TagRef[] {
  const next = normalizeTagLabel(label);
  if (!next) return tags;
  if (tags.some((item) => item.normalizedKey === next.normalizedKey)) return tags;
  return [...tags, next];
}

export function removeTag(tags: TagRef[], key: string): TagRef[] {
  return tags.filter((item) => item.normalizedKey !== key);
}

export function emptyMemo(position: { x: number; y: number }): MemoObject {
  return {
    kind: "memo",
    id: newStableId("m"),
    title: "",
    tags: [],
    blocks: [],
    links: [],
    position,
    size: { ...MEMO_DEFAULT_SIZE },
  };
}

export function cloneMemo(memo: MemoObject, position: { x: number; y: number }): MemoObject {
  const id = newStableId("m");
  const linkIdMap = new Map(memo.links.map((link) => [link.id, newStableId("l")]));
  return {
    ...memo,
    id,
    parentId: undefined,
    position,
    blocks: memo.blocks.map((block) => cloneBlock(block, linkIdMap)),
    links: memo.links.map((link) => ({
      ...link,
      id: linkIdMap.get(link.id) ?? newStableId("l"),
      sourceMemoId: id,
    })),
  };
}

function cloneBlock(block: MemoBlock, linkIdMap: Map<string, string>): MemoBlock {
  const id = newStableId("b");
  if (block.type === "text") {
    return { ...block, id };
  }
  return {
    ...block,
    id,
    linkIds: block.linkIds.map((item) => linkIdMap.get(item) ?? item),
  };
}

export function firstTextPreview(memo: MemoObject): string {
  const text = memo.blocks
    .filter((item): item is TextBlock => item.type === "text")
    .sort((a, b) => a.order - b.order)
    .find((item) => item.content.trim());
  if (!text) return "";
  return text.content.trim().split(/\n/)[0]?.slice(0, 80) ?? "";
}

export function sortedBlocks(memo: MemoObject): MemoBlock[] {
  return [...memo.blocks].sort((a, b) => a.order - b.order);
}

export function childrenOf(project: ProjectDocument, parentId: string): MemoObject[] {
  return project.objects.filter((item): item is MemoObject => isMemoObject(item) && item.parentId === parentId);
}

export function memosOf(project: ProjectDocument): MemoObject[] {
  return project.objects.filter(isMemoObject);
}

export function wouldCreateParentCycle(project: ProjectDocument, memoId: string, parentId: string | undefined): boolean {
  if (!parentId) return false;
  if (parentId === memoId) return true;
  const byId = new Map(memosOf(project).map((item) => [item.id, item]));
  let cursor: string | undefined = parentId;
  const seen = new Set<string>([memoId]);
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId;
  }
  return false;
}

export function backlinksTo(project: ProjectDocument, objectId: string): MemoLink[] {
  return memosOf(project).flatMap((memo) => memo.links.filter((link) => link.targetObjectId === objectId));
}

export function objectKindOf(object: WorksheetObject): ObjectKind {
  if (object.kind === "equipment") return "equipment";
  if (object.kind === "point") return "point";
  if (object.kind === "memo") return "memo";
  return "calculation";
}

export function memoLinkEdgeId(linkId: string): string {
  return `memolink:${linkId}`;
}

export function parseMemoLinkEdgeId(edgeId: string): string | null {
  return edgeId.startsWith("memolink:") ? edgeId.slice("memolink:".length) : null;
}

export function targetKindForObject(object: WorksheetObject): MemoLinkTargetKind {
  return objectKindOf(object);
}

export function nextBlockOrder(memo: MemoObject): number {
  return memo.blocks.reduce((max, item) => Math.max(max, item.order), -1) + 1;
}

export function newObjectLinkBlock(order: number): ObjectLinkBlock {
  return { id: newStableId("b"), type: "object-link", order, collapsed: false, linkIds: [] };
}

export function newTextBlock(order: number): TextBlock {
  return { id: newStableId("b"), type: "text", order, collapsed: false, content: "", format: "plain" };
}

export function normalizeMemo(object: MemoObject, objectIds: Set<string>): MemoObject {
  const tags: TagRef[] = [];
  for (const tag of object.tags ?? []) {
    const next = typeof tag === "string" ? normalizeTagLabel(tag) : normalizeTagLabel(tag.label);
    if (next && !tags.some((item) => item.normalizedKey === next.normalizedKey)) tags.push(next);
  }
  const parentId = object.parentId && object.parentId !== object.id && objectIds.has(object.parentId) ? object.parentId : undefined;
  const blocks = (object.blocks ?? []).map((block, index) => ({
    ...block,
    order: Number.isFinite(block.order) ? block.order : index,
  }));
  const links = (object.links ?? []).filter((link) => objectIds.has(link.targetObjectId));
  return {
    ...object,
    kind: "memo",
    title: object.title ?? "",
    tags,
    parentId,
    blocks,
    links: links.map((link) => ({ ...link, sourceMemoId: object.id })),
    size: {
      width: Math.max(160, object.size?.width ?? MEMO_DEFAULT_SIZE.width),
      height: Math.max(110, object.size?.height ?? MEMO_DEFAULT_SIZE.height),
    },
    position: object.position ?? { x: 80, y: 88 },
  };
}
