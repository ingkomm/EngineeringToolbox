import { describe, expect, it } from "vitest";
import { searchSourcePorts, searchTargetPorts } from "./objectSearch";
import type { ProjectDocument } from "../types/contract";

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

describe("connector object search", () => {
  it("finds other objects by id or name and lists free inputs", () => {
    const byName = searchTargetPorts(project, "sink", "obj_a");
    expect(byName).toHaveLength(1);
    expect(byName[0]).toMatchObject({ objectId: "obj_b", variableId: "IN_1" });
    expect(byName[0]?.createInput).toBeUndefined();
    const byId = searchTargetPorts(project, "obj_c", "obj_a");
    expect(byId).toHaveLength(1);
    expect(byId[0]).toMatchObject({ objectId: "obj_c", createInput: true, variableName: "새 Input으로 연결" });
  });

  it("lists source output ports on matching objects", () => {
    const hits = searchSourcePorts(project, "heat", "obj_b");
    expect(hits).toEqual([
      expect.objectContaining({ objectId: "obj_a", objectName: "Heater", variableId: "POWER" }),
    ]);
  });
});
