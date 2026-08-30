import { describe, expect, it } from "vitest";
import { blankProject } from "../example/blankProject";
import { applyWorkspaceEdit } from "./projectEdits";
import { FALLBACK_QUANTITIES } from "./quantities";
import { backlinksTo, isMemoObject, wouldCreateParentCycle } from "./memo";
import { isCalculationObject } from "./worksheet";
import { isValidCanvasConnection } from "./connectionRules";
import { libraryPlaceEdit } from "./libraryPlace";
import { normalizeLoadedProject } from "./worksheet";
import type { MemoObject, ProjectDocument } from "../types/contract";

function applyAll(edits: Parameters<typeof applyWorkspaceEdit>[1][]): ProjectDocument {
  let project = structuredClone(blankProject);
  for (const edit of edits) {
    project = applyWorkspaceEdit(project, edit, FALLBACK_QUANTITIES).project;
  }
  return project;
}

function memoOf(project: ProjectDocument): MemoObject {
  const memo = project.objects.find(isMemoObject);
  if (!memo) throw new Error("expected memo");
  return memo;
}

describe("memo core", () => {
  it("creates an empty memo from the library place edit", () => {
    expect(libraryPlaceEdit({ place: "memo" })).toEqual({ type: "addMemo" });
    const project = applyAll([libraryPlaceEdit({ place: "memo" })]);
    const memo = memoOf(project);
    expect(memo.kind).toBe("memo");
    expect(memo.blocks).toEqual([]);
    expect(memo.links).toEqual([]);
    expect(memo.id.startsWith("m_")).toBe(true);
    expect(isCalculationObject(memo)).toBe(false);
  });

  it("keeps the id when the title changes and restores after load", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const id = memoOf(project).id;
    project = applyWorkspaceEdit(project, { type: "updateMemo", objectId: id, patch: { title: "CW Pump" } }, FALLBACK_QUANTITIES).project;
    expect(memoOf(project).id).toBe(id);
    expect(memoOf(project).title).toBe("CW Pump");
    const loaded = applyWorkspaceEdit(blankProject, { type: "loadProject", project: JSON.parse(JSON.stringify(project)) }, FALLBACK_QUANTITIES).project;
    expect(memoOf(loaded).id).toBe(id);
    expect(memoOf(loaded).title).toBe("CW Pump");
  });

  it("duplicates a memo with a new id and new block ids", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const original = memoOf(project);
    project = applyWorkspaceEdit(project, { type: "addMemoBlock", objectId: original.id, blockType: "text" }, FALLBACK_QUANTITIES).project;
    const blockId = memoOf(project).blocks[0]!.id;
    project = applyWorkspaceEdit(project, { type: "duplicateObjects", objectIds: [original.id] }, FALLBACK_QUANTITIES).project;
    const memos = project.objects.filter(isMemoObject);
    expect(memos).toHaveLength(2);
    expect(new Set(memos.map((item) => item.id)).size).toBe(2);
    expect(memos.every((item) => item.blocks[0]?.id !== blockId || item.id === original.id)).toBe(true);
    expect(memos.find((item) => item.id !== original.id)?.blocks[0]?.id).not.toBe(blockId);
  });

  it("stores parent/child and rejects a cycle", () => {
    let project = applyAll([{ type: "addMemo" }, { type: "addMemo" }]);
    const [parent, child] = project.objects.filter(isMemoObject);
    project = applyWorkspaceEdit(
      project,
      { type: "updateMemo", objectId: child!.id, patch: { parentId: parent!.id } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.filter(isMemoObject).find((item) => item.id === child!.id)?.parentId).toBe(parent!.id);
    expect(wouldCreateParentCycle(project, parent!.id, child!.id)).toBe(true);
    const cycled = applyWorkspaceEdit(
      project,
      { type: "updateMemo", objectId: parent!.id, patch: { parentId: child!.id } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.filter(isMemoObject).find((item) => item.id === parent!.id)?.parentId).toBeUndefined();
    expect(cycled.objects.filter(isMemoObject).find((item) => item.id === parent!.id)?.parentId).toBeUndefined();
  });

  it("adds unique tags and finds them by normalized key", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const id = memoOf(project).id;
    project = applyWorkspaceEdit(project, { type: "addMemoTag", objectId: id, label: "#CW" }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(project, { type: "addMemoTag", objectId: id, label: "cw" }, FALLBACK_QUANTITIES).project;
    expect(memoOf(project).tags).toEqual([{ label: "CW", normalizedKey: "cw" }]);
  });

  it("links a memo to a calculation without creating a value-flow edge", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const calcId = project.objects.find(isCalculationObject)!.id;
    const memoId = memoOf(project).id;
    project = applyWorkspaceEdit(
      project,
      { type: "connectMemoLink", sourceMemoId: memoId, targetObjectId: calcId, relation: "reference" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(memoOf(project).links[0]?.targetObjectId).toBe(calcId);
    expect(project.edges.some((edge) => edge.sourceObjectId === memoId)).toBe(false);
    expect(backlinksTo(project, calcId)).toHaveLength(1);
    expect(
      isValidCanvasConnection(project, {
        source: memoId,
        target: calcId,
        sourceHandle: "MEMO",
        targetHandle: "OBJ",
      }),
    ).toBe(true);
  });

  it("does not treat a memo as a calculation object", () => {
    const project = applyAll([{ type: "addMemo" }]);
    expect(project.objects.filter(isCalculationObject)).toHaveLength(1);
    expect(project.objects.filter(isMemoObject)).toHaveLength(1);
  });

  it("loads a worksheet that has no memos", () => {
    const loaded = normalizeLoadedProject(JSON.parse(JSON.stringify(blankProject)));
    expect(loaded.objects.filter(isMemoObject)).toEqual([]);
  });
});
