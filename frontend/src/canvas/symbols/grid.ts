export const CANVAS_GRID = 11;

export function snapToGrid(value: number, grid = CANVAS_GRID): number {
  return Math.round(value / grid) * grid;
}

/** Even number of grid cells so the mid-axis lands on the grid. */
export function evenGridSize(value: number, minCells = 4): number {
  const cells = Math.max(minCells, Math.round(value / CANVAS_GRID));
  const even = cells % 2 === 0 ? cells : cells + 1;
  return even * CANVAS_GRID;
}

export function gridCenter(size: number): number {
  return size / 2;
}

/** Border-inclusive line count. 88px / 11 = 8 cells → 9 lines. */
export const MIN_GRID_LINES = 3;
export const MAX_GRID_LINES = 21;

export function sizeToGridLines(px: number): number {
  return Math.max(MIN_GRID_LINES, Math.round(px / CANVAS_GRID) + 1);
}

export function gridLinesToSize(lines: number): number {
  const clamped = Math.max(MIN_GRID_LINES, Math.min(MAX_GRID_LINES, Math.round(lines) || MIN_GRID_LINES));
  return (clamped - 1) * CANVAS_GRID;
}
