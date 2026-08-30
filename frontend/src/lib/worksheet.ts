import type {
  EquipmentObject,
  PointEnd,
  PointObject,
  CalculationObject,
  MappingEdge,
  ObjectLinkSide,
  ProjectDocument,
  WorksheetObject,
} from "../types/contract";
import { defaultSymbolLibrary } from "../canvas/symbols/library";
import { isMemoObject, normalizeMemo } from "./memo";

export type { ObjectLinkSide };

export function isCalculationObject(object: WorksheetObject): object is CalculationObject {
  return object.kind !== "equipment" && object.kind !== "point" && object.kind !== "memo";
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

export function isAssociationEdge(edge: MappingEdge): boolean {
  return edge.relationType === "association";
}

export function isArrangementPipeEdge(edge: MappingEdge): boolean {
  return edge.relationType === "pipe" || edge.relationType === "signal";
}

export function firstFreePointEnd(point: PointObject): string {
  const index = point.connections.findIndex((end) => !end);
  return POINT_CONNECTION_IDS[index >= 0 ? index : 0] ?? "C_1";
}

export function resolveLayoutPort(
  object: WorksheetObject,
  handleId: string | null | undefined,
  role: "source" | "target",
  otherHandle?: string | null,
): string | null {
  if (isObjectLinkHandle(handleId)) return null;
  if (handleId && layoutPortExists(object, handleId) && isLayoutPortId(handleId)) return handleId;
  if (isPointObject(object)) return firstFreePointEnd(object);
  if (isEquipmentObject(object)) {
    const ports = equipmentPortIds(object);
    if (role === "source") return ports.outs[0] ?? ports.ins[0] ?? null;
    if (otherHandle?.startsWith("OUT_")) return ports.ins[0] ?? ports.outs[0] ?? null;
    if (otherHandle?.startsWith("IN_")) return ports.outs[0] ?? ports.ins[0] ?? null;
    return ports.ins[0] ?? ports.outs[0] ?? null;
  }
  return null;
}

/** Object-to-object association (Calculation ↔ Equipment/Point) attaches here. */
export const OBJECT_LINK_HANDLE = "OBJ";

export function objectLinkSideOf(object: { objectLinkSide?: ObjectLinkSide | null }): ObjectLinkSide {
  return object.objectLinkSide === "bottom" ? "bottom" : "top";
}

export function isObjectLinkHandle(portId: string | null | undefined): boolean {
  return portId === OBJECT_LINK_HANDLE;
}

export function connectedObjectLinks(project: ProjectDocument): Array<{
  calcId: string;
  linkId: string;
  layoutId: string;
}> {
  const links: Array<{ calcId: string; linkId: string; layoutId: string }> = [];
  for (const object of project.objects) {
    if (!isCalculationObject(object)) continue;
    for (const link of object.links ?? []) {
      if (link.targetObjectId) {
        links.push({ calcId: object.id, linkId: link.id, layoutId: link.targetObjectId });
      }
    }
  }
  return links;
}

/** One yellow object-link per layout object. One Calculation may link to many Equipment/Points. */
export function canConnectObjectLink(
  project: ProjectDocument,
  calcId: string,
  layoutId: string,
  linkId?: string | null,
): boolean {
  if (!layoutId || calcId === layoutId) return false;
  const layout = project.objects.find((item) => item.id === layoutId);
  if (!layout || !isLayoutObject(layout)) return false;
  for (const item of connectedObjectLinks(project)) {
    if (linkId && item.calcId === calcId && item.linkId === linkId) continue;
    if (item.layoutId === layoutId) return false;
  }
  return true;
}

/** Fixed Point piping ends: west, east, south, north. */
export const POINT_CONNECTION_IDS = ["C_1", "C_2", "C_3", "C_4"] as const;
export const POINT_CONNECTION_COUNT = POINT_CONNECTION_IDS.length;

export type PointConnectionSide = "left" | "right" | "bottom" | "top";

export function clampConnectionCount(_value?: number): number {
  return POINT_CONNECTION_COUNT;
}

export function pointConnectionIds(_count?: number): string[] {
  return [...POINT_CONNECTION_IDS];
}

export function pointConnectionSide(end: string): PointConnectionSide {
  if (end === "C_2" || end === "b") return "right";
  if (end === "C_3") return "bottom";
  if (end === "C_4") return "top";
  return "left";
}

export function parsePointConnectionEnd(end: string): number | null {
  if (end === "a") return 0;
  if (end === "b") return 1;
  const index = POINT_CONNECTION_IDS.indexOf(end as (typeof POINT_CONNECTION_IDS)[number]);
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

export function isLayoutPortId(portId: string | null | undefined): boolean {
  return Boolean(portId && (/^(IN|OUT)_\d+$/.test(portId) || parsePointConnectionEnd(portId) != null));
}

export function normalizePointEnd(end: {
  objectId?: string;
  equipmentId?: string;
  portId?: string;
  reversed?: boolean;
  linkKind?: "pipe" | "signal";
  showArrow?: boolean;
  waypoints?: Array<{ x: number; y: number }>;
} | null | undefined): PointEnd | null {
  if (!end) return null;
  const objectId = end.objectId ?? end.equipmentId;
  if (!objectId || !end.portId) return null;
  const next: PointEnd = { objectId, portId: end.portId, reversed: end.reversed === true };
  if (end.linkKind === "signal" || end.linkKind === "pipe") next.linkKind = end.linkKind;
  if (end.showArrow === true) next.showArrow = true;
  if (end.waypoints?.length) next.waypoints = end.waypoints;
  return next;
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
  objectLinkSide?: ObjectLinkSide | null;
}): PointObject {
  const fromLegacy = point.connections ?? [point.a ?? null, point.b ?? null];
  return {
    kind: "point",
    id: point.id,
    name: (point.name ?? "").trim() || point.id,
    position: point.position ?? { x: 80, y: 420 },
    connectionCount: POINT_CONNECTION_COUNT,
    connections: POINT_CONNECTION_IDS.map((_, index) => normalizePointEnd(fromLegacy[index] ?? null)),
    objectLinkSide: point.objectLinkSide === "bottom" ? "bottom" : "top",
  };
}

export function arrangementLinkId(pointId: string, end: string): string {
  return `arrlink:${pointId}:${end}`;
}

export function parseArrangementLinkId(edgeId: string): { pointId: string; end: string } | null {
  const match = /^arrlink:([^:]+):(C_[1-4]|a|b)$/.exec(edgeId);
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
    if (object && typeof object === "object" && object.kind === "memo") {
      objects.push(object as WorksheetObject);
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
    if (isMemoObject(object)) return normalizeMemo(object, objectIds);
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
    symbolLibrary: project.symbolLibrary ?? defaultSymbolLibrary(),
    symbolCategories: project.symbolCategories ?? [],
    objects: normalized,
    edges: project.edges.map((edge) => {
      if (!isAssociationEdge(edge)) return edge;
      if (layoutIds.has(edge.targetObjectId) && objectIds.has(edge.sourceObjectId)) {
        return { ...edge, targetVariableId: OBJECT_LINK_HANDLE };
      }
      return edge;
    }),
  };
}
