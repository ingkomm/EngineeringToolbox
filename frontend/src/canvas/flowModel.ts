import type { ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import { inputHandleId, outputHandleId } from "../lib/display";
import { arrangementLinkId, isEquipmentObject, isPointObject, isValueFlowEdge, pointConnectionIds } from "../lib/worksheet";
import { mappedInputsForObject } from "./mappedInputs";

export { mappedInputsForObject } from "./mappedInputs";

export function toFlowNodeRecords(
  project: ProjectDocument,
  quantities: QuantitySpec[],
  onEdit: (edit: WorkspaceEdit) => void,
) {
  return project.objects.map((object) => {
    if (isEquipmentObject(object)) {
      return {
        id: object.id,
        type: "equipmentObject" as const,
        position: object.position,
        data: { object, onEdit },
        draggable: true,
      };
    }
    if (isPointObject(object)) {
      return {
        id: object.id,
        type: "pointObject" as const,
        position: object.position,
        data: { object, onEdit },
        draggable: true,
      };
    }
    return {
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
    };
  });
}

export function toFlowEdges(
  project: ProjectDocument,
  onToggle: (edgeId: string) => void,
  onToggleCollapsed: (edgeId: string) => void,
) {
  const objects = new Map(project.objects.map((item) => [item.id, item]));
  const mapping = project.edges.map((edge) => {
    const source = objects.get(edge.sourceObjectId);
    const target = objects.get(edge.targetObjectId);
    const collapsed = edge.collapsed === true;
    const association = !isValueFlowEdge(edge);
    const sourceHandle = source && isPointObject(source) ? undefined : outputHandleId(edge.sourceVariableId);
    const targetHandle = target && isPointObject(target) ? undefined : inputHandleId(edge.targetVariableId);
    return {
      id: edge.id,
      source: edge.sourceObjectId,
      target: edge.targetObjectId,
      sourceHandle,
      targetHandle,
      type: "mapping" as const,
      className: [
        "mapping-edge",
        edge.enabled === false ? "mapping-edge--off" : "",
        collapsed ? "mapping-edge--collapsed" : "",
        association ? "mapping-edge--association" : "",
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

  const links = project.objects.flatMap((object) => {
    if (!isPointObject(object)) return [];
    return pointConnectionIds(object.connectionCount).flatMap((endId, index) => {
      const end = object.connections[index];
      if (!end) return [];
      const host = objects.get(end.equipmentId);
      if (!host || !isEquipmentObject(host)) return [];
      return [
        {
          id: arrangementLinkId(object.id, endId),
          source: object.id,
          target: end.equipmentId,
          sourceHandle: endId,
          targetHandle: end.portId,
          type: "arrangementLink" as const,
          className: "arr-point-link-edge",
          interactionWidth: 20,
          data: { pointId: object.id, end: endId },
        },
      ];
    });
  });

  return [...mapping, ...links];
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
      ...record,
      data: record.data,
      selected: existing.selected,
      position: existing.dragging ? existing.position : record.position,
    };
  });
}
