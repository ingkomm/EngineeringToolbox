import { describe, expect, it } from "vitest";
import { CANVAS_GRID } from "../shared/grid";
import { calcCardWidth, snapCalcWidth } from "./cardWidth";

describe("calculation card width", () => {
  it("snaps a calculation card width to the canvas grid", () => {
    expect(snapCalcWidth(500)).toBe(495);
    expect(snapCalcWidth(100)).toBe(440);
    expect(snapCalcWidth(440) % CANVAS_GRID).toBe(0);
  });

  it("uses the stored calculation width when present", () => {
    expect(calcCardWidth(495)).toBe(495);
    expect(calcCardWidth()).toBe(759);
  });
});
