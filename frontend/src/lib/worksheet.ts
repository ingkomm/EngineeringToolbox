import type {
  EquipmentObject,
  PointEnd,
  PointObject,
  CalculationObject,
  MappingEdge,
  ProjectDocument,
  WorksheetObject,
} from "../types/contract";

export function isCalculationObject(object: WorksheetObject): object is CalculationObject {
  return object.kind !== "equipment" && object.kind !== "point";
}

export function isEquipmentObject(object: WorksheetObject): object is EquipmentObject {
  return object.kind === "equipment";
}

export function isPointObject(object: WorksheetObject): object is PointObject {
  return object.kind === "point";
}

export function isLayoutObject(object: WorksheetObject): object is EquipmentObject | PointObject {
  return isEquipmentObject(object) || isPointObject(object);
}

export function isValueFlowEdge(edge: MappingEdge): boolean {
  return edge.relationType == null || edge.relationType === "value_flow";
}

export function clampConnectionCount(value: number | undefined, fallback = 2): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.max(2, Math.min(4, Math.floor(value)));
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

export function equipmentPortIds(equipment: Pick<EquipmentObject, "inCount" | "outCount">): { ins: string[]; outs: string[] } {
  const ins = Array.from({ length: Math.max(0, equipment.inCount) }, (_, index) => `IN_${index + 1}`);
  const outs = Array.from({ length: Math.max(0, equipment.outCount) }, (_, index) => `OUT_${index + 1}`);
  return { ins, outs };
}

export function hasEquipmentPort(equipment: Pick<EquipmentObject, "inCount" | "outCount">, portId: string): boolean {
  const ports = equipmentPortIds(equipment);
  return ports.ins.includes(portId) || ports.outs.includes(portId);
}

export function normalizePointObject(point: {
  id: string;
  name?: string;
  position?: { x: number; y: number };
  connectionCount?: number;
  connections?: Array<PointEnd | null>;
  a?: PointEnd | null;
  b?: PointEnd | null;
}): PointObject {
  const fromLegacy = point.connections ?? [point.a ?? null, point.b ?? null];
  const count = clampConnectionCount(point.connectionCount, Math.max(2, fromLegacy.length));
  return {
    kind: "point",
    id: point.id,
    name: (point.name ?? "").trim() || point.id,
    position: point.position ?? { x: 80, y: 420 },
    connectionCount: count,
    connections: Array.from({ length: count }, (_, index) => fromLegacy[index] ?? null),
  };
}

export function arrangementLinkId(pointId: string, end: string): string {
  return `arrlink:${pointId}:${end}`;
}

export function parseArrangementLinkId(edgeId: string): { pointId: string; end: string } | null {
  const match = /^arrlink:([^:]+):(C_\d+|a|b)$/.exec(edgeId);
  if (!match) return null;
  return { pointId: match[1]!, end: match[2]! };
}

type LegacyArrangement = {
  kind?: string;
  id?: string;
  name?: string;
  position?: { x: number; y: number };
  domain?: {
    equipment?: Array<{
      id: string;
      name?: string;
      symbolId?: string;
      inCount?: number;
      outCount?: number;
    }>;
    points?: Array<{
      id: string;
      name?: string;
      connectionCount?: number;
      connections?: Array<PointEnd | null>;
      a?: PointEnd | null;
      b?: PointEnd | null;
    }>;
  };
  view?: {
    elements?: Record<string, { x?: number; y?: number }>;
  };
};

export function explodeLegacyArrangement(object: LegacyArrangement): WorksheetObject[] {
  const origin = object.position ?? { x: 0, y: 0 };
  const elements = object.view?.elements ?? {};
  const equipment = (object.domain?.equipment ?? []).map((item) => {
    const view = elements[item.id] ?? {};
    return {
      kind: "equipment" as const,
      id: item.id,
      name: (item.name ?? "").trim() || item.id,
      position: { x: origin.x + (view.x ?? 0), y: origin.y + (view.y ?? 0) },
      symbolId: item.symbolId || "generic-equipment",
      inCount: item.inCount ?? 1,
      outCount: item.outCount ?? 1,
    };
  });
  const points = (object.domain?.points ?? []).map((item) => {
    const view = elements[item.id] ?? {};
    return normalizePointObject({
      ...item,
      position: { x: origin.x + (view.x ?? 0), y: origin.y + (view.y ?? 0) },
    });
  });
  return [...equipment, ...points];
}

export function normalizeLoadedProject(project: ProjectDocument): ProjectDocument {
  const objects: WorksheetObject[] = [];
  for (const object of project.objects as Array<WorksheetObject | LegacyArrangement>) {
    if (object && typeof object === "object" && ("domain" in object || object.kind === "arrangement")) {
      objects.push(...explodeLegacyArrangement(object as LegacyArrangement));
      continue;
    }
    if (object && typeof object === "object" && object.kind === "point") {
      objects.push(normalizePointObject(object as PointObject));
      continue;
    }
    objects.push(object as WorksheetObject);
  }
  return { ...project, objects };
}
