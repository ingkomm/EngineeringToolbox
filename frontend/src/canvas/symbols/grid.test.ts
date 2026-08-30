import { describe, expect, it } from "vitest";
import { CANVAS_GRID, calcCardWidth, snapCalcWidth, snapCenteredTopLeft, toCenterPosition, toTopLeftPosition } from "./grid";

describe("layout snap helpers", () => {
  it("round-trips top-left through a centered origin", () => {
    const topLeft = { x: 80, y: 88 };
    const size = { width: 66, height: 66 };
    const center = toCenterPosition(topLeft, size.width, size.height);
    expect(center).toEqual({ x: 113, y: 121 });
    expect(toTopLeftPosition(center, size.width, size.height)).toEqual(topLeft);
  });

  it("snaps a 9×7 symbol so the visual center sits on a grid point", () => {
    const size = { width: 99, height: 77 };
    const snapped = snapCenteredTopLeft({ x: 520, y: 88 }, size.width, size.height);
    const center = toCenterPosition(snapped, size.width, size.height);
    expect(center.x % CANVAS_GRID).toBe(0);
    expect(center.y % CANVAS_GRID).toBe(0);
    expect(size.width / 2).toBe(49.5);
  });

  it("snaps a calculation card width to the canvas grid", () => {
    expect(snapCalcWidth(500)).toBe(495);
    expect(snapCalcWidth(100)).toBe(440);
    expect(snapCalcWidth(440) % CANVAS_GRID).toBe(0);
  });

  it("uses compact width until the calculation card is expanded", () => {
    expect(calcCardWidth(false, 495)).toBe(280);
    expect(calcCardWidth(true, 495)).toBe(495);
    expect(calcCardWidth(true)).toBe(759);
  });
});
