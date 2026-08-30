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
