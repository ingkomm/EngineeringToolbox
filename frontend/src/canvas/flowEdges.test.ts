import { describe, expect, it } from "vitest";
import { mergeFlowNodes, toFlowEdges } from "./flowModel";

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

describe("mergeFlowNodes", () => {
  it("keeps the existing node instance fields while updating data", () => {
    const current = [
      {
        id: "obj_1",
        type: "calculationObject" as const,
        position: { x: 10, y: 20 },
        dragging: true,
        selected: true,
        data: { label: "old" },
      },
    ];
    const merged = mergeFlowNodes(current, [
      {
        id: "obj_1",
        type: "calculationObject" as const,
        position: { x: 99, y: 99 },
        data: { label: "new" },
      },
    ]);
    expect(merged[0]?.position).toEqual({ x: 10, y: 20 });
    expect(merged[0]?.selected).toBe(true);
    expect(merged[0]?.data).toEqual({ label: "new" });
  });

  it("applies project positions when the node is not being dragged", () => {
    const merged = mergeFlowNodes(
      [{ id: "obj_1", position: { x: 1, y: 1 }, data: { label: "old" } }],
      [{ id: "obj_1", position: { x: 8, y: 9 }, data: { label: "new" } }],
    );
    expect(merged[0]?.position).toEqual({ x: 8, y: 9 });
  });
});
