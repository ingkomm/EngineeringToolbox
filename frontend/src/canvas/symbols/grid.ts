export const CANVAS_GRID = 11;
export const EDITOR_PAD = CANVAS_GRID;
export const POINT_NODE_SIZE = 36;
export const LAYOUT_NODE_ORIGIN: [number, number] = [0.5, 0.5];
export const CALC_COMPACT_WIDTH = 280;
export const CALC_EXPANDED_MIN_WIDTH = 440;

export function snapToGrid(value: number, grid = CANVAS_GRID): number {
  return Math.round(value / grid) * grid;
}

/** Snap a box so its visual center sits on a grid intersection. */
export function snapCenteredTopLeft(
  topLeft: { x: number; y: number },
  width: number,
  height: number,
  grid = CANVAS_GRID,
): { x: number; y: number } {
  const center = toCenterPosition(topLeft, width, height);
  return toTopLeftPosition({ x: snapToGrid(center.x, grid), y: snapToGrid(center.y, grid) }, width, height);
}

/** Even cell count so the box center sits on a canvas grid dot. */
export function snapGridSize(value: number, minCells = 2): number {
  const cells = Math.max(minCells, Math.round(value / CANVAS_GRID));
  const even = cells % 2 === 0 ? cells : cells + 1;
  return even * CANVAS_GRID;
}

export function evenGridSize(value: number, minCells = 4): number {
  return snapGridSize(value, minCells);
}

export function gridCenter(size: number): number {
  return size / 2;
}

/** Border-inclusive line count. 9 lines = 8 cells = 88px; center (44) is a grid dot. */
export const MIN_GRID_LINES = 3;
export const MAX_GRID_LINES = 21;

export function sizeToGridLines(px: number): number {
  return Math.max(MIN_GRID_LINES, Math.round(px / CANVAS_GRID) + 1);
}

export function gridLinesToSize(lines: number): number {
  const clamped = Math.max(MIN_GRID_LINES, Math.min(MAX_GRID_LINES, Math.round(lines) || MIN_GRID_LINES));
  return (clamped - 1) * CANVAS_GRID;
}

export function toCenterPosition(
  topLeft: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: topLeft.x + width / 2, y: topLeft.y + height / 2 };
}

export function toTopLeftPosition(
  center: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: center.x - width / 2, y: center.y - height / 2 };
}

export function snapCalcWidth(value: number): number {
  return Math.max(CALC_EXPANDED_MIN_WIDTH, snapToGrid(value));
}

export const CALC_EXPANDED_DEFAULT_WIDTH = snapCalcWidth(760);

export function calcCardWidth(open: boolean, stored?: number): number {
  return open ? (stored ?? CALC_EXPANDED_DEFAULT_WIDTH) : CALC_COMPACT_WIDTH;
}
