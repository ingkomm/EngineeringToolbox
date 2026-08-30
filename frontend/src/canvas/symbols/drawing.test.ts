import { describe, expect, it } from "vitest";
import { defaultPortAnchors, defaultDrawing } from "./drawing";
import { CANVAS_GRID } from "./grid";
import { SYMBOL_CATALOG } from "./catalog";

describe("symbol drawings", () => {
  it("keeps every default vertex on the canvas grid", () => {
    for (const item of SYMBOL_CATALOG) {
      const drawing = defaultDrawing(item.id);
      expect(drawing.width).toBe(item.width);
      expect(drawing.height).toBe(item.height);
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

  it("crosses heat-exchanger in/out ports", () => {
    const ports = defaultPortAnchors("heat-exchanger", 2, 2);
    expect(ports).toEqual([
      { id: "IN_1", side: "left", offset: 22 },
      { id: "OUT_1", side: "right", offset: 44 },
      { id: "IN_2", side: "right", offset: 22 },
      { id: "OUT_2", side: "left", offset: 44 },
    ]);
  });
});
