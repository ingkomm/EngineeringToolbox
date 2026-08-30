import type { MemoObject, MemoSection } from "./types";
import type { ProjectDocument } from "../shared/document";
import { noEval, type EditResult } from "../shared/editResult";
import { isMemoObject, emptyMemo, newMemoTableSection, newMemoTextSection } from "./memo";
import { newStableId } from "../shared/ids";

export type MemoEdit =
  | { type: "addMemo"; position?: { x: number; y: number } }
  | {
      type: "updateMemo";
      objectId: string;
      patch: {
        title?: string;
        sections?: MemoSection[];
        size?: { width: number; height: number };
        position?: { x: number; y: number };
      };
    }
  | { type: "addMemoSection"; objectId: string; sectionType: "text" | "table" }
  | { type: "removeMemoSection"; objectId: string; sectionId: string }
  | { type: "updateMemoSection"; objectId: string; sectionId: string; patch: { content?: string; cells?: string[][] } }
  | { type: "connectMemoLink"; memoId: string; targetObjectId: string }
  | { type: "setMemoLinkSide"; objectId: string; side: "top" | "bottom" };

function patchMemo(project: ProjectDocument, objectId: string, updater: (memo: MemoObject) => MemoObject): EditResult {
  const current = project.objects.find((item) => item.id === objectId);
  if (!current || !isMemoObject(current)) return noEval(project);
  const next = updater(current);
  return {
    project: {
      ...project,
      objects: project.objects.map((item) => (item.id === objectId ? next : item)),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function updateMemo(
  project: ProjectDocument,
  objectId: string,
  patch: {
    title?: string;
    sections?: MemoSection[];
    size?: { width: number; height: number };
    position?: { x: number; y: number };
  },
): EditResult {
  return patchMemo(project, objectId, (memo) => ({
    ...memo,
    title: patch.title ?? memo.title,
    sections: patch.sections ?? memo.sections,
    size: patch.size ?? memo.size,
    position: patch.position ?? memo.position,
  }));
}

function connectMemoLink(project: ProjectDocument, memoId: string, targetObjectId: string): EditResult {
  const memo = project.objects.find((item) => item.id === memoId);
  const target = project.objects.find((item) => item.id === targetObjectId);
  if (!memo || !isMemoObject(memo) || !target || target.id === memo.id) return noEval(project);
  if (memo.links.some((link) => link.targetObjectId === targetObjectId)) return noEval(project);
  return {
    project: {
      ...project,
      objects: project.objects.map((item) =>
        item.id === memoId
          ? {
              ...memo,
              links: [...memo.links, { id: newStableId("l"), memoId, targetObjectId }],
            }
          : item,
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function setMemoLinkSide(project: ProjectDocument, objectId: string, side: "top" | "bottom"): EditResult {
  if (side !== "top" && side !== "bottom") return noEval(project);
  const current = project.objects.find((item) => item.id === objectId);
  if (!current || isMemoObject(current)) return noEval(project);
  return {
    project: {
      ...project,
      objects: project.objects.map((item) =>
        item.id === objectId && !isMemoObject(item) ? { ...item, memoLinkSide: side } : item,
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

export function applyMemoEdit(project: ProjectDocument, edit: MemoEdit): EditResult {
  switch (edit.type) {
    case "addMemo":
      return {
        project: {
          ...project,
          objects: [
            ...project.objects,
            emptyMemo(edit.position ?? { x: 80 + project.objects.length * 240, y: 88 }),
          ],
        },
        dirtyObjectIds: [],
        shouldEvaluate: false,
      };
    case "updateMemo":
      return updateMemo(project, edit.objectId, edit.patch);
    case "addMemoSection":
      return patchMemo(project, edit.objectId, (memo) => ({
        ...memo,
        sections: [...memo.sections, edit.sectionType === "table" ? newMemoTableSection() : newMemoTextSection()],
      }));
    case "removeMemoSection":
      return patchMemo(project, edit.objectId, (memo) => ({
        ...memo,
        sections: memo.sections.filter((section) => section.id !== edit.sectionId),
      }));
    case "updateMemoSection":
      return patchMemo(project, edit.objectId, (memo) => ({
        ...memo,
        sections: memo.sections.map((section) => {
          if (section.id !== edit.sectionId) return section;
          if (section.type === "text") return { ...section, content: edit.patch.content ?? section.content };
          return { ...section, cells: edit.patch.cells ?? section.cells };
        }),
      }));
    case "connectMemoLink":
      return connectMemoLink(project, edit.memoId, edit.targetObjectId);
    case "setMemoLinkSide":
      return setMemoLinkSide(project, edit.objectId, edit.side);
  }
}

export function isMemoEdit(edit: { type: string }): edit is MemoEdit {
  return (
    edit.type === "addMemo" ||
    edit.type === "updateMemo" ||
    edit.type === "addMemoSection" ||
    edit.type === "removeMemoSection" ||
    edit.type === "updateMemoSection" ||
    edit.type === "connectMemoLink" ||
    edit.type === "setMemoLinkSide"
  );
}
