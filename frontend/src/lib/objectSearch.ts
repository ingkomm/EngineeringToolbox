import type { CalculationObject, MappingEdge, ProjectDocument } from "../types/contract";
import { displayName } from "./variables";

export type PortLinkStatus = "connected" | "occupied" | "available" | "create";

export interface PortSearchHit {
  objectId: string;
  objectName: string;
  variableId: string;
  variableName: string;
  kind: "input" | "output";
  status: PortLinkStatus;
  createInput?: boolean;
  edgeId?: string;
}

export function matchesObjectQuery(object: CalculationObject, query: string): boolean {
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
  const hits: PortSearchHit[] = [];
  for (const object of project.objects) {
    if (object.id === selfObjectId || !matchesObjectQuery(object, query)) continue;
    let hasAvailable = false;
    for (const item of object.inputs) {
      const edge = inboundEdge(project.edges, object.id, item.id);
      let status: PortLinkStatus = "available";
      if (edge) {
        status =
          edge.sourceObjectId === selfObjectId && edge.sourceVariableId === selfVariableId
            ? "connected"
            : "occupied";
      } else if (outbound) {
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
      });
    }
    if (!hasAvailable && !outbound) {
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: "",
        variableName: "새 Input으로 연결",
        kind: "input",
        createInput: true,
        status: "create",
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
  const hits: PortSearchHit[] = [];
  for (const object of project.objects) {
    if (object.id === selfObjectId || !matchesObjectQuery(object, query)) continue;
    for (const item of object.outputs) {
      const outgoing = outboundEdge(project.edges, object.id, item.id);
      const connected =
        inbound != null &&
        inbound.sourceObjectId === object.id &&
        inbound.sourceVariableId === item.id;
      let status: PortLinkStatus = "available";
      if (connected) status = "connected";
      else if (inbound || outgoing) status = "occupied";
      hits.push({
        objectId: object.id,
        objectName: object.name,
        variableId: item.id,
        variableName: displayName(item),
        kind: "output",
        status,
        edgeId: connected ? inbound?.id : undefined,
      });
    }
  }
  return hits;
}
