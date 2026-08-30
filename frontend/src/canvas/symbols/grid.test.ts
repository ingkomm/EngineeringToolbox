import { describe, expect, it } from "vitest";
import { CANVAS_GRID, snapCalcWidth, toCenterPosition, toTopLeftPosition } from "./grid";

describe("layout snap helpers", () => {
  it("round-trips top-left through a centered origin", () => {
    const topLeft = { x: 80, y: 88 };
    const size = { width: 66, height: 66 };
    const center = toCenterPosition(topLeft, size.width, size.height);
    expect(center).toEqual({ x: 113, y: 121 });
    expect(toTopLeftPosition(center, size.width, size.height)).toEqual(topLeft);
  });

  it("snaps a calculation card width to the canvas grid", () => {
    expect(snapCalcWidth(500)).toBe(495);
    expect(snapCalcWidth(100)).toBe(440);
    expect(snapCalcWidth(440) % CANVAS_GRID).toBe(0);
  });
});
