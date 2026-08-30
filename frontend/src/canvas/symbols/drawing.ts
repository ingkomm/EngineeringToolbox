import { CANVAS_GRID, snapToGrid } from "./grid";

export type EdgeSide = "left" | "right" | "top" | "bottom";

export type SymbolPrimitive =
  | { id: string; kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "circle"; cx: number; cy: number; r: number }
  | { id: string; kind: "polygon"; points: Array<{ x: number; y: number }> };

export interface PortAnchor {
  id: string;
  side: EdgeSide;
  offset: number;
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
  _width = height,
): PortAnchor[] {
  const ins = Array.from({ length: Math.max(0, inCount) }, (_, index) => ({
    id: `IN_${index + 1}`,
    side: "left" as const,
    offset: spacedOffset(inCount, index, height),
  }));
  const outs = Array.from({ length: Math.max(0, outCount) }, (_, index) => ({
    id: `OUT_${index + 1}`,
    side: "right" as const,
    offset: spacedOffset(outCount, index, height),
  }));
  return [...ins, ...outs];
}

export function mergePortAnchors(
  existing: PortAnchor[] | undefined,
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
      clampPortAnchor(
        prev.get(id) ?? { id, side: "left", offset: spacedOffset(inCount, index, height) },
        width,
        height,
      ),
    );
  }
  for (let index = 0; index < Math.max(0, outCount); index += 1) {
    const id = `OUT_${index + 1}`;
    next.push(
      clampPortAnchor(
        prev.get(id) ?? { id, side: "right", offset: spacedOffset(outCount, index, height) },
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

export function clampPortAnchor(anchor: PortAnchor, width: number, height: number): PortAnchor {
  const along = anchor.side === "left" || anchor.side === "right" ? height : width;
  return { ...anchor, offset: snapToGrid(Math.min(along, Math.max(0, anchor.offset))) };
}

export function portXY(anchor: PortAnchor, width: number, height: number): { x: number; y: number } {
  if (anchor.side === "left") return { x: 0, y: anchor.offset };
  if (anchor.side === "right") return { x: width, y: anchor.offset };
  if (anchor.side === "top") return { x: anchor.offset, y: 0 };
  return { x: anchor.offset, y: height };
}

export function snapPortToBorder(x: number, y: number, width: number, height: number): Pick<PortAnchor, "side" | "offset"> {
  const candidates: Array<{ side: EdgeSide; dist: number; offset: number }> = [
    { side: "left", dist: Math.abs(x), offset: clampAlong(y, height) },
    { side: "right", dist: Math.abs(width - x), offset: clampAlong(y, height) },
    { side: "top", dist: Math.abs(y), offset: clampAlong(x, width) },
    { side: "bottom", dist: Math.abs(height - y), offset: clampAlong(x, width) },
  ];
  const best = candidates.reduce((winner, item) => (item.dist < winner.dist ? item : winner));
  return { side: best.side, offset: best.offset };
}

function clampAlong(value: number, length: number): number {
  return snapToGrid(Math.min(length, Math.max(0, value)));
}

function spacedOffset(count: number, index: number, length: number): number {
  if (count <= 1) return snapToGrid(length / 2);
  return Math.round(((index + 1) / (count + 1)) * length / CANVAS_GRID) * CANVAS_GRID;
}
