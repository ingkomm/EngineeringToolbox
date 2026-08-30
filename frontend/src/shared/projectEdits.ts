import type { ProjectDocument } from "../types/contract";
import { blankProject } from "../example/blankProject";
import { prototypeProject } from "../example/prototypeProject";
import { type QuantitySpec } from "./quantities";
import { allVariableIds, isMappedInput } from "../calculation/variables";
import {
  OBJECT_LINK_HANDLE,
  isCalculationObject,
  isEquipmentObject,
  isPointObject,
  isValueFlowEdge,
  normalizeLoadedProject,
  normalizePointObject,
  parseArrangementLinkId,
} from "./worksheet";
import { cloneMemo, isMemoObject, parseMemoLinkEdgeId } from "../memo/memo";
import { applyMemoEdit, isMemoEdit } from "../memo/edits";
import { applyCalculationEdit, isCalculationEdit, syncAllObjects, detachMappedInput } from "../calculation/edits";
import { applyArrangementEdit, isArrangementEdit, connectPointEnd } from "../arrangement/edits";
import { noEval, type EditResult } from "./editResult";
import { newStableId } from "./ids";
import { OBJECT_ID_RE, VARIABLE_ID_RE } from "./identity";

export { VARIABLE_ID_RE, OBJECT_ID_RE };
export { syncObjectOutputs } from "../calculation/edits";

export type WorkspaceEdit =
  | import("../calculation/edits").CalculationEdit
  | { type: "deleteObject"; objectId: string }
  | { type: "deleteEdges"; edgeIds: string[] }
  | import("../memo/edits").MemoEdit
  | import("../arrangement/edits").ArrangementEdit
  | { type: "duplicateObjects"; objectIds: string[] }
  | { type: "setObjectLinkSide"; objectId: string; side: "top" | "bottom" }
  | { type: "loadProject"; project: ProjectDocument }
  | { type: "loadExample" }
  | { type: "newWorkspace" };

export { type EditResult } from "./editResult";

export function applyWorkspaceEdit(
  project: ProjectDocument,
  edit: WorkspaceEdit,
  catalog: QuantitySpec[],
): EditResult {
  if (isMemoEdit(edit)) return applyMemoEdit(project, edit);
  if (isArrangementEdit(edit)) return applyArrangementEdit(project, edit);
  if (isCalculationEdit(edit)) return applyCalculationEdit(project, edit, catalog);
  switch (edit.type) {
    case "newWorkspace":
      return { project: structuredClone(blankProject), dirtyObjectIds: [], shouldEvaluate: false };
    case "loadExample":
      return { project: syncAllObjects(structuredClone(prototypeProject)), dirtyObjectIds: [], shouldEvaluate: true };
    case "loadProject":
      return {
        project: syncAllObjects(normalizeLoadedProject(structuredClone(edit.project))),
        dirtyObjectIds: [],
        shouldEvaluate: edit.project.objects.some(isCalculationObject),
      };
    case "deleteObject": {
      const removed = project.objects.find((item) => item.id === edit.objectId);
      return {
        project: {
          ...project,
          objects: project.objects
            .filter((object) => object.id !== edit.objectId)
            .map((object) => {
              if (!isPointObject(object)) return object;
              return {
                ...object,
                connections: object.connections.map((end) =>
                  end && end.objectId === edit.objectId ? null : end,
                ),
              };
            })
            .map((object) => {
              if (isMemoObject(object)) {
                return { ...object, links: object.links.filter((link) => link.targetObjectId !== edit.objectId) };
              }
              if (!isCalculationObject(object)) return object;
              return {
                ...object,
                links: (object.links ?? []).map((link) =>
                  link.targetObjectId === edit.objectId
                    ? { ...link, targetObjectId: null, targetPortId: null }
                    : link,
                ),
              };
            }),
          edges: project.edges.filter(
            (edge) => edge.sourceObjectId !== edit.objectId && edge.targetObjectId !== edit.objectId,
          ),
        },
        dirtyObjectIds: [],
        shouldEvaluate: Boolean(removed && isCalculationObject(removed)),
      };
    }
    case "deleteEdges": {
      const removed = new Set(edit.edgeIds);
      let next = project;
      for (const edgeId of edit.edgeIds) {
        const link = parseArrangementLinkId(edgeId);
        if (link) {
          next = connectPointEnd(next, link.pointId, link.end, null, null).project;
        }
        const memoLinkId = parseMemoLinkEdgeId(edgeId);
        if (memoLinkId) {
          next = {
            ...next,
            objects: next.objects.map((object) =>
              isMemoObject(object)
                ? { ...object, links: object.links.filter((item) => item.id !== memoLinkId) }
                : object,
            ),
          };
        }
      }
      const dropping = next.edges.filter((edge) => removed.has(edge.id));
      for (const edge of dropping) {
        if (edge.enabled !== false && isValueFlowEdge(edge)) {
          next = detachMappedInput(next, edge.targetObjectId, edge.targetVariableId).project;
        }
      }
      next = { ...next, edges: next.edges.filter((edge) => !removed.has(edge.id)) };
      next = {
        ...next,
        objects: next.objects.map((object) => {
          if (!isCalculationObject(object)) return object;
          return {
            ...object,
            links: (object.links ?? []).map((link) => {
              const dropped = dropping.some(
                (edge) =>
                  !isValueFlowEdge(edge) &&
                  edge.sourceObjectId === object.id &&
                  edge.sourceVariableId === link.id,
              );
              return dropped ? { ...link, targetObjectId: null, targetPortId: null } : link;
            }),
          };
        }),
      };
      next = syncAllObjects(next);
      return {
        project: next,
        dirtyObjectIds: dropping.filter(isValueFlowEdge).map((edge) => edge.targetObjectId),
        shouldEvaluate: dropping.some(isValueFlowEdge),
      };
    }
    case "duplicateObjects":
      return duplicateWorksheetObjects(project, edit.objectIds);
    case "setObjectLinkSide":
      return setObjectLinkSide(project, edit.objectId, edit.side);
  }
}

