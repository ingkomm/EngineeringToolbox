import { MarkerType } from "@xyflow/react";
import type { ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import { inputHandleId, linkHandleId, outputHandleId } from "../lib/display";
import {
  arrangementLinkId,
  isCalculationObject,
  isLayoutObject,
  isLayoutPortId,
  isPointObject,
  isValueFlowEdge,
  pointConnectionIds,
} from "../lib/worksheet";
import { mappedInputsForObject } from "./mappedInputs";

export { mappedInputsForObject } from "./mappedInputs";

export function toFlowNodeRecords(
  project: ProjectDocument,
  quantities: QuantitySpec[],
  onEdit: (edit: WorkspaceEdit) => void,
) {
  return project.objects.map((object) => {
    if (isLayoutObject(object) && !isCalculationObject(object)) {
      return {
        id: object.id,
        type: object.kind === "equipment" ? ("equipmentObject" as const) : ("pointObject" as const),
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

function mappingSourceHandle(
  source: ProjectDocument["objects"][number] | undefined,
  variableId: string,
): string | undefined {
  if (source && isCalculationObject(source) && (source.links ?? []).some((item) => item.id === variableId)) {
    return linkHandleId(variableId);
  }
  if (source && isLayoutObject(source)) {
    return isLayoutPortId(variableId) ? variableId : undefined;
  }
  return outputHandleId(variableId);
}

function mappingTargetHandle(
  target: ProjectDocument["objects"][number] | undefined,
  variableId: string,
): string | undefined {
  if (target && isLayoutObject(target)) {
    return isLayoutPortId(variableId) ? variableId : undefined;
  }
  return inputHandleId(variableId);
}

export function toFlowEdges(
  project: ProjectDocument,
  onToggle: (edgeId: string) => void,
  onToggleCollapsed: (edgeId: string) => void,
  onToggleDirection?: (pointId: string, end: string) => void,
) {
  const objects = new Map(project.objects.map((item) => [item.id, item]));
  const mapping = project.edges.map((edge) => {
    const source = objects.get(edge.sourceObjectId);
    const target = objects.get(edge.targetObjectId);
    const collapsed = edge.collapsed === true;
    const association = !isValueFlowEdge(edge);
    return {
      id: edge.id,
      source: edge.sourceObjectId,
      target: edge.targetObjectId,
      sourceHandle: mappingSourceHandle(source, edge.sourceVariableId),
      targetHandle: mappingTargetHandle(target, edge.targetVariableId),
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
      const host = objects.get(end.objectId);
      if (!host) return [];
      const reversed = end.reversed === true;
      const source = reversed ? end.objectId : object.id;
      const target = reversed ? object.id : end.objectId;
      const sourceHandle = reversed
        ? isLayoutPortId(end.portId)
          ? end.portId
          : undefined
        : endId;
      const targetHandle = reversed
        ? endId
        : isLayoutPortId(end.portId)
          ? end.portId
          : undefined;
      return [
        {
          id: arrangementLinkId(object.id, endId),
          source,
          target,
          sourceHandle,
          targetHandle,
          type: "arrangementLink" as const,
          className: "arr-point-link-edge",
          interactionWidth: 20,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: "#6cb6ff",
          },
          data: {
            pointId: object.id,
            end: endId,
            reversed,
            onToggleDirection,
          },
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
