import { describe, expect, it } from "vitest";
import { defaultPortAnchors, defaultDrawing, blankDrawing, mergePortAnchors, snapPortPoint } from "./drawing";
import { CANVAS_GRID, gridLinesToSize, sizeToGridLines } from "./grid";

describe("symbol drawings", () => {
  it("keeps pump and valve vertices on the canvas grid", () => {
    for (const id of ["pump", "valve"]) {
      const drawing = defaultDrawing(id);
      expect(drawing.width % CANVAS_GRID).toBe(0);
      expect(drawing.height % CANVAS_GRID).toBe(0);
      for (const primitive of drawing.primitives) {
        if (primitive.kind === "line") {
          for (const value of [primitive.x1, primitive.y1, primitive.x2, primitive.y2]) {
            expect(value % CANVAS_GRID).toBe(0);
          }
        }
        if (primitive.kind === "circle") {
          for (const value of [primitive.cx, primitive.cy, primitive.r]) {
            expect(value % CANVAS_GRID).toBe(0);
          }
        }
        if (primitive.kind === "polygon") {
          for (const point of primitive.points) {
            expect(point.x % CANVAS_GRID).toBe(0);
            expect(point.y % CANVAS_GRID).toBe(0);
          }
        }
      }
    }
  });

  it("spaces in/out ports along the flow axis", () => {
    expect(defaultPortAnchors(1, 1, 66, 66)).toEqual([
      { id: "IN_1", x: 0, y: 33, side: "left" },
      { id: "OUT_1", x: 66, y: 33, side: "right" },
    ]);
    expect(defaultPortAnchors(2, 2, 66, 66)).toEqual([
      { id: "IN_1", x: 0, y: 22, side: "left" },
      { id: "IN_2", x: 0, y: 44, side: "left" },
      { id: "OUT_1", x: 66, y: 22, side: "right" },
      { id: "OUT_2", x: 66, y: 44, side: "right" },
    ]);
  });

  it("starts a blank drawing on a 9×7 cell grid", () => {
    const drawing = blankDrawing();
    expect(drawing.primitives).toEqual([]);
    expect(sizeToGridLines(drawing.width)).toBe(9);
    expect(sizeToGridLines(drawing.height)).toBe(7);
    expect(gridLinesToSize(9)).toBe(99);
    expect(drawing.width).toBe(99);
    expect(drawing.height).toBe(77);
  });

  it("keeps interior port positions when in/out counts change", () => {
    const ports = mergePortAnchors([{ id: "IN_1", x: 22, y: 22 }], 2, 1, 88, 66);
    expect(ports).toEqual([
      { id: "IN_1", x: 22, y: 22, side: "left" },
      { id: "IN_2", x: 0, y: 44, side: "left" },
      { id: "OUT_1", x: 88, y: 33, side: "right" },
    ]);
    expect(snapPortPoint(33, 22, 88, 66)).toMatchObject({ x: 33, y: 22 });
  });
});
