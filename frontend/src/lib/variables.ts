import type { CalculationObject, MappingEdge, ProjectDocument } from "../types/contract";
import { isCalculationObject, isValueFlowEdge } from "./worksheet";

export function displayName(item: { id: string; name?: string | null }): string {
  const name = item.name?.trim();
  return name || item.id;
}

export function enabledMappedKeys(edges: MappingEdge[]): Set<string> {
  return new Set(
    edges
      .filter((edge) => edge.enabled !== false && isValueFlowEdge(edge))
      .map((edge) => `${edge.targetObjectId}::${edge.targetVariableId}`),
  );
}

export function isMappedInput(objectId: string, inputId: string, edges: MappingEdge[]): boolean {
  return enabledMappedKeys(edges).has(`${objectId}::${inputId}`);
}

export interface OwnedVariable {
  objectId: string;
  id: string;
  name: string;
}

export function ownedVariables(project: ProjectDocument): OwnedVariable[] {
  const mapped = enabledMappedKeys(project.edges);
  const owned: OwnedVariable[] = [];
  for (const object of project.objects) {
    if (!isCalculationObject(object)) continue;
    for (const item of object.calculations) {
      owned.push({ objectId: object.id, id: item.id, name: displayName(item) });
    }
    for (const item of object.inputs) {
      if (!mapped.has(`${object.id}::${item.id}`)) {
        owned.push({ objectId: object.id, id: item.id, name: displayName(item) });
      }
    }
  }
  return owned;
}

export function allVariableIds(project: ProjectDocument): string[] {
  return project.objects.flatMap((object) => {
    if (!isCalculationObject(object)) return [];
    return [...object.inputs, ...object.calculations].map((item) => item.id);
  });
}

export function identityTaken(
  project: ProjectDocument,
  candidate: { id?: string; name?: string },
  except?: { objectId: string; id: string },
): "id" | "name" | null {
  const owners = ownedVariables(project).filter(
    (item) => !(except && item.objectId === except.objectId && item.id === except.id),
  );
  if (candidate.id && owners.some((item) => item.id === candidate.id)) return "id";
  const name = candidate.name?.trim();
  if (name && owners.some((item) => item.name === name)) return "name";
  return null;
}

export function nextGlobalPrefixedId(project: ProjectDocument, prefix: string): string {
  const used = new Set(allVariableIds(project));
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

export function sourceVariable(
  object: CalculationObject,
  variableId: string,
): { id: string; name: string; quantity?: string | null; unit?: string | null; value?: number | null } | null {
  const found =
    object.calculations.find((item) => item.id === variableId) ??
    object.inputs.find((item) => item.id === variableId) ??
    object.outputs.find((item) => item.id === variableId);
  if (!found) return null;
  return {
    id: found.id,
    name: displayName(found),
    quantity: found.quantity,
    unit: found.unit,
    value: found.value,
  };
}
