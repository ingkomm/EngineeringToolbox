import type { MappingEdge } from "../types/contract";
import { isValueFlowEdge } from "../lib/worksheet";

export function mappedInputsForObject(objectId: string, edges: MappingEdge[]): string[] {
  return edges
    .filter((edge) => edge.targetObjectId === objectId && edge.enabled !== false && isValueFlowEdge(edge))
    .map((edge) => edge.targetVariableId);
}
