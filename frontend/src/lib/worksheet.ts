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

/** Object-to-object association (Calculation ↔ Equipment/Point) attaches here. */
export const OBJECT_LINK_HANDLE = "OBJ";

/** Fixed Point piping ends: left, right, bottom. */
export const POINT_CONNECTION_IDS = ["C_1", "C_2", "C_3"] as const;
export const POINT_CONNECTION_COUNT = POINT_CONNECTION_IDS.length;

export type PointConnectionSide = "left" | "right" | "bottom";

export function clampConnectionCount(_value?: number): number {
  return POINT_CONNECTION_COUNT;
}

export function pointConnectionIds(_count?: number): string[] {
  return [...POINT_CONNECTION_IDS];
}

export function pointConnectionSide(end: string): PointConnectionSide {
  if (end === "C_2" || end === "b") return "right";
  if (end === "C_3") return "bottom";
  return "left";
}

export function parsePointConnectionEnd(end: string): number | null {
  if (end === "a") return 0;
  if (end === "b") return 1;
  const index = POINT_CONNECTION_IDS.indexOf(end as (typeof POINT_CONNECTION_IDS)[number]);
  return index >= 0 ? index : null;
}

export function isObjectLinkHandle(portId: string | null | undefined): boolean {
  return portId === OBJECT_LINK_HANDLE;
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

export function isLayoutPortId(portId: string | null | undefined): boolean {
  return Boolean(portId && (/^(IN|OUT)_\d+$/.test(portId) || parsePointConnectionEnd(portId) != null));
}

export function normalizePointEnd(end: {
  objectId?: string;
  equipmentId?: string;
  portId?: string;
  reversed?: boolean;
} | null | undefined): PointEnd | null {
  if (!end) return null;
  const objectId = end.objectId ?? end.equipmentId;
  if (!objectId || !end.portId) return null;
  return { objectId, portId: end.portId, reversed: end.reversed === true };
}

export function layoutPortExists(object: WorksheetObject, portId: string): boolean {
  if (isObjectLinkHandle(portId) || portId === object.id) return isLayoutObject(object);
  if (isEquipmentObject(object)) {
    return hasEquipmentPort(object, portId);
  }
  if (isPointObject(object)) {
    return parsePointConnectionEnd(portId) != null;
  }
  return false;
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
  return {
    kind: "point",
    id: point.id,
    name: (point.name ?? "").trim() || point.id,
    position: point.position ?? { x: 80, y: 420 },
    connectionCount: POINT_CONNECTION_COUNT,
    connections: POINT_CONNECTION_IDS.map((_, index) => normalizePointEnd(fromLegacy[index] ?? null)),
  };
}

export function arrangementLinkId(pointId: string, end: string): string {
  return `arrlink:${pointId}:${end}`;
}

export function parseArrangementLinkId(edgeId: string): { pointId: string; end: string } | null {
  const match = /^arrlink:([^:]+):(C_[123]|a|b)$/.exec(edgeId);
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
  const objectIds = new Set(objects.map((item) => item.id));
  const layoutIds = new Set(objects.filter(isLayoutObject).map((item) => item.id));
  const normalized = objects.map((object) => {
    if (!isCalculationObject(object)) return object;
    return {
      ...object,
      links: (object.links ?? []).map((link) =>
        link.targetObjectId && layoutIds.has(link.targetObjectId)
          ? { ...link, targetPortId: OBJECT_LINK_HANDLE }
          : link,
      ),
    };
  });
  return {
    ...project,
    objects: normalized,
    edges: project.edges.map((edge) => {
      if (isValueFlowEdge(edge)) return edge;
      if (layoutIds.has(edge.targetObjectId) && objectIds.has(edge.sourceObjectId)) {
        return { ...edge, targetVariableId: OBJECT_LINK_HANDLE };
      }
      return edge;
    }),
  };
}
