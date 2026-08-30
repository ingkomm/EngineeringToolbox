import { describe, expect, it } from "vitest";
import { blankProject } from "../example/blankProject";
import { applyWorkspaceEdit } from "./projectEdits";
import { FALLBACK_QUANTITIES } from "./quantities";
import { deriveKnowledgeGraph, hierarchyWindow, knowledgeGraphDoesNotMutate } from "./knowledgeGraph";
import { isMemoObject } from "./memo";
import { isCalculationObject } from "./worksheet";
import type { ProjectDocument } from "../types/contract";

function applyAll(edits: Parameters<typeof applyWorkspaceEdit>[1][]): ProjectDocument {
  let project = structuredClone(blankProject);
  for (const edit of edits) {
    project = applyWorkspaceEdit(project, edit, FALLBACK_QUANTITIES).project;
  }
  return project;
}

describe("knowledge graph", () => {
  it("derives nodes from stored links, tags, and hierarchy without mutating the project", () => {
    let project = applyAll([{ type: "addMemo" }, { type: "addMemo" }]);
    const [parent, child] = project.objects.filter(isMemoObject);
    const calcId = project.objects.find(isCalculationObject)!.id;
    project = applyWorkspaceEdit(project, { type: "updateMemo", objectId: child!.id, patch: { parentId: parent!.id } }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(project, { type: "addMemoTag", objectId: parent!.id, label: "#CW" }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(
      project,
      { type: "connectMemoLink", sourceMemoId: parent!.id, targetObjectId: calcId, relation: "reference" },
      FALLBACK_QUANTITIES,
    ).project;
    const snapshot = JSON.parse(JSON.stringify(project)) as ProjectDocument;
    knowledgeGraphDoesNotMutate(project);
    const graph = deriveKnowledgeGraph(project);
    expect(project).toEqual(snapshot);
    expect(graph.nodes.some((node) => node.id === parent!.id && node.kind === "memo")).toBe(true);
    expect(graph.nodes.some((node) => node.id === calcId && node.kind === "calculation")).toBe(true);
    expect(graph.nodes.some((node) => node.id === "tag:cw" && node.kind === "tag")).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "hierarchy" && edge.source === parent!.id && edge.target === child!.id)).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "memo-attachment" && edge.source === parent!.id && edge.target === calcId)).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "tag" && edge.target === "tag:cw")).toBe(true);
    expect(hierarchyWindow(project, parent!.id, 1).has(child!.id)).toBe(true);
    expect(hierarchyWindow(project, parent!.id, 1).has(parent!.id)).toBe(true);
  });
});