function nextAvailableId(used: Set<string>, prefix: string): string {
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  const id = `${prefix}_${n}`;
  used.add(id);
  return id;
}

function nextPrefixedFrom(used: Set<string>, originalId: string): string {
  const match = /^(.*)_(\d+)$/.exec(originalId);
  const prefix = match?.[1] ? match[1] : originalId;
  return nextAvailableId(used, prefix);
}

function nextCopyName(used: Set<string>, name: string): string {
  const base = name.trim() || "copy";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  const next = `${base} ${n}`;
  used.add(next);
  return next;
}

function remapIdentifiers(text: string, varMap: Map<string, string>): string {
  if (!text || varMap.size === 0) return text;
  const keys = [...varMap.keys()].filter((key) => key.length > 0).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return text;
  const pattern = new RegExp(`\\b(${keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
  return text.replace(pattern, (match) => varMap.get(match) ?? match);
}

function duplicateWorksheetObjects(project: ProjectDocument, objectIds: string[]): EditResult {
  const selected = project.objects.filter((item) => objectIds.includes(item.id));
  if (selected.length === 0) return noEval(project);
  const usedObjectIds = new Set(project.objects.map((item) => item.id));
  const usedObjectNames = new Set(
    project.objects.flatMap((item) => (isMemoObject(item) ? [] : [item.name])),
  );
  const usedVars = new Set(allVariableIds(project));
  const usedVarNames = new Set(
    project.objects.flatMap((item) => {
      if (!isCalculationObject(item)) return [];
      return [...item.inputs, ...item.calculations, ...item.outputs, ...(item.links ?? [])].map((row) => row.name);
    }),
  );
  const idMap = new Map<string, string>();
  for (const item of selected) {
    if (isMemoObject(item)) {
      const id = newStableId("m");
      usedObjectIds.add(id);
      idMap.set(item.id, id);
      continue;
    }
    const prefix = isEquipmentObject(item) ? "EQ" : isPointObject(item) ? "PT" : "obj";
    idMap.set(item.id, nextAvailableId(usedObjectIds, prefix));
  }
  const varMap = new Map<string, string>();
  const varInfo = new Map<string, { id: string; name: string }>();
  const allocateVar = (oldId: string, oldName: string): { id: string; name: string } => {
    const existing = varInfo.get(oldId);
    if (existing) return existing;
    const id = nextPrefixedFrom(usedVars, oldId);
    const name = !oldName.trim() || oldName === oldId ? id : nextCopyName(usedVarNames, `${oldName} copy`);
    const next = { id, name };
    varInfo.set(oldId, next);
    varMap.set(oldId, id);
    return next;
  };
  for (const item of selected) {
    if (!isCalculationObject(item)) continue;
    for (const row of item.calculations) allocateVar(row.id, row.name);
  }
  for (const item of selected) {
    if (!isCalculationObject(item)) continue;
    for (const row of item.inputs) {
      if (isMappedInput(item.id, row.id, project.edges)) {
        const inbound = project.edges.find(
          (edge) =>
            edge.enabled !== false &&
            isValueFlowEdge(edge) &&
            edge.targetObjectId === item.id &&
            edge.targetVariableId === row.id,
        );
        const shared = inbound && idMap.has(inbound.sourceObjectId) ? varInfo.get(inbound.sourceVariableId) : undefined;
        if (shared) {
          varInfo.set(row.id, shared);
          varMap.set(row.id, shared.id);
          continue;
        }
      }
      allocateVar(row.id, row.name);
    }
    for (const row of item.links ?? []) allocateVar(row.id, row.name);
    for (const row of item.outputs) allocateVar(row.id, row.name);
  }
  const clones = selected.map((item) => {
    const id = idMap.get(item.id) ?? item.id;
    const position = { x: item.position.x + 36, y: item.position.y + 36 };
    if (isEquipmentObject(item)) {
      return { ...item, id, name: nextCopyName(usedObjectNames, `${item.name} copy`), position };
    }
    if (isPointObject(item)) {
      return normalizePointObject({
        ...item,
        id,
        name: item.name === item.id ? id : nextCopyName(usedObjectNames, `${item.name} copy`),
        position,
        connections: item.connections.map((end) => {
          if (!end) return null;
          const remapped = idMap.get(end.objectId);
          return remapped ? { ...end, objectId: remapped } : { ...end };
        }),
      });
    }
    if (isMemoObject(item)) {
      return {
        ...cloneMemo(item, position),
        id,
        links: item.links.map((link) => ({
          id: newStableId("l"),
          memoId: id,
          targetObjectId: idMap.get(link.targetObjectId) ?? link.targetObjectId,
        })),
      };
    }
    return {
      ...item,
      id,
      name: nextCopyName(usedObjectNames, `${item.name} copy`),
      position,
      inputs: item.inputs.map((row) => {
        const next = allocateVar(row.id, row.name);
        return { ...row, id: next.id, name: next.name };
      }),
      calculations: item.calculations.map((row) => {
        const next = allocateVar(row.id, row.name);
        return { ...row, id: next.id, name: next.name, formula: remapIdentifiers(row.formula, varMap) };
      }),
      outputs: item.outputs.map((row) => {
        const next = allocateVar(row.id, row.name);
        return {
          ...row,
          id: next.id,
          name: next.name,
          sourceVariableId: varMap.get(row.sourceVariableId) ?? row.sourceVariableId,
        };
      }),
      links: (item.links ?? []).map((link) => {
        const next = allocateVar(link.id, link.name);
        const remappedTarget = link.targetObjectId ? idMap.get(link.targetObjectId) : undefined;
        return {
          ...link,
          id: next.id,
          name: next.name,
          targetObjectId: remappedTarget ?? null,
          targetPortId: remappedTarget ? OBJECT_LINK_HANDLE : null,
        };
      }),
    };
  });
  const clonedEdges = project.edges.flatMap((edge) => {
    const sourceObjectId = idMap.get(edge.sourceObjectId);
    const targetObjectId = idMap.get(edge.targetObjectId);
    if (!sourceObjectId || !targetObjectId) return [];
    const sourceVariableId = varMap.get(edge.sourceVariableId) ?? edge.sourceVariableId;
    const targetVariableId = varMap.get(edge.targetVariableId) ?? edge.targetVariableId;
    return [
      {
        ...edge,
        id: `edge-${sourceObjectId}-${sourceVariableId}-${targetObjectId}-${targetVariableId}`,
        sourceObjectId,
        sourceVariableId,
        targetObjectId,
        targetVariableId,
      },
    ];
  });
  return {
    project: { ...project, objects: [...project.objects, ...clones], edges: [...project.edges, ...clonedEdges] },
    dirtyObjectIds: clones.filter(isCalculationObject).map((item) => item.id),
    shouldEvaluate: clones.some(isCalculationObject),
  };
}

function setObjectLinkSide(
  project: ProjectDocument,
  objectId: string,
  side: "top" | "bottom",
): EditResult {
  if (side !== "top" && side !== "bottom") return noEval(project);
  const current = project.objects.find((item) => item.id === objectId);
  if (!current) return noEval(project);
  return {
    project: {
      ...project,
      objects: project.objects.map((item) =>
        item.id === objectId ? { ...item, objectLinkSide: side } : item,
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

