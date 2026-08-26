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
      { type: "addOutput", objectId: "obj_1" },
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
    expect(object?.outputs).toEqual([{ id: "POWER", sourceVariableId: "POWER" }]);
  });

  it("adds a second object without copying calculated results", () => {
    const project = applyAll([{ type: "addObject" }]);
    expect(project.objects.map((item) => item.id)).toEqual(["obj_1", "obj_2"]);
    expect(project.objects[1]?.inputs).toEqual([]);
    expect(project.objects[1]?.calculations).toEqual([]);
  });
});
