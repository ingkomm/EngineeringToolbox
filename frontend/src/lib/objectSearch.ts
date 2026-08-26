import type { CalculationObject, MappingEdge, ProjectDocument } from "../types/contract";
import { displayName } from "./variables";

export interface PortSearchHit {
  objectId: string;
  objectName: string;
  variableId: string;
  variableName: string;
  kind: "input" | "output";
  createInput?: boolean;
}

export function matchesObjectQuery(object: CalculationObject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return object.id.toLowerCase().includes(needle) || object.name.toLowerCase().includes(needle);
}

export function occupiedInputKeys(edges: MappingEdge[]): Set<string> {
  return new Set(edges.map((edge) => `${edge.targetObjectId}::${edge.targetVariableId}`));
}

export function searchTargetPorts(
  project: ProjectDocument,
  query: string,
  selfObjectId: string,
): PortSearchHit[] {
  const occupied = occupiedInputKeys(project.edges);
  const hits: PortSearchHit[] = [];
  for (const object of project.objects) {
    if (object.id === selfObjectId || !matchesObjectQuery(object, query)) continue;
    const free = object.inputs.filter((item) => !occupied.has(`${object.id}::${item.id}`));
    if (free.length === 0) {
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: "",
        variableName: "새 Input으로 연결",
        kind: "input",
        createInput: true,
      });
      continue;
    }
    for (const item of free) {
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: item.id,
        variableName: displayName(item),
        kind: "input",
      });
    }
  }
  return hits;
}

export function searchSourcePorts(
  project: ProjectDocument,
  query: string,
  selfObjectId: string,
): PortSearchHit[] {
  const hits: PortSearchHit[] = [];
  for (const object of project.objects) {
    if (object.id === selfObjectId || !matchesObjectQuery(object, query)) continue;
    for (const item of object.outputs) {
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: item.id,
        variableName: displayName(item),
        kind: "output",
      });
    }
  }
  return hits;
}
