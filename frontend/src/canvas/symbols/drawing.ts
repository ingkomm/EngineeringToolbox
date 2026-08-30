export type EdgeSide = "left" | "right" | "top" | "bottom";

export type SymbolPrimitive =
  | { id: string; kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "circle"; cx: number; cy: number; r: number }
  | { id: string; kind: "polygon"; points: Array<{ x: number; y: number }> };

export interface SymbolDrawing {
  width: number;
  height: number;
  primitives: SymbolPrimitive[];
}

export interface PortAnchor {
  id: string;
  side: EdgeSide;
  offset: number;
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

function drawing(width: number, height: number, primitives: SymbolPrimitive[]): SymbolDrawing {
  return { width, height, primitives };
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
    return { width: override.width, height: override.height, primitives: override.primitives };
  }
  if (libraryDrawing) {
    return { width: libraryDrawing.width, height: libraryDrawing.height, primitives: libraryDrawing.primitives };
  }
  return defaultDrawing(symbolId);
}

export function nextPrimitiveId(drawing: SymbolDrawing, prefix: string): string {
  let n = 1;
  const used = new Set(drawing.primitives.map((item) => item.id));
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

export function defaultPortAnchors(inCount: number, outCount: number, height: number): PortAnchor[] {
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

function spacedOffset(count: number, index: number, length: number): number {
  if (count <= 1) return length / 2;
  return Math.round(((index + 1) / (count + 1)) * length / 11) * 11;
}
