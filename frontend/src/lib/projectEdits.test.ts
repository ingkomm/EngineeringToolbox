import { describe, expect, it } from "vitest";
import { applyWorkspaceEdit } from "./projectEdits";
import { blankProject } from "../example/blankProject";
import { FALLBACK_QUANTITIES } from "./quantities";
import type { ProjectDocument } from "../types/contract";

function applyAll(edits: Parameters<typeof applyWorkspaceEdit>[1][]): ProjectDocument {
  let project = structuredClone(blankProject);
  for (const edit of edits) {
    project = applyWorkspaceEdit(project, edit, FALLBACK_QUANTITIES).project;
  }
  return project;
}

describe("blank workspace", () => {
  it("starts with one empty object and no edges", () => {
    expect(blankProject.objects).toHaveLength(1);
    expect(blankProject.objects[0]?.id).toBe("obj_1");
    expect(blankProject.objects[0]?.inputs).toEqual([]);
    expect(blankProject.objects[0]?.calculations).toEqual([]);
    expect(blankProject.objects[0]?.outputs).toEqual([]);
    expect(blankProject.edges).toEqual([]);
  });
});

describe("user-authored tables", () => {
  it("lets the user add input/calculation/output rows and SI quantities", () => {
    const project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "FLOW", value: 120, quantity: "mass_flow" } },
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 1, patch: { id: "PIN", value: 12, quantity: "pressure" } },
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 2, patch: { id: "POUT", value: 15, quantity: "pressure" } },
      { type: "addCalculation", objectId: "obj_1" },
      {
        type: "updateCalculation",
        objectId: "obj_1",
        index: 0,
        patch: { id: "DP", formula: "POUT - PIN", quantity: "pressure" },
      },
      { type: "addCalculation", objectId: "obj_1" },
      {
        type: "updateCalculation",
        objectId: "obj_1",
        index: 1,
        patch: { id: "POWER", formula: "FLOW * DP", quantity: "power" },
      },
    ]);

    const object = project.objects[0];
    expect(object?.inputs.map((item) => [item.id, item.value, item.unit])).toEqual([
      ["FLOW", 120, "kg/s"],
      ["PIN", 12, "Pa"],
      ["POUT", 15, "Pa"],
    ]);
    expect(object?.calculations.map((item) => [item.id, item.formula, item.unit])).toEqual([
      ["DP", "POUT - PIN", "Pa"],
      ["POWER", "FLOW * DP", "W"],
    ]);
    expect(object?.outputs.map((item) => [item.id, item.sourceVariableId])).toEqual([
      ["FLOW", "FLOW"],
      ["PIN", "PIN"],
      ["POUT", "POUT"],
      ["DP", "DP"],
      ["POWER", "POWER"],
    ]);
  });

  it("adds a second object without copying calculated results", () => {
    const project = applyAll([{ type: "addObject" }]);
    expect(project.objects.map((item) => item.id)).toEqual(["obj_1", "obj_2"]);
    expect(project.objects[1]?.inputs).toEqual([]);
    expect(project.objects[1]?.calculations).toEqual([]);
  });
});

