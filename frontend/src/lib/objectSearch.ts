import type { MappingEdge, ProjectDocument, WorksheetObject } from "../types/contract";
import { displayName } from "./variables";
import {
  equipmentPortIds,
  isCalculationObject,
  isEquipmentObject,
  isLayoutObject,
  isPointObject,
  isValueFlowEdge,
  pointConnectionIds,
} from "./worksheet";

export type PortLinkStatus = "connected" | "occupied" | "available" | "create";

export interface PortSearchHit {
  objectId: string;
  objectName: string;
  variableId: string;
  variableName: string;
  kind: "input" | "output" | "point" | "equipment";
  status: PortLinkStatus;
  createInput?: boolean;
  edgeId?: string;
  relationType?: "value_flow" | "association";
}

export function matchesObjectQuery(object: Pick<WorksheetObject, "id" | "name">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return object.id.toLowerCase().includes(needle) || object.name.toLowerCase().includes(needle);
}

function inboundEdge(
  edges: MappingEdge[],
  objectId: string,
  variableId: string,
): MappingEdge | undefined {
  return edges.find((edge) => edge.targetObjectId === objectId && edge.targetVariableId === variableId);
}

function outboundEdge(
  edges: MappingEdge[],
  objectId: string,
  variableId: string,
): MappingEdge | undefined {
  return edges.find((edge) => edge.sourceObjectId === objectId && edge.sourceVariableId === variableId);
}

export function searchTargetPorts(
  project: ProjectDocument,
  query: string,
  selfObjectId: string,
  selfVariableId: string,
): PortSearchHit[] {
  const outbound = outboundEdge(project.edges, selfObjectId, selfVariableId);
  const outboundValue = outbound != null && isValueFlowEdge(outbound);
  const hits: PortSearchHit[] = [];
  for (const object of project.objects) {
    if (object.id === selfObjectId || !matchesObjectQuery(object, query)) continue;
    if (isLayoutObject(object)) {
      const edge =
        inboundEdge(project.edges, object.id, object.id) ??
        project.edges.find((item) => item.targetObjectId === object.id && item.sourceObjectId === selfObjectId && item.sourceVariableId === selfVariableId);
      const connected = edge != null && edge.sourceObjectId === selfObjectId && edge.sourceVariableId === selfVariableId;
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: object.id,
        variableName: displayName(object),
        kind: isPointObject(object) ? "point" : "equipment",
        status: connected ? "connected" : "available",
        edgeId: connected ? edge?.id : undefined,
        relationType: "association",
      });
      continue;
    }
    if (!isCalculationObject(object)) continue;
    let hasAvailable = false;
    for (const item of object.inputs) {
      const edge = inboundEdge(project.edges, object.id, item.id);
      let status: PortLinkStatus = "available";
      if (edge && isValueFlowEdge(edge)) {
        status =
          edge.sourceObjectId === selfObjectId && edge.sourceVariableId === selfVariableId
            ? "connected"
            : "occupied";
      } else if (outboundValue) {
        status = "occupied";
      } else {
        hasAvailable = true;
      }
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: item.id,
        variableName: displayName(item),
        kind: "input",
        status,
        edgeId: status === "connected" ? edge?.id : undefined,
        relationType: "value_flow",
      });
    }
    if (!hasAvailable && !outboundValue) {
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: "",
        variableName: "새 Input으로 연결",
        kind: "input",
        createInput: true,
        status: "create",
        relationType: "value_flow",
      });
    }
  }
  return hits;
}

/** Layout ports a Calculation Object Link can attach to (dashed association). */
export function searchLayoutTargets(
  project: ProjectDocument,
  query: string,
  selfObjectId: string,
  selfVariableId: string,
): PortSearchHit[] {
  const outbound = project.edges.find(
    (edge) =>
      edge.sourceObjectId === selfObjectId &&
      edge.sourceVariableId === selfVariableId &&
      !isValueFlowEdge(edge),
  );
  const hits: PortSearchHit[] = [];
  const needle = query.trim().toLowerCase();
  for (const object of project.objects) {
    if (!isLayoutObject(object)) continue;
    const ports = isEquipmentObject(object)
      ? [object.id, ...equipmentPortIds(object).ins, ...equipmentPortIds(object).outs]
      : [object.id, ...pointConnectionIds(object.connectionCount)];
    const objectMatch = matchesObjectQuery(object, query);
    if (needle && !objectMatch && !ports.some((port) => port.toLowerCase().includes(needle))) {
      continue;
    }
    for (const port of ports) {
      if (needle && !objectMatch && !port.toLowerCase().includes(needle)) continue;
      const connected =
        outbound != null && outbound.targetObjectId === object.id && outbound.targetVariableId === port;
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: port,
        variableName: port === object.id ? displayName(object) : port,
        kind: isPointObject(object) ? "point" : "equipment",
        status: connected ? "connected" : "available",
        edgeId: connected ? outbound?.id : undefined,
        relationType: "association",
      });
    }
  }
  return hits;
}

export function searchSourcePorts(
  project: ProjectDocument,
  query: string,
  selfObjectId: string,
  selfVariableId: string,
): PortSearchHit[] {
  const inbound = inboundEdge(project.edges, selfObjectId, selfVariableId);
  const inboundValue = inbound != null && isValueFlowEdge(inbound);
  const hits: PortSearchHit[] = [];
  for (const object of project.objects) {
    if (object.id === selfObjectId || !matchesObjectQuery(object, query)) continue;
    if (isPointObject(object)) {
      const outgoing = outboundEdge(project.edges, object.id, object.id);
      const connected =
        inbound != null &&
        inbound.sourceObjectId === object.id &&
        inbound.sourceVariableId === object.id;
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: object.id,
        variableName: displayName(object),
        kind: "point",
        status: connected ? "connected" : "available",
        edgeId: connected ? inbound?.id : undefined,
        relationType: "association",
      });
      void outgoing;
      continue;
    }
    if (!isCalculationObject(object)) continue;
    for (const item of object.outputs) {
      const outgoing = outboundEdge(project.edges, object.id, item.id);
      const outgoingValue = outgoing != null && isValueFlowEdge(outgoing);
      const connected =
        inbound != null &&
        inbound.sourceObjectId === object.id &&
        inbound.sourceVariableId === item.id;
      let status: PortLinkStatus = "available";
      if (connected) status = "connected";
      else if (inboundValue || outgoingValue) status = "occupied";
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: item.id,
        variableName: displayName(item),
        kind: "output",
        status,
        edgeId: connected ? inbound?.id : undefined,
        relationType: "value_flow",
      });
    }
  }
  return hits;
}
