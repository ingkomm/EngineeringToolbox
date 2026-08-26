import type { MappingEdge, ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import { inputHandleId, outputHandleId } from "../lib/display";

export function mappedInputsForObject(objectId: string, edges: MappingEdge[]): string[] {
  return edges.filter((edge) => edge.targetObjectId === objectId).map((edge) => edge.targetVariableId);
}

export function toFlowNodeRecords(
  project: ProjectDocument,
  quantities: QuantitySpec[],
  onEdit: (edit: WorkspaceEdit) => void,
) {
  return project.objects.map((object) => ({
    id: object.id,
    type: "calculationObject" as const,
    position: object.position,
    data: {
      object,
      mappedInputIds: mappedInputsForObject(object.id, project.edges),
      quantities,
      onEdit,
    },
    draggable: true,
  }));
}

export function toFlowEdges(edges: MappingEdge[]) {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceObjectId,
    target: edge.targetObjectId,
    sourceHandle: outputHandleId(edge.sourceVariableId),
    targetHandle: inputHandleId(edge.targetVariableId),
    type: "smoothstep" as const,
    className: "mapping-edge",
    label: `${edge.sourceVariableId} → ${edge.targetVariableId}`,
  }));
}

export function mergeFlowNodes<T extends { id: string; data: unknown; position: { x: number; y: number } }>(
  current: Array<T & { dragging?: boolean; selected?: boolean }>,
  next: T[],
): Array<T & { dragging?: boolean; selected?: boolean }> {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return next.map((record) => {
    const existing = currentById.get(record.id);
    if (!existing) return record;
    return {
      ...existing,
      data: record.data,
      selected: existing.selected,
      position: existing.dragging ? existing.position : record.position,
    };
  });
}
