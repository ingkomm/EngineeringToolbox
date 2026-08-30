import { describe, expect, it } from "vitest";
import { blankProject } from "../example/blankProject";
import { applyWorkspaceEdit } from "../shared/projectEdits";
import { FALLBACK_QUANTITIES } from "../shared/quantities";
import { isMemoObject } from "./memo";
import { isCalculationObject, normalizeLoadedProject } from "../shared/worksheet";
import { isValidCanvasConnection } from "../shared/connectionRules";
import { libraryPlaceEdit } from "../shared/libraryPlace";
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
    expect(memo.sections).toEqual([]);
    expect(memo.links).toEqual([]);
    expect(isCalculationObject(memo)).toBe(false);
  });

  it("keeps title, markdown text, and tables through save and load", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const id = memoOf(project).id;
    project = applyWorkspaceEdit(project, { type: "updateMemo", objectId: id, patch: { title: "Note" } }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(project, { type: "addMemoSection", objectId: id, sectionType: "text" }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(project, { type: "addMemoSection", objectId: id, sectionType: "table" }, FALLBACK_QUANTITIES).project;
    const text = memoOf(project).sections.find((item) => item.type === "text");
    const table = memoOf(project).sections.find((item) => item.type === "table");
    if (!text || !table || table.type !== "table") throw new Error("sections");
    project = applyWorkspaceEdit(
      project,
      { type: "updateMemoSection", objectId: id, sectionId: text.id, patch: { content: "**bold** note" } },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      { type: "updateMemoSection", objectId: id, sectionId: table.id, patch: { cells: [["a", "b"], ["1", "2"]] } },
      FALLBACK_QUANTITIES,
    ).project;
    const loaded = applyWorkspaceEdit(blankProject, { type: "loadProject", project: JSON.parse(JSON.stringify(project)) }, FALLBACK_QUANTITIES).project;
    const memo = loaded.objects.find(isMemoObject)!;
    expect(memo.id).toBe(id);
    expect(memo.title).toBe("Note");
    expect(memo.sections).toHaveLength(2);
    expect(memo.sections.find((item) => item.type === "text")?.content).toBe("**bold** note");
    expect(memo.sections.find((item) => item.type === "table")).toMatchObject({ cells: [["a", "b"], ["1", "2"]] });
  });

  it("creates a 2x2 table and keeps the memo attachment side", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const id = memoOf(project).id;
    project = applyWorkspaceEdit(project, { type: "addMemoSection", objectId: id, sectionType: "table" }, FALLBACK_QUANTITIES).project;
    const table = memoOf(project).sections.find((item) => item.type === "table");
    expect(table?.type === "table" && table.cells).toEqual([
      ["", ""],
      ["", ""],
    ]);
    project = applyWorkspaceEdit(project, { type: "setObjectLinkSide", objectId: id, side: "bottom" }, FALLBACK_QUANTITIES).project;
    expect(memoOf(project).objectLinkSide).toBe("bottom");
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
        targetHandle: "MEMO-in",
      }),
    ).toBe(true);
    expect(
      isValidCanvasConnection(project, {
        source: memoId,
        target: calcId,
        sourceHandle: "MEMO",
        targetHandle: "OBJ",
      }),
    ).toBe(false);
    project = applyWorkspaceEdit(project, { type: "setMemoLinkSide", objectId: calcId, side: "bottom" }, FALLBACK_QUANTITIES).project;
    expect(project.objects.find(isCalculationObject)?.memoLinkSide).toBe("bottom");
  });

  it("loads a worksheet that has no memos", () => {
    expect(normalizeLoadedProject(JSON.parse(JSON.stringify(blankProject))).objects.filter(isMemoObject)).toEqual([]);
  });

  it("migrates a legacy single content and table into sections", () => {
    const loaded = normalizeLoadedProject({
      ...blankProject,
      objects: [
        ...blankProject.objects,
        {
          kind: "memo",
          id: "m_legacy",
          title: "Old",
          content: "hello",
          table: { cells: [["x"]] },
          links: [],
          position: { x: 0, y: 0 },
          size: { width: 200, height: 140 },
        } as never,
      ],
    });
    const memo = loaded.objects.find(isMemoObject)!;
    expect(memo.sections.map((item) => item.type)).toEqual(["text", "table"]);
  });
});
