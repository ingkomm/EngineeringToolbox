import type {
  ArrangementEquipment,
  ArrangementObject,
  ArrangementPoint,
  CalculationObject,
  MappingEdge,
  PointEnd,
  WorksheetObject,
} from "../types/contract";

export function isCalculationObject(object: WorksheetObject): object is CalculationObject {
  return object.kind !== "arrangement";
}

export function isArrangementObject(object: WorksheetObject): object is ArrangementObject {
  return object.kind === "arrangement";
}

export function isValueFlowEdge(edge: MappingEdge): boolean {
  return edge.relationType == null || edge.relationType === "value_flow";
}

export function emptyArrangementDomain(): ArrangementObject["domain"] {
  return {
    equipment: [],
    points: [],
  };
}

export function defaultElementView(
  x: number,
  y: number,
  width = 112,
  height = 72,
): ArrangementObject["view"]["elements"][string] {
  return { x, y, width, height, rotation: 0, zIndex: 0, visible: true };
}

export function equipmentPortIds(equipment: ArrangementEquipment): { ins: string[]; outs: string[] } {
  const ins = Array.from({ length: Math.max(0, equipment.inCount) }, (_, index) => `IN_${index + 1}`);
  const outs = Array.from({ length: Math.max(0, equipment.outCount) }, (_, index) => `OUT_${index + 1}`);
  return { ins, outs };
}

export function hasEquipmentPort(equipment: ArrangementEquipment, portId: string): boolean {
  const ports = equipmentPortIds(equipment);
  return ports.ins.includes(portId) || ports.outs.includes(portId);
}

export function arrangementElementIds(object: ArrangementObject): Set<string> {
  return new Set([
    ...object.domain.equipment.map((item) => item.id),
    ...object.domain.points.map((item) => item.id),
  ]);
}

export function clampConnectionCount(value: number | undefined, fallback = 2): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.min(8, Math.floor(value)));
}

export function pointConnectionIds(count: number): string[] {
  return Array.from({ length: clampConnectionCount(count) }, (_, index) => `C_${index + 1}`);
}

export function parsePointConnectionEnd(end: string): number | null {
  if (end === "a") return 0;
  if (end === "b") return 1;
  const match = /^C_(\d+)$/.exec(end);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 0 ? index : null;
}

export function pointViewSize(count: number): { width: number; height: number } {
  const connectionCount = clampConnectionCount(count);
  return { width: Math.max(96, 28 + connectionCount * 22), height: 36 };
}

export function normalizeArrangementPoint(point: {
  id: string;
  name?: string;
  connectionCount?: number;
  connections?: Array<PointEnd | null>;
  a?: PointEnd | null;
  b?: PointEnd | null;
}): ArrangementPoint {
  const fromLegacy = point.connections ?? [point.a ?? null, point.b ?? null];
  const count = clampConnectionCount(point.connectionCount, Math.max(2, fromLegacy.length));
  return {
    id: point.id,
    name: (point.name ?? "").trim() || point.id,
    connectionCount: count,
    connections: Array.from({ length: count }, (_, index) => fromLegacy[index] ?? null),
  };
}
