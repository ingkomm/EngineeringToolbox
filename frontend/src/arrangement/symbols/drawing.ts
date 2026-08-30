import { CANVAS_GRID, snapToGrid } from "../../shared/grid";

export type EdgeSide = "left" | "right" | "top" | "bottom";

export type SymbolPrimitive =
  | { id: string; kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "circle"; cx: number; cy: number; r: number }
  | { id: string; kind: "polygon"; points: Array<{ x: number; y: number }> };

export interface PortAnchor {
  id: string;
  x?: number;
  y?: number;
  side?: EdgeSide;
  offset?: number;
}

export interface SymbolDrawing {
  width: number;
  height: number;
  primitives: SymbolPrimitive[];
  ports?: PortAnchor[];
}

function line(id: string, x1: number, y1: number, x2: number, y2: number): SymbolPrimitive {
  return { id, kind: "line", x1, y1, x2, y2 };
}

function circle(id: string, cx: number, cy: number, r: number): SymbolPrimitive {
  return { id, kind: "circle", cx, cy, r };
}

function polygon(id: string, points: Array<[number, number]>): SymbolPrimitive {
  return { id, kind: "polygon", points: points.map(([x, y]) => ({ x, y })) };
}

function drawing(
  width: number,
  height: number,
  primitives: SymbolPrimitive[],
  inCount = 1,
  outCount = 1,
): SymbolDrawing {
  return {
    width,
    height,
    primitives,
    ports: defaultPortAnchors(inCount, outCount, height, width),
  };
}

export function blankDrawing(): SymbolDrawing {
  return drawing(88, 66, []);
}

const EXAMPLES: Record<string, SymbolDrawing> = {
  valve: drawing(66, 44, [
    polygon("a", [
      [11, 11],
      [33, 22],
      [11, 33],
    ]),
    polygon("b", [
      [55, 11],
      [33, 22],
      [55, 33],
    ]),
    line("stem", 33, 22, 33, 0),
    line("hand", 22, 0, 44, 0),
  ]),
  pump: drawing(66, 66, [
    circle("body", 33, 33, 22),
    polygon("imp", [
      [22, 22],
      [44, 33],
      [22, 44],
    ]),
  ]),
  vessel: drawing(66, 77, [
    line("l", 11, 22, 11, 55),
    line("r", 55, 22, 55, 55),
    line("t1", 11, 22, 22, 11),
    line("t2", 22, 11, 44, 11),
    line("t3", 44, 11, 55, 22),
    line("b1", 11, 55, 22, 66),
    line("b2", 22, 66, 44, 66),
    line("b3", 44, 66, 55, 55),
  ]),
};

export function defaultDrawing(symbolId: string | undefined): SymbolDrawing {
  return structuredClone(EXAMPLES[symbolId ?? ""] ?? blankDrawing());
}

export function resolveDrawing(
  symbolId: string | undefined,
  override?: SymbolDrawing | null,
  libraryDrawing?: SymbolDrawing | null,
): SymbolDrawing {
  if (override?.primitives) {
    return {
      width: override.width,
      height: override.height,
      primitives: override.primitives,
      ports: override.ports,
    };
  }
  if (libraryDrawing) {
    return {
      width: libraryDrawing.width,
      height: libraryDrawing.height,
      primitives: libraryDrawing.primitives,
      ports: libraryDrawing.ports,
    };
  }
  return defaultDrawing(symbolId);
}

