import { describe, expect, it } from "vitest";
import { blankProject } from "../example/blankProject";
import { applyWorkspaceEdit } from "./projectEdits";
import { FALLBACK_QUANTITIES } from "./quantities";
import { isMemoObject } from "./memo";
import { isCalculationObject, normalizeLoadedProject } from "./worksheet";
import { isValidCanvasConnection } from "./connectionRules";
import { libraryPlaceEdit } from "./libraryPlace";
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

describe("simple memo", () => {
  it("creates an empty memo from the library", () => {
    expect(libraryPlaceEdit({ place: "memo" })).toEqual({ type: "addMemo" });
    const project = applyAll([{ type: "addMemo" }]);
    const memo = memoOf(project);
    expect(memo.kind).toBe("memo");
    expect(memo.title).toBe("");
    expect(memo.content).toBe("");
    expect(memo.tables).toEqual([]);
    expect(memo.links).toEqual([]);
    expect(isCalculationObject(memo)).toBe(false);
  });

  it("keeps title, content, and a simple table through save and load", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const id = memoOf(project).id;
    project = applyWorkspaceEdit(project, { type: "updateMemo", objectId: id, patch: { title: "Note", content: "line 1\nline 2" } }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(project, { type: "addMemoTable", objectId: id }, FALLBACK_QUANTITIES).project;
    const tableId = memoOf(project).tables[0]!.id;
    project = applyWorkspaceEdit(
      project,
      { type: "updateMemoTable", objectId: id, tableId, cells: [["a", "b"], ["1", "2"]] },
      FALLBACK_QUANTITIES,
    ).project;
    const loaded = applyWorkspaceEdit(blankProject, { type: "loadProject", project: JSON.parse(JSON.stringify(project)) }, FALLBACK_QUANTITIES).project;
    const memo = loaded.objects.find(isMemoObject)!;
    expect(memo.id).toBe(id);
    expect(memo.title).toBe("Note");
    expect(memo.content).toBe("line 1\nline 2");
    expect(memo.tables[0]?.cells).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("stores a visual link without creating a value-flow edge", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const calcId = project.objects.find(isCalculationObject)!.id;
    const memoId = memoOf(project).id;
    project = applyWorkspaceEdit(project, { type: "connectMemoLink", memoId, targetObjectId: calcId }, FALLBACK_QUANTITIES).project;
    expect(memoOf(project).links[0]?.targetObjectId).toBe(calcId);
    expect(project.edges.some((edge) => edge.sourceObjectId === memoId)).toBe(false);
    expect(
      isValidCanvasConnection(project, {
        source: memoId,
        target: calcId,
        sourceHandle: "MEMO",
        targetHandle: "OBJ",
      }),
    ).toBe(true);
  });

  it("loads a worksheet that has no memos", () => {
    expect(normalizeLoadedProject(JSON.parse(JSON.stringify(blankProject))).objects.filter(isMemoObject)).toEqual([]);
  });
});
