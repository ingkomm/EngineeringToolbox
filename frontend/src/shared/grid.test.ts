import { describe, expect, it } from "vitest";
import { CANVAS_GRID, snapCenteredTopLeft, toCenterPosition, toTopLeftPosition } from "./grid";

describe("layout snap helpers", () => {
  it("round-trips top-left through a centered origin", () => {
    const topLeft = { x: 80, y: 88 };
    const size = { width: 66, height: 66 };
    const center = toCenterPosition(topLeft, size.width, size.height);
    expect(center).toEqual({ x: 113, y: 121 });
    expect(toTopLeftPosition(center, size.width, size.height)).toEqual(topLeft);
  });

  it("puts the visual center on a grid dot for any symbol size", () => {
    const sizes = [
      { width: 88, height: 66 },
      { width: 77, height: 77 },
      { width: 36, height: 36 },
      { width: 99, height: 55 },
    ];
    for (const size of sizes) {
      const snapped = snapCenteredTopLeft({ x: 520, y: 88 }, size.width, size.height);
      const center = toCenterPosition(snapped, size.width, size.height);
      expect(center.x % CANVAS_GRID).toBe(0);
      expect(center.y % CANVAS_GRID).toBe(0);
    }
  });
});
