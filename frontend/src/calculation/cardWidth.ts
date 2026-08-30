import { snapToGrid } from "../shared/grid";

export const CALC_EXPANDED_MIN_WIDTH = 440;

export function snapCalcWidth(value: number): number {
  return Math.max(CALC_EXPANDED_MIN_WIDTH, snapToGrid(value));
}

export const CALC_EXPANDED_DEFAULT_WIDTH = snapCalcWidth(760);

export function calcCardWidth(stored?: number): number {
  return stored ?? CALC_EXPANDED_DEFAULT_WIDTH;
}
