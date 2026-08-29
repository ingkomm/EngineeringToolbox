import { describe, expect, it } from "vitest";
import { applyWorkspaceEdit } from "./projectEdits";
import { blankProject } from "../example/blankProject";
import { FALLBACK_QUANTITIES } from "./quantities";
import type { CalculationObject, ProjectDocument } from "../types/contract";
import { isArrangementObject, isCalculationObject } from "./worksheet";

function calc(project: ProjectDocument, index = 0): CalculationObject {
  const object = project.objects[index];
  if (!object || !isCalculationObject(object)) {
    throw new Error(`expected calculation object at ${index}`);
  }
  return object;
}

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
    expect(calc(blankProject).id).toBe("obj_1");
    expect(calc(blankProject).inputs).toEqual([]);
    expect(calc(blankProject).calculations).toEqual([]);
    expect(calc(blankProject).outputs).toEqual([]);
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

    const object = calc(project);
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
    expect(calc(project, 1).inputs).toEqual([]);
    expect(calc(project, 1).calculations).toEqual([]);
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
    const object = calc(project);
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
    expect(calc(project, 1).inputs[0]?.id).toBe("IN_1");
  });

  it("connects an input to the source variable identity and toggles Off/On", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "POWER", name: "동력", value: 10 } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
    ]);
    const localId = calc(project, 1).inputs[0]?.id ?? "";
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
    expect(calc(project, 1).inputs[0]?.id).toBe("POWER");
    expect(calc(project, 1).inputs[0]?.name).toBe("동력");
    expect(project.edges[0]?.enabled).toBe(true);

    project = applyWorkspaceEdit(project, { type: "toggleEdge", edgeId: project.edges[0]!.id }, FALLBACK_QUANTITIES).project;
    expect(project.edges[0]?.enabled).toBe(false);
    expect(calc(project, 1).inputs[0]?.id).not.toBe("POWER");

    project = applyWorkspaceEdit(project, { type: "toggleEdge", edgeId: project.edges[0]!.id }, FALLBACK_QUANTITIES).project;
    expect(project.edges[0]?.enabled).toBe(true);
    expect(calc(project, 1).inputs[0]?.id).toBe("POWER");
    expect(calc(project, 1).inputs[0]?.name).toBe("동력");
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
    const midId = calc(project, 1).inputs[0]?.id ?? "";
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
    expect(calc(project, 1).inputs[0]).toMatchObject({ id: "P", quantity: "pressure", unit: "Pa" });

    const dstId = calc(project, 2).inputs[0]?.id ?? "";
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
    expect(calc(project, 2).inputs[0]).toMatchObject({ id: "P", quantity: "pressure", unit: "Pa" });

    project = applyWorkspaceEdit(
      project,
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { quantity: "temperature" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(project).inputs[0]).toMatchObject({ quantity: "temperature", unit: "K" });
    expect(calc(project, 1).inputs[0]).toMatchObject({ quantity: "temperature", unit: "K" });
    expect(calc(project, 2).inputs[0]).toMatchObject({ quantity: "temperature", unit: "K" });

    project = applyWorkspaceEdit(project, { type: "toggleEdge", edgeId: project.edges[1]!.id }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(
      project,
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { quantity: "length" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(project, 1).inputs[0]).toMatchObject({ quantity: "length", unit: "m" });
    expect(calc(project, 2).inputs[0]?.quantity).not.toBe("length");
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
    expect(calc(project).outputs).toEqual([]);
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
    expect(calc(project, 1).name).toBe("Object 2");
    project = applyWorkspaceEdit(
      project,
      { type: "updateObject", objectId: "obj_2", patch: { id: "obj_1" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(project, 1).id).toBe("obj_2");

    project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "POWER" } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
    ]);
    const localId = calc(project, 1).inputs[0]?.id ?? "";
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
    expect(calc(project, 1).id).toBe("sink");
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
    expect(calc(project, 1).inputs[0]?.id).toBe("POWER");
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
    expect(calc(project, 1).inputs[0]?.id).toBe("POWER");
    project = applyWorkspaceEdit(
      project,
      { type: "deleteEdges", edgeIds: [edgeId!] },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.edges).toHaveLength(0);
    expect(calc(project, 1).inputs[0]?.id).toMatch(/^IN_/);
  });

  it("rejects a second mapping from the same object output", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "POWER", value: 10 } },
      { type: "addObject" },
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
    expect(project.edges).toHaveLength(1);
    const before = calc(project, 2).inputs.length ?? 0;
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectBySearch",
        sourceObjectId: "obj_1",
        sourceVariableId: "POWER",
        targetObjectId: "obj_3",
      },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.edges).toHaveLength(1);
    expect(project.edges[0]?.targetObjectId).toBe("obj_2");
    expect(calc(project, 2).inputs.length).toBe(before);
  });
});