describe("auto-linked ports", () => {
  it("rewrites formulas and ports when an input id is renamed", () => {
    const project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "FLOW", value: 120, quantity: "mass_flow" } },
      { type: "addCalculation", objectId: "obj_1" },
      { type: "updateCalculation", objectId: "obj_1", index: 0, patch: { id: "POWER", formula: "FLOW * 2" } },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "MASS" } },
    ]);
    const object = project.objects[0];
    expect(object?.calculations[0]?.formula).toBe("MASS * 2");
    expect(object?.outputs.map((item) => item.id)).toEqual(["MASS", "POWER"]);
  });

  it("rejects duplicate global ids", () => {
    const project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "FLOW" } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
      { type: "updateInput", objectId: "obj_2", index: 0, patch: { id: "FLOW" } },
    ]);
    expect(project.objects[1]?.inputs[0]?.id).toBe("IN_1");
  });

  it("connects an input to the source variable identity and toggles Off/On", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "POWER", name: "동력", value: 10 } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
    ]);
    const localId = project.objects[1]?.inputs[0]?.id ?? "";
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectMapping",
        sourceObjectId: "obj_1",
        sourceVariableId: "POWER",
        targetObjectId: "obj_2",
        targetVariableId: localId,
      },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[1]?.inputs[0]?.id).toBe("POWER");
    expect(project.objects[1]?.inputs[0]?.name).toBe("동력");
    expect(project.edges[0]?.enabled).toBe(true);

    project = applyWorkspaceEdit(project, { type: "toggleEdge", edgeId: project.edges[0]!.id }, FALLBACK_QUANTITIES).project;
    expect(project.edges[0]?.enabled).toBe(false);
    expect(project.objects[1]?.inputs[0]?.id).not.toBe("POWER");

    project = applyWorkspaceEdit(project, { type: "toggleEdge", edgeId: project.edges[0]!.id }, FALLBACK_QUANTITIES).project;
    expect(project.edges[0]?.enabled).toBe(true);
    expect(project.objects[1]?.inputs[0]?.id).toBe("POWER");
    expect(project.objects[1]?.inputs[0]?.name).toBe("동력");
  });

  it("copies source quantity/unit onto a mapped input and follows later source changes", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "P", value: 10, quantity: "pressure" } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_3" },
    ]);
    const midId = project.objects[1]?.inputs[0]?.id ?? "";
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectMapping",
        sourceObjectId: "obj_1",
        sourceVariableId: "P",
        targetObjectId: "obj_2",
        targetVariableId: midId,
      },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[1]?.inputs[0]).toMatchObject({ id: "P", quantity: "pressure", unit: "Pa" });

    const dstId = project.objects[2]?.inputs[0]?.id ?? "";
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectMapping",
        sourceObjectId: "obj_2",
        sourceVariableId: "P",
        targetObjectId: "obj_3",
        targetVariableId: dstId,
      },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[2]?.inputs[0]).toMatchObject({ id: "P", quantity: "pressure", unit: "Pa" });

    project = applyWorkspaceEdit(
      project,
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { quantity: "temperature" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[0]?.inputs[0]).toMatchObject({ quantity: "temperature", unit: "K" });
    expect(project.objects[1]?.inputs[0]).toMatchObject({ quantity: "temperature", unit: "K" });
    expect(project.objects[2]?.inputs[0]).toMatchObject({ quantity: "temperature", unit: "K" });

    project = applyWorkspaceEdit(project, { type: "toggleEdge", edgeId: project.edges[1]!.id }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(
      project,
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { quantity: "length" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[1]?.inputs[0]).toMatchObject({ quantity: "length", unit: "m" });
    expect(project.objects[2]?.inputs[0]?.quantity).not.toBe("length");
  });

  it("drops mapping edges when the source variable is removed", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "FLOW", value: 120 } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
    ]);
    project = {
      ...project,
      edges: [
        {
          id: "e1",
          sourceObjectId: "obj_1",
          sourceVariableId: "FLOW",
          targetObjectId: "obj_2",
          targetVariableId: "IN_1",
          enabled: true,
        },
      ],
    };
    project = applyWorkspaceEdit(project, { type: "removeInput", objectId: "obj_1", index: 0 }, FALLBACK_QUANTITIES).project;
    expect(project.edges).toEqual([]);
    expect(project.objects[0]?.outputs).toEqual([]);
  });
});

describe("unique objects and search connectors", () => {
  it("keeps object ids and names unique and rekeys edges", () => {
    let project = applyAll([{ type: "addObject" }]);
    expect(project.objects.map((item) => [item.id, item.name])).toEqual([
      ["obj_1", "Object 1"],
      ["obj_2", "Object 2"],
    ]);
    project = applyWorkspaceEdit(
      project,
      { type: "updateObject", objectId: "obj_2", patch: { name: "Object 1" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[1]?.name).toBe("Object 2");
    project = applyWorkspaceEdit(
      project,
      { type: "updateObject", objectId: "obj_2", patch: { id: "obj_1" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[1]?.id).toBe("obj_2");

    project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "POWER" } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
    ]);
    const localId = project.objects[1]?.inputs[0]?.id ?? "";
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectMapping",
        sourceObjectId: "obj_1",
        sourceVariableId: "POWER",
        targetObjectId: "obj_2",
        targetVariableId: localId,
      },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      { type: "updateObject", objectId: "obj_2", patch: { id: "sink", name: "Sink" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[1]?.id).toBe("sink");
    expect(project.edges[0]?.targetObjectId).toBe("sink");
  });

  it("connects through object search and can collapse the edge", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "POWER", value: 10 } },
      { type: "addObject" },
    ]);
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectBySearch",
        sourceObjectId: "obj_1",
        sourceVariableId: "POWER",
        targetObjectId: "obj_2",
      },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects[1]?.inputs[0]?.id).toBe("POWER");
    expect(project.edges[0]?.collapsed).toBe(false);
    project = applyWorkspaceEdit(
      project,
      { type: "toggleEdgeCollapsed", edgeId: project.edges[0]!.id },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.edges[0]?.collapsed).toBe(true);
  });

  it("disconnects a mapped input through deleteEdges", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "POWER", value: 10 } },
      { type: "addObject" },
    ]);
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectBySearch",
        sourceObjectId: "obj_1",
        sourceVariableId: "POWER",
        targetObjectId: "obj_2",
      },
      FALLBACK_QUANTITIES,
    ).project;
    const edgeId = project.edges[0]?.id;
    expect(edgeId).toBeDefined();
    expect(project.objects[1]?.inputs[0]?.id).toBe("POWER");
    project = applyWorkspaceEdit(
      project,
      { type: "deleteEdges", edgeIds: [edgeId!] },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.edges).toHaveLength(0);
    expect(project.objects[1]?.inputs[0]?.id).toMatch(/^IN_/);
  });
});
