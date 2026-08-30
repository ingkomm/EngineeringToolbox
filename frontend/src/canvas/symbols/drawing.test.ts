import { describe, expect, it } from "vitest";
import { defaultPortAnchors, defaultDrawing, blankDrawing } from "./drawing";
import { CANVAS_GRID } from "./grid";

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
    expect(defaultPortAnchors(1, 1, 66)).toEqual([
      { id: "IN_1", side: "left", offset: 33 },
      { id: "OUT_1", side: "right", offset: 33 },
    ]);
    expect(defaultPortAnchors(2, 2, 66)).toEqual([
      { id: "IN_1", side: "left", offset: 22 },
      { id: "IN_2", side: "left", offset: 44 },
      { id: "OUT_1", side: "right", offset: 22 },
      { id: "OUT_2", side: "right", offset: 44 },
    ]);
  });

  it("starts a blank drawing on the even grid", () => {
    const drawing = blankDrawing();
    expect(drawing.primitives).toEqual([]);
    expect(drawing.width % (CANVAS_GRID * 2)).toBe(0);
    expect(drawing.height % (CANVAS_GRID * 2)).toBe(0);
  });
});
