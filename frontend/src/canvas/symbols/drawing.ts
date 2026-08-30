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

function box(id: string, x: number, y: number, w: number, h: number): SymbolPrimitive {
  return polygon(id, [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

function drawing(width: number, height: number, primitives: SymbolPrimitive[]): SymbolDrawing {
  return { width, height, primitives };
}

const DEFAULTS: Record<string, SymbolDrawing> = {
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
  "check-valve": drawing(66, 44, [
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
    line("stop", 44, 11, 44, 33),
  ]),
  "control-valve": drawing(66, 66, [
    polygon("a", [
      [11, 22],
      [33, 33],
      [11, 44],
    ]),
    polygon("b", [
      [55, 22],
      [33, 33],
      [55, 44],
    ]),
    line("stem", 33, 33, 33, 11),
    circle("act", 33, 11, 11),
  ]),
  "safety-valve": drawing(66, 66, [
    polygon("a", [
      [22, 22],
      [33, 33],
      [44, 22],
    ]),
    polygon("b", [
      [22, 44],
      [33, 33],
      [44, 44],
    ]),
    line("stem", 33, 22, 33, 11),
    line("spring", 22, 11, 44, 11),
  ]),
  damper: drawing(66, 44, [
    box("body", 11, 11, 44, 22),
    line("blade", 22, 33, 44, 11),
    line("stem", 33, 11, 33, 0),
  ]),
  pump: drawing(66, 66, [
    circle("body", 33, 33, 22),
    polygon("imp", [
      [22, 22],
      [44, 33],
      [22, 44],
    ]),
  ]),
  "fan-compressor": drawing(66, 66, [
    circle("body", 33, 33, 22),
    polygon("v1", [
      [33, 11],
      [44, 33],
      [33, 33],
    ]),
    polygon("v2", [
      [33, 55],
      [22, 33],
      [33, 33],
    ]),
    polygon("v3", [
      [11, 33],
      [33, 22],
      [33, 33],
    ]),
    polygon("v4", [
      [55, 33],
      [33, 44],
      [33, 33],
    ]),
  ]),
  "vacuum-pump": drawing(66, 66, [
    circle("body", 33, 33, 22),
    polygon("v", [
      [22, 22],
      [33, 44],
      [44, 22],
    ]),
  ]),
  "heat-exchanger": drawing(110, 66, [
    box("shell", 11, 11, 88, 44),
    line("hot", 0, 22, 110, 44),
    line("cold", 0, 44, 110, 22),
  ]),
  condenser: drawing(110, 66, [
    box("shell", 11, 11, 88, 44),
    line("a", 0, 22, 110, 44),
    line("b", 0, 44, 110, 22),
    line("cool1", 22, 11, 88, 11),
  ]),
  cooler: drawing(110, 66, [
    box("shell", 22, 11, 66, 44),
    line("finL", 11, 11, 11, 55),
    line("finR", 99, 11, 99, 55),
    line("hot", 0, 22, 110, 44),
    line("cold", 0, 44, 110, 22),
  ]),
  "cooling-tower": drawing(66, 88, [
    polygon("body", [
      [11, 77],
      [22, 22],
      [44, 22],
      [55, 77],
    ]),
    line("base", 11, 77, 55, 77),
    line("deck", 22, 33, 44, 33),
  ]),
  filter: drawing(66, 66, [
    box("body", 11, 11, 44, 44),
    line("m1", 22, 22, 44, 44),
    line("m2", 22, 44, 44, 22),
  ]),
  separator: drawing(66, 88, [
    polygon("body", [
      [11, 22],
      [11, 66],
      [22, 77],
      [44, 77],
      [55, 66],
      [55, 22],
      [44, 11],
      [22, 11],
    ]),
    line("mesh", 11, 33, 55, 33),
  ]),
  mixer: drawing(66, 88, [
    polygon("body", [
      [11, 22],
      [11, 66],
      [22, 77],
      [44, 77],
      [55, 66],
      [55, 22],
      [44, 11],
      [22, 11],
    ]),
    line("shaft", 33, 11, 33, 66),
    line("blade", 22, 55, 44, 55),
  ]),
  "tank-vessel": drawing(44, 88, [
    polygon("body", [
      [11, 22],
      [11, 66],
      [22, 77],
      [22, 77],
      [33, 66],
      [33, 22],
      [22, 11],
    ]),
    line("level", 11, 22, 33, 22),
  ]),
  drum: drawing(88, 44, [
    polygon("body", [
      [22, 11],
      [66, 11],
      [77, 22],
      [66, 33],
      [22, 33],
      [11, 22],
    ]),
  ]),
  accumulator: drawing(44, 88, [
    polygon("body", [
      [11, 22],
      [11, 66],
      [22, 77],
      [33, 66],
      [33, 22],
      [22, 11],
    ]),
    line("blad", 11, 33, 33, 44),
  ]),
  boiler: drawing(88, 88, [
    box("body", 11, 11, 66, 66),
    line("t1", 22, 22, 66, 22),
    line("t2", 22, 33, 66, 33),
    polygon("fire", [
      [22, 66],
      [33, 44],
      [44, 66],
      [55, 44],
      [66, 66],
    ]),
  ]),
  furnace: drawing(66, 66, [
    box("body", 11, 11, 44, 44),
    polygon("flame", [
      [22, 44],
      [33, 22],
      [44, 44],
    ]),
  ]),
  turbine: drawing(88, 66, [
    polygon("body", [
      [11, 22],
      [44, 22],
      [77, 33],
      [44, 44],
      [11, 44],
    ]),
    circle("hub", 33, 33, 11),
  ]),
  "gas-turbine": drawing(110, 66, [
    polygon("comp", [
      [11, 22],
      [44, 11],
      [44, 55],
      [11, 44],
    ]),
    box("comb", 44, 22, 22, 22),
    polygon("turb", [
      [66, 11],
      [99, 22],
      [99, 44],
      [66, 55],
    ]),
  ]),
  motor: drawing(66, 66, [circle("body", 33, 33, 22), box("m", 22, 22, 22, 22)]),
  generator: drawing(66, 66, [circle("body", 33, 33, 22), box("g", 22, 22, 22, 22)]),
  strainer: drawing(66, 66, [
    circle("body", 33, 33, 22),
    line("mesh", 22, 22, 44, 44),
    line("blow", 44, 44, 44, 55),
  ]),
  orifice: drawing(44, 44, [line("a", 11, 11, 11, 33), line("b", 33, 11, 33, 33), line("plate", 22, 11, 22, 33)]),
  reducer: drawing(66, 44, [
    polygon("body", [
      [11, 11],
      [33, 11],
      [55, 22],
      [55, 22],
      [33, 33],
      [11, 33],
    ]),
  ]),
  "generic-equipment": drawing(88, 66, [box("body", 11, 11, 66, 44), line("axis", 11, 33, 77, 33)]),
};

export function defaultDrawing(symbolId: string | undefined): SymbolDrawing {
  return structuredClone(DEFAULTS[symbolId ?? ""] ?? DEFAULTS["generic-equipment"]!);
}

export function resolveDrawing(symbolId: string | undefined, override?: SymbolDrawing | null): SymbolDrawing {
  if (override?.primitives?.length) {
    return {
      width: override.width,
      height: override.height,
      primitives: override.primitives,
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

export const CROSS_FLOW_SYMBOLS = new Set(["heat-exchanger", "condenser", "cooler"]);

export function defaultPortAnchors(symbolId: string | undefined, inCount: number, outCount: number): PortAnchor[] {
  const drawing = defaultDrawing(symbolId);
  if (CROSS_FLOW_SYMBOLS.has(symbolId ?? "") && inCount === 2 && outCount === 2) {
    return [
      { id: "IN_1", side: "left", offset: 22 },
      { id: "OUT_1", side: "right", offset: 44 },
      { id: "IN_2", side: "right", offset: 22 },
      { id: "OUT_2", side: "left", offset: 44 },
    ];
  }
  const ins = Array.from({ length: Math.max(0, inCount) }, (_, index) => ({
    id: `IN_${index + 1}`,
    side: "left" as const,
    offset: spacedOffset(inCount, index, drawing.height),
  }));
  const outs = Array.from({ length: Math.max(0, outCount) }, (_, index) => ({
    id: `OUT_${index + 1}`,
    side: "right" as const,
    offset: spacedOffset(outCount, index, drawing.height),
  }));
  return [...ins, ...outs];
}

function spacedOffset(count: number, index: number, length: number): number {
  if (count <= 1) return gridCenterSafe(length);
  return snapToEleven(((index + 1) / (count + 1)) * length);
}

function gridCenterSafe(length: number): number {
  return length / 2;
}

function snapToEleven(value: number): number {
  return Math.round(value / 11) * 11;
}
