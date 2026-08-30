import { describe, expect, it } from "vitest";
import { searchLayoutTargets, searchSourcePorts, searchTargetPorts } from "./objectSearch";
import type { CalculationObject, ProjectDocument } from "../types/contract";
import { isCalculationObject } from "../shared/worksheet";

function calc(object: ProjectDocument["objects"][number]): CalculationObject {
  if (!isCalculationObject(object)) throw new Error("expected calculation object");
  return object;
}

const project: ProjectDocument = {
  id: "ws",
  name: "ws",
  objects: [
    {
      id: "obj_a",
      name: "Heater",
      position: { x: 0, y: 0 },
      inputs: [{ id: "PIN", name: "PIN", value: 1 }],
      calculations: [{ id: "POWER", name: "POWER", formula: "PIN" }],
      outputs: [{ id: "POWER", name: "POWER", sourceVariableId: "POWER" }],
    },
    {
      id: "obj_b",
      name: "Sink",
      position: { x: 1, y: 0 },
      inputs: [{ id: "IN_1", name: "IN_1", value: null }],
      calculations: [],
      outputs: [{ id: "IN_1", name: "IN_1", sourceVariableId: "IN_1" }],
    },
    {
      id: "obj_c",
      name: "Empty",
      position: { x: 2, y: 0 },
      inputs: [],
      calculations: [],
      outputs: [],
    },
  ],
  edges: [],
};

const linked: ProjectDocument = {
  ...project,
  objects: [
    calc(project.objects[0]!),
    {
      ...calc(project.objects[1]!),
      inputs: [{ id: "POWER", name: "POWER", value: null }],
      outputs: [{ id: "POWER", name: "POWER", sourceVariableId: "POWER" }],
    },
    calc(project.objects[2]!),
  ],
  edges: [
    {
      id: "edge-obj_a-POWER-obj_b-POWER",
      sourceObjectId: "obj_a",
      sourceVariableId: "POWER",
      targetObjectId: "obj_b",
      targetVariableId: "POWER",
      enabled: true,
      collapsed: false,
    },
  ],
};

describe("connector object search", () => {
  it("finds other objects by id or name and lists free inputs", () => {
    const byName = searchTargetPorts(project, "sink", "obj_a", "POWER");
    expect(byName).toHaveLength(1);
    expect(byName[0]).toMatchObject({ objectId: "obj_b", variableId: "IN_1", status: "available" });
    expect(byName[0]?.createInput).toBeUndefined();
    const byId = searchTargetPorts(project, "obj_c", "obj_a", "POWER");
    expect(byId).toHaveLength(1);
    expect(byId[0]).toMatchObject({
      objectId: "obj_c",
      createInput: true,
      variableName: "새 Input으로 연결",
      status: "create",
    });
  });

  it("lists source output ports on matching objects", () => {
    const hits = searchSourcePorts(project, "heat", "obj_b", "IN_1");
    expect(hits).toEqual([
      expect.objectContaining({ objectId: "obj_a", objectName: "Heater", variableId: "POWER", status: "available" }),
    ]);
  });

  it("marks the current link as connected and exposes the edge id for disconnect", () => {
    const fromOutput = searchTargetPorts(linked, "sink", "obj_a", "POWER");
    expect(fromOutput).toEqual([
      expect.objectContaining({
        objectId: "obj_b",
        variableId: "POWER",
        status: "connected",
        edgeId: "edge-obj_a-POWER-obj_b-POWER",
      }),
    ]);
    const fromInput = searchSourcePorts(linked, "heat", "obj_b", "POWER");
    expect(fromInput).toEqual([
      expect.objectContaining({
        objectId: "obj_a",
        variableId: "POWER",
        status: "connected",
        edgeId: "edge-obj_a-POWER-obj_b-POWER",
      }),
    ]);
  });

  it("marks another object's occupied input as in use without a disconnect edge", () => {
    const hits = searchTargetPorts(linked, "sink", "obj_c", "IN_1");
    expect(hits).toEqual([
      expect.objectContaining({ objectId: "obj_b", variableId: "POWER", status: "occupied", edgeId: undefined }),
      expect.objectContaining({ objectId: "obj_b", createInput: true, status: "create" }),
    ]);
  });

  it("does not offer another input for an output that is already mapped", () => {
    const withFree = {
      ...linked,
      objects: [
        linked.objects[0]!,
        {
          ...linked.objects[1]!,
          inputs: [
            { id: "POWER", name: "POWER", value: null },
            { id: "IN_2", name: "IN_2", value: null },
          ],
        },
        {
          ...linked.objects[2]!,
          inputs: [{ id: "IN_3", name: "IN_3", value: null }],
          outputs: [{ id: "IN_3", name: "IN_3", sourceVariableId: "IN_3" }],
        },
      ],
    };
    const fromOutput = searchTargetPorts(withFree, "", "obj_a", "POWER");
    expect(fromOutput).toEqual([
      expect.objectContaining({ objectId: "obj_b", variableId: "POWER", status: "connected" }),
      expect.objectContaining({ objectId: "obj_b", variableId: "IN_2", status: "occupied" }),
      expect.objectContaining({ objectId: "obj_c", variableId: "IN_3", status: "occupied" }),
    ]);
    const fromOtherInput = searchSourcePorts(withFree, "heat", "obj_c", "IN_3");
    expect(fromOtherInput).toEqual([
      expect.objectContaining({ objectId: "obj_a", variableId: "POWER", status: "occupied" }),
    ]);
  });

  it("lists point and equipment ports for a calculation link", () => {
    const withLayout: ProjectDocument = {
      ...project,
      objects: [
        {
          ...calc(project.objects[0]!),
          links: [{ id: "LINK_1", name: "LINK_1", targetObjectId: "PT_1", targetPortId: "C_1" }],
        },
        {
          kind: "point",
          id: "PT_1",
          name: "Suction",
          position: { x: 0, y: 1 },
          connectionCount: 3,
          connections: [null, null],
        },
        {
          kind: "equipment",
          id: "EQ_1",
          name: "Pump A",
          position: { x: 1, y: 1 },
          symbolId: "generic-equipment",
          inCount: 1,
          outCount: 1,
        },
      ],
      edges: [
        {
          id: "edge-obj_a-LINK_1-PT_1-C_1",
          sourceObjectId: "obj_a",
          sourceVariableId: "LINK_1",
          targetObjectId: "PT_1",
          targetVariableId: "C_1",
          enabled: true,
          relationType: "association",
        },
      ],
    };
    const hits = searchLayoutTargets(withLayout, "suction", "obj_a", "LINK_1");
    expect(hits).toEqual([
      expect.objectContaining({ objectId: "PT_1", variableId: "OBJ", status: "connected", kind: "point" }),
    ]);
    const equipmentHits = searchLayoutTargets(withLayout, "EQ_1", "obj_a", "LINK_1");
    expect(equipmentHits).toEqual([
      expect.objectContaining({ objectId: "EQ_1", variableId: "OBJ", kind: "equipment", status: "available" }),
    ]);
  });
});