describe("arrangement object", () => {
  it("adds an arrangement with two equipment that have In/Out ports", () => {
    const project = applyAll([{ type: "addArrangement" }]);
    const arrangement = project.objects[1];
    expect(arrangement && isArrangementObject(arrangement)).toBe(true);
    if (!arrangement || !isArrangementObject(arrangement)) return;
    expect(arrangement.domain.equipment.map((item) => [item.id, item.inCount, item.outCount])).toEqual([
      ["EQ_1", 1, 1],
      ["EQ_2", 1, 1],
    ]);
    expect(arrangement.domain.points).toEqual([]);
    expect(applyWorkspaceEdit(project, { type: "addInput", objectId: arrangement.id }, FALLBACK_QUANTITIES).shouldEvaluate).toBe(false);
  });

  it("connects point ends to equipment ports and can change port counts", () => {
    let project = applyAll([{ type: "addArrangement" }]);
    const arrangementId = project.objects[1]!.id;
    project = applyWorkspaceEdit(project, { type: "addPoint", objectId: arrangementId }, FALLBACK_QUANTITIES).project;
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectPointEnd",
        objectId: arrangementId,
        pointId: "PT_1",
        end: "a",
        equipmentId: "EQ_1",
        portId: "OUT_1",
      },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectPointEnd",
        objectId: arrangementId,
        pointId: "PT_1",
        end: "b",
        equipmentId: "EQ_2",
        portId: "IN_1",
      },
      FALLBACK_QUANTITIES,
    ).project;
    let arrangement = project.objects[1];
    expect(arrangement && isArrangementObject(arrangement) && arrangement.domain.points[0]).toMatchObject({
      a: { equipmentId: "EQ_1", portId: "OUT_1" },
      b: { equipmentId: "EQ_2", portId: "IN_1" },
    });

    project = applyWorkspaceEdit(
      project,
      { type: "setEquipmentPorts", objectId: arrangementId, equipmentId: "EQ_1", outCount: 2 },
      FALLBACK_QUANTITIES,
    ).project;
    arrangement = project.objects[1];
    expect(arrangement && isArrangementObject(arrangement) && arrangement.domain.equipment[0]?.outCount).toBe(2);
    expect(arrangement && isArrangementObject(arrangement) && arrangement.domain.points[0]?.a).toEqual({
      equipmentId: "EQ_1",
      portId: "OUT_1",
    });

    project = applyWorkspaceEdit(
      project,
      { type: "setEquipmentPorts", objectId: arrangementId, equipmentId: "EQ_1", outCount: 0 },
      FALLBACK_QUANTITIES,
    ).project;
    arrangement = project.objects[1];
    expect(arrangement && isArrangementObject(arrangement) && arrangement.domain.points[0]?.a).toBeNull();
  });

  it("rejects duplicate point ids and unknown equipment ports", () => {
    let project = applyAll([{ type: "addArrangement" }]);
    const arrangementId = project.objects[1]!.id;
    project = applyWorkspaceEdit(project, { type: "addPoint", objectId: arrangementId }, FALLBACK_QUANTITIES).project;
    const afterDup = applyWorkspaceEdit(
      project,
      { type: "updatePoint", objectId: arrangementId, pointId: "PT_1", patch: { id: "EQ_1" } },
      FALLBACK_QUANTITIES,
    ).project;
    const arrangement = afterDup.objects[1];
    expect(arrangement && isArrangementObject(arrangement) && arrangement.domain.points[0]?.id).toBe("PT_1");

    const afterBad = applyWorkspaceEdit(
      afterDup,
      {
        type: "connectPointEnd",
        objectId: arrangementId,
        pointId: "PT_1",
        end: "a",
        equipmentId: "EQ_1",
        portId: "OUT_9",
      },
      FALLBACK_QUANTITIES,
    ).project;
    const still = afterBad.objects[1];
    expect(still && isArrangementObject(still) && still.domain.points[0]?.a).toBeNull();
  });

  it("keeps domain unchanged when moving the node or an inner element", () => {
    let project = applyAll([{ type: "addArrangement" }]);
    const arrangementId = project.objects[1]!.id;
    const original = project.objects[1];
    if (!original || !isArrangementObject(original)) throw new Error("missing arrangement");
    const domain = structuredClone(original.domain);

    project = {
      ...project,
      objects: project.objects.map((object) =>
        object.id === arrangementId ? { ...object, position: { x: 400, y: 20 } } : object,
      ),
    };
    const movedNode = project.objects[1];
    expect(movedNode && isArrangementObject(movedNode) && movedNode.domain).toEqual(domain);

    project = applyWorkspaceEdit(
      project,
      { type: "moveElement", objectId: arrangementId, elementId: "EQ_1", x: 180, y: 40 },
      FALLBACK_QUANTITIES,
    ).project;
    const movedInner = project.objects[1];
    expect(movedInner && isArrangementObject(movedInner) && movedInner.domain).toEqual(domain);
    expect(movedInner && isArrangementObject(movedInner) && movedInner.view.elements.EQ_1).toMatchObject({
      x: 180,
      y: 40,
    });
  });

  it("connects an arrangement point to a calculation port without evaluating", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "addArrangement" },
    ]);
    const arrangementId = project.objects[1]!.id;
    project = applyWorkspaceEdit(project, { type: "addPoint", objectId: arrangementId }, FALLBACK_QUANTITIES).project;
    const result = applyWorkspaceEdit(
      project,
      {
        type: "connectMapping",
        sourceObjectId: arrangementId,
        sourceVariableId: "PT_1",
        targetObjectId: "obj_1",
        targetVariableId: "IN_1",
        relationType: "association",
      },
      FALLBACK_QUANTITIES,
    );
    expect(result.shouldEvaluate).toBe(false);
    expect(result.project.edges[0]).toMatchObject({
      sourceObjectId: arrangementId,
      sourceVariableId: "PT_1",
      targetObjectId: "obj_1",
      targetVariableId: "IN_1",
      relationType: "association",
    });
    expect(calc(result.project).inputs[0]?.id).toBe("IN_1");
  });
});
