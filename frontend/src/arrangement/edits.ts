import type { EquipmentObject, PointEnd, PointObject } from "./types";
import type { ProjectDocument } from "../shared/document";
import { noEval, type EditResult } from "../shared/editResult";
import { OBJECT_ID_RE, VARIABLE_ID_RE } from "../shared/identity";
import {
  firstEquipmentSymbol,
  findLibrarySymbol,
  libraryOf,
  moveLibrarySymbol,
  newBlankEquipmentSymbol,
  normalizeCategory,
  uniqueCategory,
  deleteLibraryFolder,
} from "./symbols/library";
import { snapGridSize } from "../shared/grid";
import { resolveDrawing, withPorts } from "./symbols/drawing";
import {
  clampConnectionCount,
  isEquipmentObject,
  isLayoutObject,
  isPointObject,
  layoutPortExists,
  normalizePointObject,
  parsePointConnectionEnd,
  resolveLayoutPort,
} from "../shared/worksheet";
import { nextEquipmentName, nextLayoutPosition, nextPrefixedObjectId, rekeyObject } from "../shared/objectIdentity";

function addWorksheetEquipment(
  project: ProjectDocument,
  symbolId?: string,
  position?: { x: number; y: number },
): EditResult {
  const template = symbolId ? findLibrarySymbol(project, symbolId) : firstEquipmentSymbol(project);
  if (!template || template.kind !== "equipment") return noEval(project);
  const id = nextPrefixedObjectId(project, "EQ");
  const drawing = template.drawing ?? undefined;
  const width = drawing?.width ?? 99;
  const height = drawing?.height ?? 77;
  const object: EquipmentObject = {
    kind: "equipment",
    id,
    name: nextEquipmentName(project, template.id),
    position: position ?? nextLayoutPosition(project, width, height),
    symbolId: template.id,
    inCount: template.inCount ?? 1,
    outCount: template.outCount ?? 1,
    rotation: 0,
    width: drawing?.width,
    height: drawing?.height,
    drawing: drawing ?? null,
  };
  return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
}

