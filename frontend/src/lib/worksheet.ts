import type { ArrangementObject, CalculationObject, MappingEdge, WorksheetObject } from "../types/contract";

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
    valves: [],
    points: [],
    pipes: [],
    signals: [],
    annotations: [],
  };
}

export function defaultElementView(
  x: number,
  y: number,
  width = 96,
  height = 64,
): ArrangementObject["view"]["elements"][string] {
  return { x, y, width, height, rotation: 0, zIndex: 0, visible: true };
}

export function arrangementNodeIds(object: ArrangementObject): Set<string> {
  return new Set([
    ...object.domain.equipment.map((item) => item.id),
    ...object.domain.valves.map((item) => item.id),
    ...object.domain.points.map((item) => item.id),
  ]);
}

export function arrangementElementIds(object: ArrangementObject): Set<string> {
  return new Set([
    ...arrangementNodeIds(object),
    ...object.domain.pipes.map((item) => item.id),
    ...object.domain.signals.map((item) => item.id),
    ...object.domain.annotations.map((item) => item.id),
  ]);
}
