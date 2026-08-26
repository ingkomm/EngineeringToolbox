import { describe, expect, it } from "vitest";
import { toFlowEdges } from "./flowModel";

describe("React Flow edge mapping", () => {
  it("binds output handle out:POWER to input handle in:INPUT_POWER", () => {
    const edges = toFlowEdges([
      {
        id: "edge-obj_1-POWER-obj_2-INPUT_POWER",
        sourceObjectId: "obj_1",
        sourceVariableId: "POWER",
        targetObjectId: "obj_2",
        targetVariableId: "INPUT_POWER",
      },
    ]);
    expect(edges).toEqual([
      expect.objectContaining({
        source: "obj_1",
        target: "obj_2",
        sourceHandle: "out:POWER",
        targetHandle: "in:INPUT_POWER",
        type: "smoothstep",
      }),
    ]);
  });
});
