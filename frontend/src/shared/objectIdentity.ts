import type { ProjectDocument } from "./document";
import { isMemoObject } from "../memo/memo";
import { isCalculationObject, isLayoutObject, isPointObject } from "./worksheet";
import { findLibrarySymbol } from "../arrangement/symbols/library";
import { POINT_NODE_SIZE, snapCenteredTopLeft } from "./grid";

export function objectDisplayName(item: ProjectDocument["objects"][number]): string {
  return isMemoObject(item) ? item.title : item.name;
}

export function nextObjectId(project: ProjectDocument): string {
  const used = new Set(project.objects.map((item) => item.id));
  let n = 1;
  while (used.has(`obj_${n}`)) n += 1;
  return `obj_${n}`;
}

export function nextObjectName(project: ProjectDocument): string {
  const used = new Set(project.objects.map((item) => objectDisplayName(item).trim()));
  let n = 1;
  while (used.has(`Object ${n}`)) n += 1;
  return `Object ${n}`;
}

export function nextEquipmentName(project: ProjectDocument, symbolId?: string): string {
  const used = new Set(project.objects.map((item) => objectDisplayName(item).trim()));
  const base = findLibrarySymbol(project, symbolId)?.name ?? "Equipment";
  let n = 1;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function objectIdentityTaken(
  project: ProjectDocument,
  candidate: { id?: string; name?: string },
  exceptId: string,
): "id" | "name" | null {
  for (const object of project.objects) {
    if (object.id === exceptId) continue;
    if (candidate.id && object.id === candidate.id) return "id";
    const name = candidate.name?.trim();
    if (name && !isMemoObject(object) && object.name.trim() === name) return "name";
  }
  return null;
}

export function rekeyObject(project: ProjectDocument, fromId: string, toId: string): ProjectDocument {
  if (fromId === toId) return project;
  return {
    ...project,
    objects: project.objects.map((object) => {
      let next = object.id === fromId ? { ...object, id: toId } : object;
      if (isPointObject(next)) {
        next = {
          ...next,
          connections: next.connections.map((end) =>
            end && end.objectId === fromId ? { ...end, objectId: toId } : end,
          ),
        };
      }
      if (isCalculationObject(next)) {
        next = {
          ...next,
          links: (next.links ?? []).map((link) => ({
            ...link,
            targetObjectId: link.targetObjectId === fromId ? toId : link.targetObjectId,
          })),
        };
      }
      if (isMemoObject(next)) {
        next = {
          ...next,
          links: next.links.map((link) => ({
            ...link,
            memoId: link.memoId === fromId ? toId : link.memoId,
            targetObjectId: link.targetObjectId === fromId ? toId : link.targetObjectId,
          })),
        };
      }
      return next;
    }),
    edges: project.edges.map((edge) => ({
      ...edge,
      sourceObjectId: edge.sourceObjectId === fromId ? toId : edge.sourceObjectId,
      targetObjectId: edge.targetObjectId === fromId ? toId : edge.targetObjectId,
      sourceVariableId:
        edge.sourceObjectId === fromId && edge.sourceVariableId === fromId ? toId : edge.sourceVariableId,
      targetVariableId:
        edge.targetObjectId === fromId && edge.targetVariableId === fromId ? toId : edge.targetVariableId,
    })),
  };
}

export function nextPrefixedObjectId(project: ProjectDocument, prefix: string): string {
  const used = new Set(project.objects.map((item) => item.id));
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

export function nextLayoutPosition(
  project: ProjectDocument,
  width = POINT_NODE_SIZE,
  height = POINT_NODE_SIZE,
): { x: number; y: number } {
  const layouts = project.objects.filter(isLayoutObject);
  const index = layouts.length;
  return snapCenteredTopLeft(
    { x: 520 + (index % 4) * 143, y: 88 + Math.floor(index / 4) * 143 },
    width,
    height,
  );
}
