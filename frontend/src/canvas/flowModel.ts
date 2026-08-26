import type { MappingEdge, ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import { inputHandleId, outputHandleId } from "../lib/display";

export function mappedInputsForObject(objectId: string, edges: MappingEdge[]): string[] {
  return edges
    .filter((edge) => edge.targetObjectId === objectId && edge.enabled !== false)
    .map((edge) => edge.targetVariableId);
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
      project,
      mappedInputIds: mappedInputsForObject(object.id, project.edges),
      quantities,
      onEdit,
    },
    draggable: true,
  }));
}

export function toFlowEdges(
  project: ProjectDocument,
  onToggle: (edgeId: string) => void,
  onToggleCollapsed: (edgeId: string) => void,
) {
  const objects = new Map(project.objects.map((item) => [item.id, item]));
  return project.edges.map((edge) => {
    const source = objects.get(edge.sourceObjectId);
    const target = objects.get(edge.targetObjectId);
    const collapsed = edge.collapsed === true;
    return {
      id: edge.id,
      source: edge.sourceObjectId,
      target: edge.targetObjectId,
      sourceHandle: outputHandleId(edge.sourceVariableId),
      targetHandle: inputHandleId(edge.targetVariableId),
      type: "mapping" as const,
      className: [
        "mapping-edge",
        edge.enabled === false ? "mapping-edge--off" : "",
        collapsed ? "mapping-edge--collapsed" : "",
      ]
        .filter(Boolean)
        .join(" "),
      interactionWidth: collapsed ? 0 : 20,
      data: {
        enabled: edge.enabled !== false,
        collapsed,
        sourceObjectId: source?.id ?? edge.sourceObjectId,
        sourceObjectName: source?.name ?? edge.sourceObjectId,
        targetObjectId: target?.id ?? edge.targetObjectId,
        targetObjectName: target?.name ?? edge.targetObjectId,
        onToggle,
        onToggleCollapsed,
      },
    };
  });
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
