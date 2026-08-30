import { describe, expect, it } from "vitest";
import { applyWorkspaceEdit } from "./projectEdits";
import { blankProject } from "../example/blankProject";
import { FALLBACK_QUANTITIES } from "./quantities";
import type { CalculationObject, ProjectDocument } from "../types/contract";
import { isCalculationObject, isEquipmentObject, isPointObject, isValueFlowEdge } from "./worksheet";

function calc(project: ProjectDocument, index = 0): CalculationObject {
  const object = project.objects[index];
  if (!object || !isCalculationObject(object)) {
    throw new Error(`expected calculation object at ${index}`);
  }
  return object;
}

function applyAll(edits: Parameters<typeof applyWorkspaceEdit>[1][]): ProjectDocument {
  let project = applyWorkspaceEdit(structuredClone(blankProject), { type: "addObject" }, FALLBACK_QUANTITIES).project;
  for (const edit of edits) {
    project = applyWorkspaceEdit(project, edit, FALLBACK_QUANTITIES).project;
  }
  return project;
}

describe("blank workspace", () => {
  it("starts empty so Calculation is added from the library", () => {
    expect(blankProject.objects).toEqual([]);
    expect(blankProject.edges).toEqual([]);
    expect(blankProject.schemaVersion).toBe("0.1");
  });

  it("stores an expanded calculation width on the grid", () => {
    const project = applyAll([{ type: "updateObject", objectId: "obj_1", patch: { width: 500 } }]);
    expect(calc(project).width).toBe(495);
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
    expect(project.objects.filter(isCalculationObject).map((item) => [item.id, item.name])).toEqual([
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

describe("worksheet equipment and points", () => {
  it("adds equipment and points onto the shared worksheet", () => {
    const project = applyAll([{ type: "addEquipment" }, { type: "addEquipment" }, { type: "addPoint" }]);
    expect(project.objects.filter(isEquipmentObject).map((item) => [item.id, item.inCount, item.outCount])).toEqual([
      ["EQ_1", 1, 1],
      ["EQ_2", 1, 1],
    ]);
    const pump = applyWorkspaceEdit(
      project,
      { type: "addEquipment", symbolId: "pump" },
      FALLBACK_QUANTITIES,
    ).project.objects.filter(isEquipmentObject).at(-1);
    expect(pump).toMatchObject({ symbolId: "pump", inCount: 1, outCount: 1 });
    expect(project.objects.filter(isPointObject).map((item) => [item.id, item.connectionCount])).toEqual([["PT_1", 4]]);
    expect(applyWorkspaceEdit(project, { type: "addInput", objectId: "EQ_1" }, FALLBACK_QUANTITIES).shouldEvaluate).toBe(false);
  });

  it("connects point ends to equipment ports and can change port counts", () => {
    let project = applyAll([{ type: "addEquipment" }, { type: "addEquipment" }, { type: "addPoint" }]);
    project = applyWorkspaceEdit(
      project,
      { type: "connectPointEnd", pointId: "PT_1", end: "C_1", targetObjectId: "EQ_1", targetPortId: "OUT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      { type: "connectPointEnd", pointId: "PT_1", end: "C_2", targetObjectId: "EQ_2", targetPortId: "IN_1" },
      FALLBACK_QUANTITIES,
    ).project;
    const point = project.objects.find(isPointObject);
    expect(point).toMatchObject({
      connectionCount: 4,
      connections: [
        { objectId: "EQ_1", portId: "OUT_1", reversed: false },
        { objectId: "EQ_2", portId: "IN_1", reversed: false },
        null,
        null,
      ],
    });

    project = applyWorkspaceEdit(
      project,
      { type: "setEquipmentPorts", objectId: "EQ_1", outCount: 2 },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.filter(isEquipmentObject).find((item) => item.id === "EQ_1")?.outCount).toBe(2);
    expect(project.objects.find(isPointObject)?.connections[0]).toEqual({
      objectId: "EQ_1",
      portId: "OUT_1",
      reversed: false,
    });

    project = applyWorkspaceEdit(
      project,
      { type: "setEquipmentPorts", objectId: "EQ_1", outCount: 0 },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.find(isPointObject)?.connections[0]).toBeNull();
  });

  it("keeps a point at west, east, south, and north ends", () => {
    let project = applyAll([{ type: "addEquipment" }, { type: "addPoint" }]);
    project = applyWorkspaceEdit(
      project,
      { type: "updatePoint", objectId: "PT_1", patch: { connectionCount: 2 } },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      { type: "connectPointEnd", pointId: "PT_1", end: "C_3", targetObjectId: "EQ_1", targetPortId: "OUT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    const point = project.objects.find(isPointObject);
    expect(point?.connectionCount).toBe(4);
    expect(point?.connections).toHaveLength(4);
    expect(point?.connections[2]).toEqual({ objectId: "EQ_1", portId: "OUT_1", reversed: false });
    project = applyWorkspaceEdit(
      project,
      { type: "connectPointEnd", pointId: "PT_1", end: "C_4", targetObjectId: "EQ_1", targetPortId: "OUT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.find(isPointObject)?.connections[3]).toEqual({
      objectId: "EQ_1",
      portId: "OUT_1",
      reversed: false,
    });
  });

  it("rejects duplicate point ids and unknown equipment ports", () => {
    let project = applyAll([{ type: "addEquipment" }, { type: "addPoint" }]);
    const afterDup = applyWorkspaceEdit(
      project,
      { type: "updatePoint", objectId: "PT_1", patch: { id: "EQ_1" } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(afterDup.objects.find(isPointObject)?.id).toBe("PT_1");

    const afterBad = applyWorkspaceEdit(
      afterDup,
      { type: "connectPointEnd", pointId: "PT_1", end: "C_1", targetObjectId: "EQ_1", targetPortId: "OUT_9" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(afterBad.objects.find(isPointObject)?.connections[0]).toBeNull();
  });

  it("keeps connections unchanged when moving a worksheet node", () => {
    let project = applyAll([{ type: "addEquipment" }, { type: "addPoint" }]);
    project = applyWorkspaceEdit(
      project,
      { type: "connectPointEnd", pointId: "PT_1", end: "C_1", targetObjectId: "EQ_1", targetPortId: "OUT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    const connections = structuredClone(project.objects.find(isPointObject)?.connections);
    project = {
      ...project,
      objects: project.objects.map((object) =>
        object.id === "EQ_1" ? { ...object, position: { x: 400, y: 20 } } : object,
      ),
    };
    expect(project.objects.find(isPointObject)?.connections).toEqual(connections);
  });

  it("explodes a legacy arrangement object onto the worksheet", () => {
    const raw = {
      ...blankProject,
      objects: [
        ...blankProject.objects,
        {
          kind: "arrangement",
          id: "arr_1",
          name: "Arrangement 1",
          position: { x: 10, y: 20 },
          domain: {
            equipment: [{ id: "EQ_1", name: "Pump A", symbolId: "generic-equipment", inCount: 1, outCount: 1 }],
            points: [
              {
                id: "PT_1",
                name: "PT_1",
                a: { equipmentId: "EQ_1", portId: "OUT_1" },
                b: null,
              },
            ],
          },
          view: {
            width: 720,
            height: 400,
            elements: {
              EQ_1: { x: 48, y: 80, width: 112, height: 72 },
              PT_1: { x: 180, y: 102, width: 88, height: 28 },
            },
          },
        },
      ],
    } as never;
    const project = applyWorkspaceEdit(blankProject, { type: "loadProject", project: raw }, FALLBACK_QUANTITIES).project;
    expect(project.objects.find((item) => item.id === "arr_1")).toBeUndefined();
    expect(project.objects.find((item) => item.id === "EQ_1")).toMatchObject({
      kind: "equipment",
      position: { x: 58, y: 100 },
    });
    expect(project.objects.find((item) => item.id === "PT_1")).toMatchObject({
      kind: "point",
      connectionCount: 4,
      connections: [{ objectId: "EQ_1", portId: "OUT_1", reversed: false }, null, null, null],
      position: { x: 190, y: 122 },
    });
  });

  it("connects a worksheet point to a calculation port without evaluating", () => {
    let project = applyAll([{ type: "addInput", objectId: "obj_1" }, { type: "addPoint" }]);
    const result = applyWorkspaceEdit(
      project,
      {
        type: "connectMapping",
        sourceObjectId: "PT_1",
        sourceVariableId: "PT_1",
        targetObjectId: "obj_1",
        targetVariableId: "IN_1",
        relationType: "association",
      },
      FALLBACK_QUANTITIES,
    );
    expect(result.shouldEvaluate).toBe(false);
    expect(result.project.edges[0]).toMatchObject({
      sourceObjectId: "PT_1",
      sourceVariableId: "PT_1",
      targetObjectId: "obj_1",
      targetVariableId: "IN_1",
      relationType: "association",
    });
    expect(calc(result.project).inputs[0]?.id).toBe("IN_1");
  });

  it("connects points to each other and toggles direction", () => {
    let project = applyAll([{ type: "addPoint" }, { type: "addPoint" }]);
    project = applyWorkspaceEdit(
      project,
      {
        type: "connectPointEnd",
        pointId: "PT_1",
        end: "C_1",
        targetObjectId: "PT_2",
        targetPortId: "C_2",
      },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.find((item) => item.id === "PT_1")).toMatchObject({
      connections: [{ objectId: "PT_2", portId: "C_2", reversed: false }, null, null, null],
    });

    project = applyWorkspaceEdit(project, { type: "togglePointLink", pointId: "PT_1", end: "C_1" }, FALLBACK_QUANTITIES)
      .project;
    expect(project.objects.find(isPointObject)?.connections[0]).toMatchObject({
      objectId: "PT_2",
      portId: "C_2",
      reversed: true,
    });
  });

  it("rejects a loop inside the same point", () => {
    const project = applyAll([
      { type: "addPoint" },
      {
        type: "connectPointEnd",
        pointId: "PT_1",
        end: "C_1",
        targetObjectId: "PT_1",
        targetPortId: "C_2",
      },
    ]);
    expect(project.objects.find(isPointObject)?.connections).toEqual([null, null, null, null]);
  });

  it("adds a dashed calculation link to a point or equipment object", () => {
    let project = applyAll([{ type: "addPoint" }, { type: "addEquipment" }, { type: "addLink", objectId: "obj_1" }]);
    expect(calc(project).links?.[0]).toMatchObject({ id: "LINK_1", targetObjectId: null });
    project = applyWorkspaceEdit(
      project,
      { type: "connectLink", objectId: "obj_1", linkId: "LINK_1", targetObjectId: "PT_1", targetPortId: "C_1" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(project).links?.[0]).toMatchObject({
      id: "LINK_1",
      targetObjectId: "PT_1",
      targetPortId: "OBJ",
    });
    expect(project.edges[0]).toMatchObject({
      sourceObjectId: "obj_1",
      sourceVariableId: "LINK_1",
      targetObjectId: "PT_1",
      targetVariableId: "OBJ",
      relationType: "association",
    });

    project = applyWorkspaceEdit(
      project,
      { type: "connectLink", objectId: "obj_1", linkId: "LINK_1", targetObjectId: "EQ_1", targetPortId: "IN_1" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(project).links?.[0]).toMatchObject({ targetObjectId: "EQ_1", targetPortId: "OBJ" });
    expect(project.edges).toHaveLength(1);
    expect(project.edges[0]?.targetObjectId).toBe("EQ_1");
    expect(project.edges[0]?.targetVariableId).toBe("OBJ");
  });

  it("lets one calculation yellow-link many equipment but keeps one link per layout object", () => {
    let project = applyAll([{ type: "addPoint" }, { type: "addEquipment" }, { type: "addEquipment" }, { type: "addObject" }]);
    project = applyWorkspaceEdit(
      project,
      { type: "connectLink", objectId: "obj_1", targetObjectId: "PT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(project).links).toHaveLength(1);

    const afterSecond = applyWorkspaceEdit(
      project,
      { type: "connectLink", objectId: "obj_1", targetObjectId: "EQ_1" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(afterSecond).links).toHaveLength(2);
    expect(calc(afterSecond).links?.map((link) => link.targetObjectId)).toEqual(["PT_1", "EQ_1"]);
    expect(afterSecond.edges).toHaveLength(2);

    const afterSameLayout = applyWorkspaceEdit(
      afterSecond,
      { type: "connectLink", objectId: "obj_1", targetObjectId: "EQ_1" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(afterSameLayout).links).toHaveLength(2);
    expect(afterSameLayout.edges).toHaveLength(2);

    const afterOtherCalc = applyWorkspaceEdit(
      afterSameLayout,
      { type: "connectLink", objectId: "obj_2", targetObjectId: "PT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    const other = afterOtherCalc.objects.find((item) => item.id === "obj_2");
    expect(other && isCalculationObject(other) ? other.links ?? [] : undefined).toEqual([]);
    expect(afterOtherCalc.edges).toHaveLength(2);
  });

  it("moves the yellow object-link handle between top and bottom", () => {
    let project = applyAll([{ type: "addPoint" }]);
    expect(calc(project).objectLinkSide).toBeUndefined();
    project = applyWorkspaceEdit(
      project,
      { type: "setObjectLinkSide", objectId: "obj_1", side: "bottom" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(calc(project).objectLinkSide).toBe("bottom");
    project = applyWorkspaceEdit(
      project,
      { type: "setObjectLinkSide", objectId: "PT_1", side: "bottom" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.find(isPointObject)?.objectLinkSide).toBe("bottom");
  });

  it("connects equipment to equipment and equipment to a point", () => {
    let project = applyAll([{ type: "addEquipment" }, { type: "addEquipment" }, { type: "addPoint" }]);
    project = applyWorkspaceEdit(
      project,
      { type: "connectArrangement", sourceObjectId: "EQ_1", targetObjectId: "EQ_2" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.edges.some((edge) => edge.relationType === "pipe" && edge.sourceObjectId === "EQ_1" && edge.targetObjectId === "EQ_2")).toBe(true);
    expect(project.edges.find((edge) => edge.relationType === "pipe")?.sourceVariableId).toBe("OUT_1");
    expect(project.edges.find((edge) => edge.relationType === "pipe")?.targetVariableId).toBe("IN_1");
    project = applyWorkspaceEdit(
      project,
      { type: "connectArrangement", sourceObjectId: "EQ_1", targetObjectId: "PT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.find(isPointObject)?.connections.some((end) => end?.objectId === "EQ_1")).toBe(true);
  });

  it("rotates and retags equipment without dropping old JSON fields", () => {
    let project = applyAll([{ type: "addEquipment", symbolId: "pump" }]);
    const equipment = project.objects.find(isEquipmentObject);
    expect(equipment?.symbolId).toBe("pump");
    project = applyWorkspaceEdit(
      project,
      { type: "updateEquipment", objectId: "EQ_1", patch: { tag: "P-101", rotation: 90 } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.find(isEquipmentObject)).toMatchObject({
      id: "EQ_1",
      tag: "P-101",
      rotation: 90,
      symbolId: "pump",
    });
    project = applyWorkspaceEdit(project, { type: "rotateEquipment", objectIds: ["EQ_1"], delta: 90 }, FALLBACK_QUANTITIES).project;
    expect(project.objects.find(isEquipmentObject)?.rotation).toBe(180);
  });

  it("keeps pipe/signal metadata on a point end and duplicates layout objects", () => {
    let project = applyAll([{ type: "addEquipment" }, { type: "addPoint" }]);
    project = applyWorkspaceEdit(
      project,
      { type: "connectPointEnd", pointId: "PT_1", end: "C_1", targetObjectId: "EQ_1", targetPortId: "OUT_1" },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      { type: "updatePointEnd", pointId: "PT_1", end: "C_1", patch: { linkKind: "signal", showArrow: true } },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.objects.find(isPointObject)?.connections[0]).toMatchObject({
      objectId: "EQ_1",
      portId: "OUT_1",
      linkKind: "signal",
      showArrow: true,
    });
    project = applyWorkspaceEdit(project, { type: "duplicateObjects", objectIds: ["EQ_1", "PT_1"] }, FALLBACK_QUANTITIES).project;
    expect(project.objects.filter(isEquipmentObject).map((item) => item.id)).toEqual(["EQ_1", "EQ_2"]);
    expect(project.objects.filter(isPointObject).map((item) => item.id)).toEqual(["PT_1", "PT_2"]);
    const copy = project.objects.find((item) => item.id === "PT_2");
    expect(copy && isPointObject(copy) ? copy.connections[0] : null).toMatchObject({
      objectId: "EQ_2",
      portId: "OUT_1",
      linkKind: "signal",
    });
  });

  it("copies calculation objects with unique variables and cloned edges", () => {
    let project = applyAll([
      { type: "addInput", objectId: "obj_1" },
      { type: "updateInput", objectId: "obj_1", index: 0, patch: { id: "FLOW", value: 10 } },
      { type: "addCalculation", objectId: "obj_1" },
      { type: "updateCalculation", objectId: "obj_1", index: 0, patch: { id: "POWER", formula: "FLOW * 2" } },
      { type: "addObject" },
      { type: "addInput", objectId: "obj_2" },
      {
        type: "connectMapping",
        sourceObjectId: "obj_1",
        sourceVariableId: "POWER",
        targetObjectId: "obj_2",
        targetVariableId: "IN_1",
      },
      { type: "addEquipment" },
      { type: "connectLink", objectId: "obj_1", targetObjectId: "EQ_1" },
    ]);
    project = applyWorkspaceEdit(
      project,
      { type: "duplicateObjects", objectIds: ["obj_1", "obj_2", "EQ_1"] },
      FALLBACK_QUANTITIES,
    ).project;
    const calcs = project.objects.filter(isCalculationObject);
    expect(calcs.map((item) => item.id)).toEqual(["obj_1", "obj_2", "obj_3", "obj_4"]);
    const original = calcs.find((item) => item.id === "obj_1");
    const cloned = calcs.find((item) => item.id === "obj_3");
    expect(cloned?.inputs[0]?.id).toBe("FLOW_1");
    expect(cloned?.calculations[0]).toMatchObject({ id: "POWER_1", formula: "FLOW_1 * 2" });
    expect(cloned?.inputs[0]?.id).not.toBe(original?.inputs[0]?.id);
    expect(project.objects.filter(isEquipmentObject).map((item) => item.id)).toEqual(["EQ_1", "EQ_2"]);
    expect(cloned?.links?.[0]).toMatchObject({ targetObjectId: "EQ_2", targetPortId: "OBJ" });
    expect(
      project.edges.some(
        (edge) =>
          edge.relationType === "association" &&
          edge.sourceObjectId === "obj_3" &&
          edge.targetObjectId === "EQ_2",
      ),
    ).toBe(true);
    expect(
      project.edges.some(
        (edge) =>
          edge.sourceObjectId === "obj_1" &&
          edge.targetObjectId === "EQ_1" &&
          edge.relationType === "association",
      ),
    ).toBe(true);
    expect(
      project.edges.some(
        (edge) =>
          isValueFlowEdge(edge) &&
          edge.sourceObjectId === "obj_3" &&
          edge.sourceVariableId === "POWER_1" &&
          edge.targetObjectId === "obj_4",
      ),
    ).toBe(true);
  });

  it("deletes a yellow object link", () => {
    let project = applyAll([{ type: "addPoint" }, { type: "connectLink", objectId: "obj_1", targetObjectId: "PT_1" }]);
    const edgeId = project.edges[0]?.id;
    expect(edgeId).toBeTruthy();
    project = applyWorkspaceEdit(project, { type: "deleteEdges", edgeIds: [edgeId!] }, FALLBACK_QUANTITIES).project;
    expect(project.edges).toHaveLength(0);
    expect(calc(project).links?.[0]?.targetObjectId).toBeNull();
  });
});

describe("user symbol library", () => {
  it("creates, updates, and deletes library symbols", () => {
    let project = applyAll([{ type: "addLibrarySymbol" }]);
    expect(project.symbolLibrary?.at(-1)).toMatchObject({ id: "sym_1", kind: "equipment" });
    project = applyWorkspaceEdit(
      project,
      { type: "addEquipment", symbolId: "pump" },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      {
        type: "updateLibrarySymbol",
        symbolId: "pump",
        patch: { name: "Main Pump", drawing: { width: 88, height: 66, primitives: [] } },
      },
      FALLBACK_QUANTITIES,
    ).project;
    expect(project.symbolLibrary?.find((item) => item.id === "pump")?.name).toBe("Main Pump");
    expect(project.objects.find(isEquipmentObject)?.drawing?.primitives).toEqual([]);
    project = applyWorkspaceEdit(project, { type: "deleteLibrarySymbol", symbolId: "valve" }, FALLBACK_QUANTITIES).project;
    expect(project.symbolLibrary?.map((item) => item.id)).toEqual(["pump", "vessel", "sym_1"]);
  });

  it("reorders library symbols and assigns a category", () => {
    let project = applyAll([
      { type: "addLibraryCategory", path: "Rotating" },
      { type: "moveLibrarySymbol", symbolId: "pump", direction: 1 },
      { type: "updateLibrarySymbol", symbolId: "pump", patch: { category: "Rotating" } },
    ]);
    expect(project.symbolCategories).toEqual(["Rotating"]);
    expect(project.symbolLibrary?.map((item) => item.id)).toEqual(["valve", "pump", "vessel"]);
    expect(project.symbolLibrary?.find((item) => item.id === "pump")?.category).toBe("Rotating");
  });

  it("deletes a library folder and returns symbols to the parent", () => {
    let project = applyAll([
      { type: "addLibraryCategory", path: "Rotating" },
      { type: "updateLibrarySymbol", symbolId: "pump", patch: { category: "Rotating" } },
      { type: "deleteLibraryCategory", path: "Rotating" },
    ]);
    expect(project.symbolCategories).toEqual([]);
    expect(project.symbolLibrary?.find((item) => item.id === "pump")?.category).toBeUndefined();
  });
});

describe("v0.1 worksheet edits", () => {
  it("deletes several objects in one edit", () => {
    const project = applyAll([{ type: "addObject" }, { type: "addMemo" }, { type: "addPoint" }]);
    const ids = project.objects.map((item) => item.id);
    expect(ids.length).toBeGreaterThan(2);
    const next = applyWorkspaceEdit(project, { type: "deleteObjects", objectIds: ids }, FALLBACK_QUANTITIES).project;
    expect(next.objects).toEqual([]);
    expect(next.edges).toEqual([]);
  });

  it("rewrites memo link targets when an object id changes", () => {
    let project = applyAll([{ type: "addMemo" }]);
    const memoId = project.objects.find((item) => item.kind === "memo")!.id;
    project = applyWorkspaceEdit(
      project,
      { type: "connectMemoLink", memoId, targetObjectId: "obj_1" },
      FALLBACK_QUANTITIES,
    ).project;
    project = applyWorkspaceEdit(
      project,
      { type: "updateObject", objectId: "obj_1", patch: { id: "calc_a" } },
      FALLBACK_QUANTITIES,
    ).project;
    const memo = project.objects.find((item) => item.kind === "memo");
    expect(memo && "links" in memo ? memo.links[0]?.targetObjectId : null).toBe("calc_a");
  });

  it("loads JSON that has no schemaVersion", () => {
    const raw = {
      id: "old",
      name: "old",
      objects: [
        {
          id: "obj_1",
          name: "Object 1",
          position: { x: 0, y: 0 },
          inputs: [],
          calculations: [],
          outputs: [],
        },
      ],
      edges: [],
    };
    const project = applyWorkspaceEdit(blankProject, { type: "loadProject", project: raw as never }, FALLBACK_QUANTITIES)
      .project;
    expect(project.schemaVersion).toBe("0.1");
    expect(project.objects.map((item) => item.id)).toEqual(["obj_1"]);
  });
});