export function nextPrimitiveId(drawing: SymbolDrawing, prefix: string): string {
  let n = 1;
  const used = new Set(drawing.primitives.map((item) => item.id));
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

export function defaultPortAnchors(
  inCount: number,
  outCount: number,
  height: number,
  width = height,
): PortAnchor[] {
  const ins = Array.from({ length: Math.max(0, inCount) }, (_, index) =>
    clampPortAnchor(
      { id: `IN_${index + 1}`, x: 0, y: spacedOffset(inCount, index, height), side: "left" },
      width,
      height,
    ),
  );
  const outs = Array.from({ length: Math.max(0, outCount) }, (_, index) =>
    clampPortAnchor(
      { id: `OUT_${index + 1}`, x: width, y: spacedOffset(outCount, index, height), side: "right" },
      width,
      height,
    ),
  );
  return [...ins, ...outs];
}

export function mergePortAnchors(
  existing: Array<Partial<PortAnchor> & { id: string }> | undefined,
  inCount: number,
  outCount: number,
  width: number,
  height: number,
): PortAnchor[] {
  const prev = new Map((existing ?? []).map((item) => [item.id, item]));
  const next: PortAnchor[] = [];
  for (let index = 0; index < Math.max(0, inCount); index += 1) {
    const id = `IN_${index + 1}`;
    next.push(
      normalizePort(
        prev.get(id) ?? { id, x: 0, y: spacedOffset(inCount, index, height), side: "left" },
        width,
        height,
      ),
    );
  }
  for (let index = 0; index < Math.max(0, outCount); index += 1) {
    const id = `OUT_${index + 1}`;
    next.push(
      normalizePort(
        prev.get(id) ?? { id, x: width, y: spacedOffset(outCount, index, height), side: "right" },
        width,
        height,
      ),
    );
  }
  return next;
}

export function withPorts(drawing: SymbolDrawing, inCount: number, outCount: number): SymbolDrawing {
  return {
    ...drawing,
    ports: mergePortAnchors(drawing.ports, inCount, outCount, drawing.width, drawing.height),
  };
}

export function resizeDrawing(drawing: SymbolDrawing, width: number, height: number): SymbolDrawing {
  const inCount = drawing.ports?.filter((item) => item.id.startsWith("IN_")).length ?? 1;
  const outCount = drawing.ports?.filter((item) => item.id.startsWith("OUT_")).length ?? 1;
  return withPorts({ ...drawing, width, height }, inCount, outCount);
}

export function nearestPortSide(x: number, y: number, width: number, height: number): EdgeSide {
  const candidates: Array<{ side: EdgeSide; dist: number }> = [
    { side: "left", dist: Math.abs(x) },
    { side: "right", dist: Math.abs(width - x) },
    { side: "top", dist: Math.abs(y) },
    { side: "bottom", dist: Math.abs(height - y) },
  ];
  return candidates.reduce((winner, item) => (item.dist < winner.dist ? item : winner)).side;
}

export function normalizePort(
  item: Partial<PortAnchor> & { id: string },
  width: number,
  height: number,
): PortAnchor {
  if (item.x != null && item.y != null && Number.isFinite(item.x) && Number.isFinite(item.y)) {
    return clampPortAnchor({ id: item.id, x: item.x, y: item.y, side: item.side }, width, height);
  }
  const side = item.side ?? "left";
  const offset = item.offset ?? 0;
  const xy = edgePortXY(side, offset, width, height);
  return clampPortAnchor({ id: item.id, x: xy.x, y: xy.y, side }, width, height);
}

export function clampPortAnchor(anchor: PortAnchor, width: number, height: number): PortAnchor {
  const x = snapToGrid(Math.min(width, Math.max(0, anchor.x ?? 0)));
  const y = snapToGrid(Math.min(height, Math.max(0, anchor.y ?? 0)));
  return { id: anchor.id, x, y, side: nearestPortSide(x, y, width, height) };
}

export function snapPortPoint(x: number, y: number, width: number, height: number): PortAnchor {
  return clampPortAnchor({ id: "", x, y }, width, height);
}

export function portXY(anchor: PortAnchor, width: number, height: number): { x: number; y: number } {
  if (anchor.x != null && anchor.y != null) return { x: anchor.x, y: anchor.y };
  return edgePortXY(anchor.side ?? "left", anchor.offset ?? 0, width, height);
}

function edgePortXY(side: EdgeSide, offset: number, width: number, height: number): { x: number; y: number } {
  if (side === "left") return { x: 0, y: offset };
  if (side === "right") return { x: width, y: offset };
  if (side === "top") return { x: offset, y: 0 };
  return { x: offset, y: height };
}

function spacedOffset(count: number, index: number, length: number): number {
  if (count <= 1) return snapToGrid(length / 2);
  return Math.round(((index + 1) / (count + 1)) * length / CANVAS_GRID) * CANVAS_GRID;
}
