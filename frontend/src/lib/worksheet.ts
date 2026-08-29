import type {
  ArrangementEquipment,
  ArrangementObject,
  CalculationObject,
  MappingEdge,
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
