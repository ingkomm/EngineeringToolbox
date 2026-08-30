import { MarkerType } from "@xyflow/react";
import type { ProjectDocument } from "../types/contract";
import type { WorkspaceEdit } from "../lib/projectEdits";
import type { QuantitySpec } from "../lib/quantities";
import { inputHandleId, outputHandleId } from "../lib/display";
import {
  OBJECT_LINK_HANDLE,
  arrangementLinkId,
  isArrangementPipeEdge,
  isAssociationEdge,
  isCalculationObject,
  isLayoutObject,
  isLayoutPortId,
  isObjectLinkHandle,
  isPointObject,
  pointConnectionIds,
} from "../lib/worksheet";
import { isMemoObject, memoLinkEdgeId, MEMO_ATTACHMENT_HANDLE, MEMO_RECEIVE_HANDLE } from "../lib/memo";
import { mappedInputsForObject } from "./mappedInputs";
import { equipmentBounds } from "../lib/arrangementView";
import { LAYOUT_NODE_ORIGIN, POINT_NODE_SIZE, toCenterPosition } from "./symbols/grid";

export { mappedInputsForObject } from "./mappedInputs";

export function toFlowNodeRecords(
  project: ProjectDocument,
  quantities: QuantitySpec[],
  onEdit: (edit: WorkspaceEdit) => void,
) {
  return project.objects.map((object) => {
    if (isMemoObject(object)) {
      return {
        id: object.id,
        type: "memoObject" as const,
        origin: [0, 0] as [number, number],
        position: object.position,
        data: { object, onEdit },
        draggable: true,
        style: { width: object.size.width },
        width: object.size.width,
      };
    }
    if (isLayoutObject(object) && !isCalculationObject(object)) {
      const bounds = object.kind === "equipment" ? equipmentBounds(object) : { width: POINT_NODE_SIZE, height: POINT_NODE_SIZE };
      const height = bounds.height;
      return {
        id: object.id,
        type: object.kind === "equipment" ? ("equipmentObject" as const) : ("pointObject" as const),
        position: toCenterPosition(object.position, bounds.width, height),
        origin: LAYOUT_NODE_ORIGIN,
        data: { object, onEdit },
        draggable: true,
        style: { width: bounds.width, height, background: "transparent" },
        width: bounds.width,
        height,
      };
    }
    return {
      id: object.id,
      type: "calculationObject" as const,
      origin: [0, 0] as [number, number],
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
    return OBJECT_LINK_HANDLE;
  }
  if (source && isLayoutObject(source)) {
    if (isObjectLinkHandle(variableId) || variableId === source.id) return OBJECT_LINK_HANDLE;
    return isLayoutPortId(variableId) ? variableId : undefined;
  }
  return outputHandleId(variableId);
}

function mappingTargetHandle(
  target: ProjectDocument["objects"][number] | undefined,
  variableId: string,
): string | undefined {
  if (target && isLayoutObject(target)) {
    if (isObjectLinkHandle(variableId) || variableId === target.id) return OBJECT_LINK_HANDLE;
    return isLayoutPortId(variableId) ? variableId : undefined;
  }
  if (target && isCalculationObject(target) && (target.links ?? []).some((item) => item.id === variableId)) {
    return OBJECT_LINK_HANDLE;
  }
  return inputHandleId(variableId);
}

export function toFlowEdges(
  project: ProjectDocument,
  onToggle: (edgeId: string) => void,
  onToggleCollapsed: (edgeId: string) => void,
  onToggleDirection?: (pointId: string, end: string) => void,
  onEdit?: (edit: WorkspaceEdit) => void,
) {
  const objects = new Map(project.objects.map((item) => [item.id, item]));
  const mapping = project.edges.map((edge) => {
    const source = objects.get(edge.sourceObjectId);
    const target = objects.get(edge.targetObjectId);
    const collapsed = edge.collapsed === true;
    const association = isAssociationEdge(edge);
    const pipe = isArrangementPipeEdge(edge);
    if (pipe) {
      return {
        id: edge.id,
        source: edge.sourceObjectId,
        target: edge.targetObjectId,
        sourceHandle: mappingSourceHandle(source, edge.sourceVariableId),
        targetHandle: mappingTargetHandle(target, edge.targetVariableId),
        type: "arrangementLink" as const,
        className: `arr-point-link-edge arr-point-link-edge--${edge.relationType}`,
        interactionWidth: 20,
        data: {
          pointId: "",
          end: "",
          linkKind: edge.relationType === "signal" ? "signal" : "pipe",
          showArrow: false,
          waypoints: [],
          onToggleDirection,
          onEdit,
        },
      };
    }
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
        sourceObjectName: source && "name" in source ? source.name : edge.sourceObjectId,
        targetObjectId: target?.id ?? edge.targetObjectId,
        targetObjectName: target && "name" in target ? target.name : edge.targetObjectId,
        onToggle,
        onToggleCollapsed,
      },
    };
  });

  const links = project.objects.flatMap((object) => {
    if (!isPointObject(object)) return [];
    return pointConnectionIds().flatMap((endId, index) => {
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
          className: `arr-point-link-edge arr-point-link-edge--${end.linkKind === "signal" ? "signal" : "pipe"}`,
          interactionWidth: 20,
          markerEnd: end.showArrow
            ? {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
                color: end.linkKind === "signal" ? "#9aa8b8" : "#7f93a8",
              }
            : undefined,
          data: {
            pointId: object.id,
            end: endId,
            reversed,
            linkKind: end.linkKind === "signal" ? "signal" : "pipe",
            showArrow: end.showArrow === true,
            waypoints: end.waypoints ?? [],
            onToggleDirection,
            onEdit,
          },
        },
      ];
    });
  });

  const memoLinks = project.objects.flatMap((object) => {
    if (!isMemoObject(object)) return [];
    return object.links
      .filter((link) => objects.has(link.targetObjectId))
      .map((link) => ({
        id: memoLinkEdgeId(link.id),
        source: object.id,
        target: link.targetObjectId,
        sourceHandle: MEMO_ATTACHMENT_HANDLE,
        targetHandle: MEMO_RECEIVE_HANDLE,
        type: "memoLink" as const,
        className: "memo-link-edge",
        interactionWidth: 16,
        data: {},
      }));
  });

  return [...mapping, ...links, ...memoLinks];
}

export function mergeFlowNodes<T extends { id: string; data: unknown; position: { x: number; y: number } }>(
  current: Array<T & { dragging?: boolean; selected?: boolean; width?: number; style?: { width?: number | string } }>,
  next: T[],
): Array<T & { dragging?: boolean; selected?: boolean; width?: number; style?: { width?: number | string } }> {
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
