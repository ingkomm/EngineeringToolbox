export const CANVAS_GRID = 11;
export const EDITOR_PAD = CANVAS_GRID;
export const POINT_NODE_SIZE = 36;
export const LAYOUT_NODE_ORIGIN: [number, number] = [0.5, 0.5];

export function snapToGrid(value: number, grid = CANVAS_GRID): number {
  return Math.round(value / grid) * grid;
}

export function snapPositionToGrid(
  position: { x: number; y: number },
  grid = CANVAS_GRID,
): { x: number; y: number } {
  return { x: snapToGrid(position.x, grid), y: snapToGrid(position.y, grid) };
}

export function snapCenteredTopLeft(
  topLeft: { x: number; y: number },
  width: number,
  height: number,
  grid = CANVAS_GRID,
): { x: number; y: number } {
  const center = toCenterPosition(topLeft, width, height);
  return toTopLeftPosition(snapPositionToGrid(center, grid), width, height);
}

/** Integer cell size. Center snap, not even/odd cells, puts the origin on a grid dot. */
export function snapGridSize(value: number, minCells = 2): number {
  const cells = Math.max(minCells, Math.round(value / CANVAS_GRID));
  return cells * CANVAS_GRID;
}

/** Border-inclusive line count. Size can be odd or even cells; snap always uses the center. */
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
