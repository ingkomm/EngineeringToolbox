import { describe, expect, it } from "vitest";
import { mergeFlowNodes, toFlowEdges, toFlowNodeRecords } from "./flowModel";
import type { ProjectDocument } from "../types/contract";

const project: ProjectDocument = {
  id: "ws",
  name: "ws",
  objects: [
    {
      id: "obj_1",
      name: "Object 1",
      position: { x: 0, y: 0 },
      inputs: [],
      calculations: [],
      outputs: [{ id: "POWER", name: "POWER", sourceVariableId: "POWER" }],
    },
    {
      id: "obj_2",
      name: "Object 2",
      position: { x: 1, y: 0 },
      inputs: [{ id: "POWER", name: "POWER", value: null }],
      calculations: [],
      outputs: [],
    },
  ],
  edges: [
    {
      id: "edge-obj_1-POWER-obj_2-POWER",
      sourceObjectId: "obj_1",
      sourceVariableId: "POWER",
      targetObjectId: "obj_2",
      targetVariableId: "POWER",
      enabled: true,
      collapsed: false,
    },
  ],
};

describe("React Flow edge mapping", () => {
  it("binds output handle out:POWER to input handle in:POWER", () => {
    const edges = toFlowEdges(project, () => undefined, () => undefined);
    expect(edges).toEqual([
      expect.objectContaining({
        source: "obj_1",
        target: "obj_2",
        sourceHandle: "out:POWER",
        targetHandle: "in:POWER",
        type: "mapping",
        data: expect.objectContaining({
          enabled: true,
          collapsed: false,
          targetObjectId: "obj_2",
          targetObjectName: "Object 2",
        }),
      }),
    ]);
  });

  it("hides interaction on collapsed links", () => {
    const collapsed = {
      ...project,
      edges: [{ ...project.edges[0]!, collapsed: true }],
    };
    const edges = toFlowEdges(collapsed, () => undefined, () => undefined);
    expect(edges[0]?.interactionWidth).toBe(0);
    expect(edges[0]?.data).toEqual(expect.objectContaining({ collapsed: true }));
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

  it("keeps an expanded calculation wrapper width when the project record has none", () => {
    const merged = mergeFlowNodes(
      [{ id: "obj_1", position: { x: 0, y: 0 }, width: 759, style: { width: 759 }, data: { label: "old" } }],
      [{ id: "obj_1", position: { x: 0, y: 0 }, data: { label: "new" } }],
    );
    expect(merged[0]?.width).toBe(759);
    expect(merged[0]?.style).toEqual({ width: 759 });
  });
});

describe("arrangement and association edges", () => {
  it("draws a directed point link and a dashed calculation association", () => {
    const layout: ProjectDocument = {
      id: "ws",
      name: "ws",
      objects: [
        {
          id: "obj_1",
          name: "Object 1",
          position: { x: 0, y: 0 },
          inputs: [],
          calculations: [],
          outputs: [],
          links: [{ id: "LINK_1", name: "LINK_1", targetObjectId: "PT_2", targetPortId: "OBJ" }],
        },
        {
          kind: "point",
          id: "PT_1",
          name: "PT_1",
          position: { x: 1, y: 0 },
          connectionCount: 3,
          connections: [{ objectId: "PT_2", portId: "C_2", reversed: false }, null, null],
        },
        {
          kind: "point",
          id: "PT_2",
          name: "PT_2",
          position: { x: 2, y: 0 },
          connectionCount: 3,
          connections: [null, null, null],
        },
      ],
      edges: [
        {
          id: "edge-obj_1-LINK_1-PT_2-OBJ",
          sourceObjectId: "obj_1",
          sourceVariableId: "LINK_1",
          targetObjectId: "PT_2",
          targetVariableId: "OBJ",
          enabled: true,
          relationType: "association",
        },
      ],
    };
    const edges = toFlowEdges(layout, () => undefined, () => undefined, () => undefined);
    expect(edges.find((item) => item.id === "edge-obj_1-LINK_1-PT_2-OBJ")).toMatchObject({
      sourceHandle: "OBJ",
      targetHandle: "OBJ",
      className: expect.stringContaining("mapping-edge--association"),
    });
    expect(edges.find((item) => item.id === "arrlink:PT_1:C_1")).toMatchObject({
      source: "PT_1",
      target: "PT_2",
      sourceHandle: "C_1",
      targetHandle: "C_2",
      type: "arrangementLink",
      data: expect.objectContaining({ reversed: false, pointId: "PT_1", end: "C_1" }),
    });
  });
});

describe("layout node origin", () => {
  it("places equipment and point nodes by their visual center", () => {
    const layout: ProjectDocument = {
      id: "ws",
      name: "ws",
      objects: [
        {
          kind: "point",
          id: "PT_1",
          name: "PT_1",
          position: { x: 110, y: 88 },
          connectionCount: 3,
          connections: [null, null, null],
        },
        {
          kind: "equipment",
          id: "EQ_1",
          name: "Pump",
          position: { x: 220, y: 88 },
          symbolId: "pump",
          inCount: 1,
          outCount: 1,
          width: 66,
          height: 66,
        },
      ],
      edges: [],
    };
    const nodes = toFlowNodeRecords(layout, [], () => undefined);
    const point = nodes.find((item) => item.id === "PT_1");
    const equipment = nodes.find((item) => item.id === "EQ_1");
    expect(point).toMatchObject({
      origin: [0.5, 0.5],
      position: { x: 128, y: 106 },
    });
    expect(equipment?.origin).toEqual([0.5, 0.5]);
    expect(equipment?.position).toEqual({
      x: 220 + (equipment?.width ?? 0) / 2,
      y: 88 + (equipment?.height ?? 0) / 2,
    });
  });
});

describe("memo visual links", () => {
  it("draws a memo link from the right-edge MEMO handle to the target OBJ handle", () => {
    const withMemo: ProjectDocument = {
      ...project,
      objects: [
        ...project.objects,
        {
          kind: "memo",
          id: "m_1",
          title: "Note",
          sections: [
            { id: "s1", type: "text", content: "**bold**" },
            { id: "s2", type: "table", cells: [["a"]] },
          ],
          links: [{ id: "l1", memoId: "m_1", targetObjectId: "obj_1" }],
          position: { x: 0, y: 0 },
          size: { width: 220, height: 148 },
        },
      ],
    };
    const edges = toFlowEdges(withMemo, () => undefined, () => undefined, () => undefined);
    expect(edges.find((item) => item.id === "memolink:l1")).toMatchObject({
      source: "m_1",
      target: "obj_1",
      sourceHandle: "MEMO",
      targetHandle: "OBJ",
      type: "memoLink",
    });
  });
});