function addLibrarySymbol(project: ProjectDocument, category?: string): EditResult {
  const library = libraryOf(project);
  const created = { ...newBlankEquipmentSymbol(library), category: normalizeCategory(category ?? "") || undefined };
  return {
    project: { ...project, symbolLibrary: [...library, created] },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function deleteLibrarySymbol(project: ProjectDocument, symbolId: string): EditResult {
  const library = libraryOf(project).filter((item) => item.id !== symbolId);
  return { project: { ...project, symbolLibrary: library }, dirtyObjectIds: [], shouldEvaluate: false };
}

function moveLibrarySymbolEdit(project: ProjectDocument, symbolId: string, direction: -1 | 1): EditResult {
  return {
    project: { ...project, symbolLibrary: moveLibrarySymbol(libraryOf(project), symbolId, direction) },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function addLibraryCategoryEdit(project: ProjectDocument, path: string): EditResult {
  const next = uniqueCategory(project.symbolCategories ?? [], path);
  if (!next) return noEval(project);
  return {
    project: { ...project, symbolCategories: [...(project.symbolCategories ?? []), next] },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function deleteLibraryCategoryEdit(project: ProjectDocument, path: string): EditResult {
  const next = deleteLibraryFolder(libraryOf(project), project.symbolCategories ?? [], path);
  return {
    project: { ...project, symbolLibrary: next.library, symbolCategories: next.symbolCategories },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function updateLibrarySymbol(
  project: ProjectDocument,
  symbolId: string,
  patch: {
    name?: string;
    inCount?: number;
    outCount?: number;
    drawing?: EquipmentObject["drawing"];
    category?: string;
  },
): EditResult {
  const library = libraryOf(project);
  const current = library.find((item) => item.id === symbolId);
  if (!current) return noEval(project);
  if (current.kind !== "equipment" && (patch.drawing !== undefined || patch.inCount != null || patch.outCount != null)) {
    return noEval(project);
  }
  const nextItem = {
    ...current,
    name: (patch.name ?? current.name).trim() || current.name,
    inCount: patch.inCount ?? current.inCount,
    outCount: patch.outCount ?? current.outCount,
    drawing: patch.drawing !== undefined ? patch.drawing : current.drawing,
    category: patch.category !== undefined ? normalizeCategory(patch.category) || undefined : current.category,
  };
  return {
    project: {
      ...project,
      symbolLibrary: library.map((item) => (item.id === symbolId ? nextItem : item)),
      objects: project.objects.map((object) => {
        if (!isEquipmentObject(object) || object.symbolId !== symbolId) return object;
        return {
          ...object,
          inCount: nextItem.inCount ?? object.inCount,
          outCount: nextItem.outCount ?? object.outCount,
          drawing: nextItem.drawing ?? object.drawing,
          width: nextItem.drawing?.width ?? object.width,
          height: nextItem.drawing?.height ?? object.height,
        };
      }),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function snapRotation(value: number): 0 | 90 | 180 | 270 {
  const snapped = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return snapped as 0 | 90 | 180 | 270;
}

function updateWorksheetEquipment(
  project: ProjectDocument,
  objectId: string,
  patch: {
    id?: string;
    name?: string;
    tag?: string;
    symbolId?: string;
    rotation?: 0 | 90 | 180 | 270;
    width?: number;
    height?: number;
    drawing?: EquipmentObject["drawing"];
  },
): EditResult {
  const current = project.objects.find((item) => item.id === objectId);
  if (!current || !isEquipmentObject(current)) return noEval(project);
  const nextId = patch.id ?? current.id;
  const nextName = (patch.name ?? current.name).trim() || nextId;
  if (!OBJECT_ID_RE.test(nextId)) return noEval(project);
  if (nextId !== current.id && project.objects.some((item) => item.id === nextId)) return noEval(project);
  let next = project;
  if (nextId !== current.id) next = rekeyObject(next, current.id, nextId);
  const nextSymbol = patch.symbolId?.trim() || current.symbolId;
  const updated: EquipmentObject = {
    ...current,
    id: nextId,
    name: nextName,
    tag: patch.tag !== undefined ? patch.tag : current.tag,
    symbolId: nextSymbol,
    rotation: patch.rotation !== undefined ? snapRotation(patch.rotation) : current.rotation,
    width: patch.width !== undefined ? snapGridSize(patch.width) : current.width,
    height: patch.height !== undefined ? snapGridSize(patch.height) : current.height,
    drawing: patch.symbolId && patch.drawing === undefined ? null : patch.drawing !== undefined ? patch.drawing : current.drawing,
  };
  return {
    project: {
      ...next,
      objects: next.objects.map((item) => (item.id === nextId ? updated : item)),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function updateWorksheetPointEnd(
  project: ProjectDocument,
  pointId: string,
  end: string,
  patch: Partial<PointEnd>,
): EditResult {
  const point = project.objects.find((item) => item.id === pointId);
  if (!point || !isPointObject(point)) return noEval(project);
  const index = parsePointConnectionEnd(end);
  if (index == null) return noEval(project);
  const current = point.connections[index];
  if (!current) return noEval(project);
  const nextEnd: PointEnd = { ...current, ...patch, objectId: current.objectId, portId: current.portId };
  const connections = [...point.connections];
  connections[index] = nextEnd;
  return {
    project: {
      ...project,
      objects: project.objects.map((item) =>
        item.id === pointId ? normalizePointObject({ ...point, connections }) : item,
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function rotateWorksheetEquipment(project: ProjectDocument, objectIds: string[], delta: 90 | -90): EditResult {
  return {
    project: {
      ...project,
      objects: project.objects.map((item) => {
        if (!isEquipmentObject(item) || !objectIds.includes(item.id)) return item;
        return { ...item, rotation: snapRotation((item.rotation ?? 0) + delta) };
      }),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function alignWorksheetObjects(
  project: ProjectDocument,
  objectIds: string[],
  mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "h-gap" | "v-gap",
): EditResult {
  const targets = project.objects.filter((item) => objectIds.includes(item.id) && isLayoutObject(item));
  if (targets.length < 2) return noEval(project);
  const xs = targets.map((item) => item.position.x);
  const ys = targets.map((item) => item.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const sortedX = [...targets].sort((a, b) => a.position.x - b.position.x);
  const sortedY = [...targets].sort((a, b) => a.position.y - b.position.y);
  const stepX = sortedX.length > 1 ? (maxX - minX) / (sortedX.length - 1) : 0;
  const stepY = sortedY.length > 1 ? (maxY - minY) / (sortedY.length - 1) : 0;
  return {
    project: {
      ...project,
      objects: project.objects.map((item) => {
        if (!objectIds.includes(item.id) || !isLayoutObject(item)) return item;
        if (mode === "left") return { ...item, position: { ...item.position, x: minX } };
        if (mode === "right") return { ...item, position: { ...item.position, x: maxX } };
        if (mode === "center") return { ...item, position: { ...item.position, x: midX } };
        if (mode === "top") return { ...item, position: { ...item.position, y: minY } };
        if (mode === "bottom") return { ...item, position: { ...item.position, y: maxY } };
        if (mode === "middle") return { ...item, position: { ...item.position, y: midY } };
        if (mode === "h-gap") {
          const index = sortedX.findIndex((entry) => entry.id === item.id);
          return { ...item, position: { ...item.position, x: minX + stepX * index } };
        }
        const index = sortedY.findIndex((entry) => entry.id === item.id);
        return { ...item, position: { ...item.position, y: minY + stepY * index } };
      }),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function addWorksheetPoint(project: ProjectDocument, position?: { x: number; y: number }): EditResult {
  const id = nextPrefixedObjectId(project, "PT");
  const object = normalizePointObject({
    id,
    name: id,
    position: position ?? nextLayoutPosition(project),
    connectionCount: 4,
  });
  return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
}

function updateWorksheetPoint(
  project: ProjectDocument,
  objectId: string,
  patch: { id?: string; name?: string; connectionCount?: number },
): EditResult {
  const current = project.objects.find((item) => item.id === objectId);
  if (!current || !isPointObject(current)) return noEval(project);
  const nextId = patch.id ?? current.id;
  const nextName = (patch.name ?? current.name).trim() || nextId;
  if (!VARIABLE_ID_RE.test(nextId)) return noEval(project);
  if (nextId !== current.id && project.objects.some((item) => item.id === nextId)) return noEval(project);
  const nextPoint = normalizePointObject({
    ...current,
    id: nextId,
    name: nextName,
    connectionCount: clampConnectionCount(),
  });
  let next = project;
  if (nextId !== current.id) next = rekeyObject(next, current.id, nextId);
  next = {
    ...next,
    objects: next.objects.map((item) => (item.id === nextId ? nextPoint : item)),
  };
  return { project: next, dirtyObjectIds: [], shouldEvaluate: false };
}

function setEquipmentPorts(
  project: ProjectDocument,
  objectId: string,
  inCount: number | undefined,
  outCount: number | undefined,
): EditResult {
  const equipment = project.objects.find((item) => item.id === objectId);
  if (!equipment || !isEquipmentObject(equipment)) return noEval(project);
  const clampPort = (value: number | undefined, fallback: number) => {
    if (value == null || Number.isNaN(value)) return fallback;
    return Math.max(0, Math.min(8, Math.floor(value)));
  };
  const nextIn = clampPort(inCount, equipment.inCount);
  const nextOut = clampPort(outCount, equipment.outCount);
  const drawing = withPorts(resolveDrawing(equipment.symbolId, equipment.drawing), nextIn, nextOut);
  const updated: EquipmentObject = { ...equipment, inCount: nextIn, outCount: nextOut, drawing };
  return {
    project: {
      ...project,
      objects: project.objects.map((item) => {
        if (item.id === objectId) return updated;
        if (!isPointObject(item)) return item;
        return {
          ...item,
          connections: item.connections.map((end) => {
            if (!end) return null;
            if (end.objectId !== objectId) return end;
            return layoutPortExists(updated, end.portId) ? end : null;
          }),
        };
      }),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

export function connectPointEnd(
  project: ProjectDocument,
  pointId: string,
  end: string,
  targetObjectId: string | null,
  targetPortId: string | null,
  reversed?: boolean,
): EditResult {
  const point = project.objects.find((item) => item.id === pointId);
  if (!point || !isPointObject(point)) return noEval(project);
  const index = parsePointConnectionEnd(end);
  if (index == null || index >= point.connectionCount) return noEval(project);
  let nextEnd: PointEnd | null = null;
  if (targetObjectId && targetPortId) {
    if (targetObjectId === pointId) return noEval(project);
    const host = project.objects.find((item) => item.id === targetObjectId);
    if (!host || !isLayoutObject(host) || !layoutPortExists(host, targetPortId)) return noEval(project);
    nextEnd = { objectId: targetObjectId, portId: targetPortId, reversed: reversed === true };
  }
  const connections = [...point.connections];
  connections[index] = nextEnd;
  const nextPoint: PointObject = normalizePointObject({ ...point, connections });
  return {
    project: {
      ...project,
      objects: project.objects.map((item) => {
        if (item.id === pointId) return nextPoint;
        if (!isPointObject(item) || !targetObjectId || !targetPortId) return item;
        return {
          ...item,
          connections: item.connections.map((existing, existingIndex) => {
            if (!existing) return existing;
            if (existing.objectId === pointId && existing.portId === `C_${index + 1}`) return null;
            if (item.id === targetObjectId && existingIndex === parsePointConnectionEnd(targetPortId)) return null;
            return existing;
          }),
        };
      }),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function togglePointLink(project: ProjectDocument, pointId: string, end: string): EditResult {
  const point = project.objects.find((item) => item.id === pointId);
  if (!point || !isPointObject(point)) return noEval(project);
  const index = parsePointConnectionEnd(end);
  if (index == null || index >= point.connectionCount) return noEval(project);
  const current = point.connections[index];
  if (!current) return noEval(project);
  const connections = [...point.connections];
  connections[index] = { ...current, reversed: current.reversed !== true };
  return {
    project: {
      ...project,
      objects: project.objects.map((item) =>
        item.id === pointId ? normalizePointObject({ ...point, connections }) : item,
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function connectArrangement(
  project: ProjectDocument,
  edit: {
    sourceObjectId: string;
    sourcePortId?: string | null;
    targetObjectId: string;
    targetPortId?: string | null;
    linkKind?: "pipe" | "signal";
  },
): EditResult {
  if (edit.sourceObjectId === edit.targetObjectId) return noEval(project);
  const source = project.objects.find((item) => item.id === edit.sourceObjectId);
  const target = project.objects.find((item) => item.id === edit.targetObjectId);
  if (!source || !target || !isLayoutObject(source) || !isLayoutObject(target)) return noEval(project);
  const sourcePort = resolveLayoutPort(source, edit.sourcePortId, "source", edit.targetPortId);
  const targetPort = resolveLayoutPort(target, edit.targetPortId, "target", edit.sourcePortId ?? sourcePort);
  if (!sourcePort || !targetPort) return noEval(project);

  if (isPointObject(source)) {
    return connectPointEnd(project, source.id, sourcePort, target.id, targetPort, false);
  }
  if (isPointObject(target)) {
    return connectPointEnd(project, target.id, targetPort, source.id, sourcePort, true);
  }

  const relationType = edit.linkKind === "signal" ? "signal" : "pipe";
  const duplicate = project.edges.some(
    (edge) =>
      edge.sourceObjectId === source.id &&
      edge.sourceVariableId === sourcePort &&
      edge.targetObjectId === target.id &&
      edge.targetVariableId === targetPort,
  );
  if (duplicate) return noEval(project);
  return {
    project: {
      ...project,
      edges: [
        ...project.edges,
        {
          id: `pipe-${source.id}-${sourcePort}-${target.id}-${targetPort}`,
          sourceObjectId: source.id,
          sourceVariableId: sourcePort,
          targetObjectId: target.id,
          targetVariableId: targetPort,
          enabled: true,
          collapsed: false,
          relationType,
        },
      ],
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}


export type ArrangementEdit =
  | { type: "addEquipment"; symbolId?: string; position?: { x: number; y: number } }
  | { type: "addPoint"; position?: { x: number; y: number } }
  | { type: "addLibrarySymbol"; category?: string }
  | { type: "deleteLibrarySymbol"; symbolId: string }
  | { type: "moveLibrarySymbol"; symbolId: string; direction: -1 | 1 }
  | { type: "addLibraryCategory"; path: string }
  | { type: "deleteLibraryCategory"; path: string }
  | {
      type: "updateLibrarySymbol";
      symbolId: string;
      patch: {
        name?: string;
        inCount?: number;
        outCount?: number;
        drawing?: EquipmentObject["drawing"];
        category?: string;
      };
    }
  | {
      type: "updatePoint";
      objectId: string;
      patch: { id?: string; name?: string; connectionCount?: number };
    }
  | {
      type: "updateEquipment";
      objectId: string;
      patch: {
        id?: string;
        name?: string;
        tag?: string;
        symbolId?: string;
        rotation?: 0 | 90 | 180 | 270;
        width?: number;
        height?: number;
        drawing?: EquipmentObject["drawing"];
      };
    }
  | { type: "updatePointEnd"; pointId: string; end: string; patch: Partial<PointEnd> }
  | { type: "rotateEquipment"; objectIds: string[]; delta?: 90 | -90 }
  | {
      type: "alignObjects";
      objectIds: string[];
      mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "h-gap" | "v-gap";
    }
  | { type: "setEquipmentPorts"; objectId: string; inCount?: number; outCount?: number }
  | {
      type: "connectPointEnd";
      pointId: string;
      end: string;
      targetObjectId: string | null;
      targetPortId: string | null;
      reversed?: boolean;
    }
  | { type: "togglePointLink"; pointId: string; end: string }
  | {
      type: "connectArrangement";
      sourceObjectId: string;
      sourcePortId?: string | null;
      targetObjectId: string;
      targetPortId?: string | null;
      linkKind?: "pipe" | "signal";
    };

export function isArrangementEdit(edit: { type: string }): edit is ArrangementEdit {
  return (
    edit.type === "addEquipment" ||
    edit.type === "addPoint" ||
    edit.type === "addLibrarySymbol" ||
    edit.type === "deleteLibrarySymbol" ||
    edit.type === "moveLibrarySymbol" ||
    edit.type === "addLibraryCategory" ||
    edit.type === "deleteLibraryCategory" ||
    edit.type === "updateLibrarySymbol" ||
    edit.type === "updateEquipment" ||
    edit.type === "updatePointEnd" ||
    edit.type === "rotateEquipment" ||
    edit.type === "alignObjects" ||
    edit.type === "updatePoint" ||
    edit.type === "setEquipmentPorts" ||
    edit.type === "connectPointEnd" ||
    edit.type === "togglePointLink" ||
    edit.type === "connectArrangement"
  );
}

export function applyArrangementEdit(project: ProjectDocument, edit: ArrangementEdit): EditResult {
  switch (edit.type) {
    case "addEquipment":
      return addWorksheetEquipment(project, edit.symbolId, edit.position);
    case "addPoint":
      return addWorksheetPoint(project, edit.position);
    case "addLibrarySymbol":
      return addLibrarySymbol(project, edit.category);
    case "deleteLibrarySymbol":
      return deleteLibrarySymbol(project, edit.symbolId);
    case "moveLibrarySymbol":
      return moveLibrarySymbolEdit(project, edit.symbolId, edit.direction);
    case "addLibraryCategory":
      return addLibraryCategoryEdit(project, edit.path);
    case "deleteLibraryCategory":
      return deleteLibraryCategoryEdit(project, edit.path);
    case "updateLibrarySymbol":
      return updateLibrarySymbol(project, edit.symbolId, edit.patch);
    case "updateEquipment":
      return updateWorksheetEquipment(project, edit.objectId, edit.patch);
    case "updatePointEnd":
      return updateWorksheetPointEnd(project, edit.pointId, edit.end, edit.patch);
    case "rotateEquipment":
      return rotateWorksheetEquipment(project, edit.objectIds, edit.delta ?? 90);
    case "alignObjects":
      return alignWorksheetObjects(project, edit.objectIds, edit.mode);
    case "updatePoint":
      return updateWorksheetPoint(project, edit.objectId, edit.patch);
    case "setEquipmentPorts":
      return setEquipmentPorts(project, edit.objectId, edit.inCount, edit.outCount);
    case "connectPointEnd":
      return connectPointEnd(project, edit.pointId, edit.end, edit.targetObjectId, edit.targetPortId, edit.reversed);
    case "togglePointLink":
      return togglePointLink(project, edit.pointId, edit.end);
    case "connectArrangement":
      return connectArrangement(project, edit);
  }
}
