import type { ProjectDocument, WorksheetObject } from "../types/contract";
import { isCalculationObject, isEquipmentObject, isPointObject, isValueFlowEdge } from "./worksheet";
import { isMemoObject, memosOf } from "./memo";

export type GraphKind = "memo" | "calculation" | "equipment" | "point" | "tag";

export interface GraphNode {
  id: string;
  kind: GraphKind;
  label: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "memo-attachment" | "hierarchy" | "tag" | "value-flow";
}

export function deriveKnowledgeGraph(project: ProjectDocument): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const tags = new Map<string, string>();

  for (const object of project.objects) {
    nodes.push({ id: object.id, kind: kindOf(object), label: labelOf(object) });
    if (isMemoObject(object)) {
      if (object.parentId) {
        edges.push({ id: `hier:${object.id}`, source: object.parentId, target: object.id, kind: "hierarchy" });
      }
      for (const link of object.links) {
        edges.push({ id: `memo:${link.id}`, source: object.id, target: link.targetObjectId, kind: "memo-attachment" });
      }
      for (const tag of object.tags) {
        const tagId = `tag:${tag.normalizedKey}`;
        tags.set(tag.normalizedKey, tag.label);
        edges.push({ id: `tag:${object.id}:${tag.normalizedKey}`, source: object.id, target: tagId, kind: "tag" });
      }
    }
  }
  for (const [key, label] of tags) {
    nodes.push({ id: `tag:${key}`, kind: "tag", label: `#${label}` });
  }
  for (const edge of project.edges) {
    if (!isValueFlowEdge(edge) || edge.enabled === false) continue;
    edges.push({
      id: `vf:${edge.id}`,
      source: edge.sourceObjectId,
      target: edge.targetObjectId,
      kind: "value-flow",
    });
  }
  return { nodes, edges };
}

export function hierarchyWindow(project: ProjectDocument, seedId: string, depth: number): Set<string> {
  const ids = new Set<string>([seedId]);
  const memos = memosOf(project);
  const byId = new Map(memos.map((item) => [item.id, item]));
  let cursor = byId.get(seedId)?.parentId;
  let up = 0;
  while (cursor && up < depth) {
    ids.add(cursor);
    cursor = byId.get(cursor)?.parentId;
    up += 1;
  }
  const walk = (parentId: string, remaining: number) => {
    if (remaining <= 0) return;
    for (const child of memos.filter((item) => item.parentId === parentId)) {
      ids.add(child.id);
      walk(child.id, remaining - 1);
    }
  };
  walk(seedId, depth);
  return ids;
}

export function knowledgeGraphDoesNotMutate(project: ProjectDocument): ProjectDocument {
  const snapshot = JSON.stringify(project);
  deriveKnowledgeGraph(project);
  if (JSON.stringify(project) !== snapshot) {
    throw new Error("knowledge graph mutated project");
  }
  return project;
}

function kindOf(object: WorksheetObject): GraphKind {
  if (isMemoObject(object)) return "memo";
  if (isEquipmentObject(object)) return "equipment";
  if (isPointObject(object)) return "point";
  if (isCalculationObject(object)) return "calculation";
  return "memo";
}

function labelOf(object: WorksheetObject): string {
  if (object.kind === "memo") return object.title?.trim() || object.id;
  return object.name;
}

export { memosOf };
