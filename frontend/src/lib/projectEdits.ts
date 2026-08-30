import type {
  CalculationLink,
  CalculationObject,
  EquipmentObject,
  FormulaVariable,
  InputVariable,
  OutputBinding,
  PointEnd,
  PointObject,
  ProjectDocument,
  RelationType,
} from "../types/contract";
import { catalogEntry, symbolPortDefaults } from "../canvas/symbols/catalog";
import { evenGridSize } from "../canvas/symbols/grid";
import { blankProject } from "../example/blankProject";
import { prototypeProject } from "../example/prototypeProject";
import { siUnitFor, type QuantitySpec } from "./quantities";
import {
  allVariableIds,
  displayName,
  identityTaken,
  isMappedInput,
  nextGlobalPrefixedId,
  sourceVariable,
} from "./variables";
import {
  OBJECT_LINK_HANDLE,
  canConnectObjectLink,
  clampConnectionCount,
  isCalculationObject,
  isEquipmentObject,
  isLayoutObject,
  isPointObject,
  isValueFlowEdge,
  layoutPortExists,
  normalizeLoadedProject,
  normalizePointObject,
  parseArrangementLinkId,
  parsePointConnectionEnd,
  resolveLayoutPort,
} from "./worksheet";

export const VARIABLE_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const OBJECT_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export type WorkspaceEdit =
  | { type: "addObject" }
  | { type: "deleteObject"; objectId: string }
  | { type: "renameObject"; objectId: string; name: string }
  | { type: "updateObject"; objectId: string; patch: { id?: string; name?: string } }
  | { type: "addInput"; objectId: string }
  | { type: "removeInput"; objectId: string; index: number }
  | { type: "updateInput"; objectId: string; index: number; patch: Partial<InputVariable> }
  | { type: "addCalculation"; objectId: string }
  | { type: "removeCalculation"; objectId: string; index: number }
  | { type: "updateCalculation"; objectId: string; index: number; patch: Partial<FormulaVariable> }
  | { type: "addOutput"; objectId: string }
  | { type: "removeOutput"; objectId: string; index: number }
  | { type: "updateOutput"; objectId: string; index: number; patch: Partial<OutputBinding> }
  | { type: "addLink"; objectId: string }
  | { type: "removeLink"; objectId: string; index: number }
  | { type: "updateLink"; objectId: string; index: number; patch: Partial<CalculationLink> }
  | {
      type: "connectLink";
      objectId: string;
      linkId?: string;
      targetObjectId: string | null;
      targetPortId?: string | null;
    }
  | {
      type: "connectMapping";
      sourceObjectId: string;
      sourceVariableId: string;
      targetObjectId: string;
      targetVariableId: string;
      relationType?: RelationType;
    }
  | {
      type: "connectBySearch";
      sourceObjectId: string;
      sourceVariableId: string;
      targetObjectId: string;
      targetVariableId?: string;
      relationType?: RelationType;
    }
  | { type: "toggleEdge"; edgeId: string }
  | { type: "toggleEdgeCollapsed"; edgeId: string }
  | { type: "deleteEdges"; edgeIds: string[] }
  | { type: "addEquipment"; symbolId?: string }
  | { type: "addPoint" }
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
  | {
      type: "updatePointEnd";
      pointId: string;
      end: string;
      patch: Partial<PointEnd>;
    }
  | { type: "duplicateObjects"; objectIds: string[] }
  | { type: "rotateEquipment"; objectIds: string[]; delta?: 90 | -90 }
  | {
      type: "alignObjects";
      objectIds: string[];
      mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "h-gap" | "v-gap";
    }
  | { type: "setEquipmentPorts"; objectId: string; inCount?: number; outCount?: number }
  | { type: "setObjectLinkSide"; objectId: string; side: "top" | "bottom" }
  | {
      type: "connectPointEnd";
      pointId: string;
      end: string;
      targetObjectId: string | null;
      targetPortId: string | null;
      reversed?: boolean;
    }
  | {
      type: "connectArrangement";
      sourceObjectId: string;
      sourcePortId?: string | null;
      targetObjectId: string;
      targetPortId?: string | null;
      linkKind?: "pipe" | "signal";
    }
  | { type: "togglePointLink"; pointId: string; end: string }
  | { type: "loadProject"; project: ProjectDocument }
  | { type: "loadExample" }
  | { type: "newWorkspace" };

export interface EditResult {
  project: ProjectDocument;
  dirtyObjectIds: string[];
  shouldEvaluate: boolean;
}

function nextObjectId(project: ProjectDocument): string {
  const used = new Set(project.objects.map((item) => item.id));
  let n = 1;
  while (used.has(`obj_${n}`)) n += 1;
  return `obj_${n}`;
}

function nextObjectName(project: ProjectDocument): string {
  const used = new Set(project.objects.map((item) => item.name.trim()));
  let n = 1;
  while (used.has(`Object ${n}`)) n += 1;
  return `Object ${n}`;
}

function nextEquipmentName(project: ProjectDocument, symbolId?: string): string {
  const used = new Set(project.objects.map((item) => item.name.trim()));
  const base = symbolId && symbolId !== "generic-equipment" ? catalogEntry(symbolId).label : "Equipment";
  let n = 1;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function objectIdentityTaken(
  project: ProjectDocument,
  candidate: { id?: string; name?: string },
  exceptId: string,
): "id" | "name" | null {
  for (const object of project.objects) {
    if (object.id === exceptId) continue;
    if (candidate.id && object.id === candidate.id) return "id";
    const name = candidate.name?.trim();
    if (name && object.name.trim() === name) return "name";
  }
  return null;
}

function rekeyObject(project: ProjectDocument, fromId: string, toId: string): ProjectDocument {
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

function patchObject(
  project: ProjectDocument,
  objectId: string,
  mutate: (object: CalculationObject) => CalculationObject,
): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map((object) => {
      if (object.id !== objectId || !isCalculationObject(object)) return object;
      return mutate(object);
    }),
  };
}

function nextPrefixedObjectId(project: ProjectDocument, prefix: string): string {
  const used = new Set(project.objects.map((item) => item.id));
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

function nextLayoutPosition(project: ProjectDocument): { x: number; y: number } {
  const layouts = project.objects.filter(isLayoutObject);
  const index = layouts.length;
  return { x: 80 + (index % 4) * 200, y: 420 + Math.floor(index / 4) * 150 };
}

function rewriteIdentifier(formula: string, fromId: string, toId: string): string {
  if (!fromId || fromId === toId) return formula;
  const escaped = fromId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return formula.replace(new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "g"), `$1${toId}`);
}

function rewriteFormulas(object: CalculationObject, fromId: string, toId: string): CalculationObject {
  if (fromId === toId) return object;
  return {
    ...object,
    calculations: object.calculations.map((item) => ({
      ...item,
      formula: rewriteIdentifier(item.formula, fromId, toId),
    })),
  };
}

export function syncObjectOutputs(object: CalculationObject): CalculationObject {
  const sources = [...object.inputs, ...object.calculations];
  const previousBySource = new Map(object.outputs.map((item) => [item.sourceVariableId, item]));
  const previousById = new Map(object.outputs.map((item) => [item.id, item]));
  return {
    ...object,
    links: object.links ?? [],
    outputs: sources.map((item) => {
      const prev = previousBySource.get(item.id) ?? previousById.get(item.id);
      return {
        id: item.id,
        name: displayName(item),
        sourceVariableId: item.id,
        value: prev?.value ?? item.value ?? null,
        quantity: item.quantity ?? prev?.quantity ?? null,
        unit: item.unit ?? prev?.unit ?? null,
        status: prev?.status,
        error: prev?.error ?? null,
      };
    }),
  };
}

function syncProjectObject(project: ProjectDocument, objectId: string): ProjectDocument {
  const current = project.objects.find((item) => item.id === objectId);
  if (!current || !isCalculationObject(current)) return project;
  const next = patchObject(project, objectId, syncObjectOutputs);
  const object = next.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return next;
  const outputIds = new Set(object.outputs.map((item) => item.id));
  const inputIds = new Set(object.inputs.map((item) => item.id));
  return {
    ...next,
    edges: next.edges.filter((edge) => {
      if (edge.sourceObjectId === objectId && isValueFlowEdge(edge) && !outputIds.has(edge.sourceVariableId)) {
        return false;
      }
      if (edge.targetObjectId === objectId && isValueFlowEdge(edge) && !inputIds.has(edge.targetVariableId)) {
        return false;
      }
      return true;
    }),
  };
}

function syncAllObjects(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map((object) => (isCalculationObject(object) ? syncObjectOutputs(object) : object)),
  };
}

function rekeyGlobalVariable(project: ProjectDocument, fromId: string, toId: string, nextName: string): ProjectDocument {
  const renamed: ProjectDocument = {
    ...project,
    objects: project.objects.map((object) => {
      if (!isCalculationObject(object)) return object;
      return {
        ...object,
        inputs: object.inputs.map((item) => (item.id === fromId ? { ...item, id: toId, name: nextName } : item)),
        calculations: object.calculations.map((item) => ({
          ...item,
          id: item.id === fromId ? toId : item.id,
          name: item.id === fromId ? nextName : item.name,
          formula: rewriteIdentifier(item.formula, fromId, toId),
        })),
      };
    }),
    edges: project.edges.map((edge) => ({
      ...edge,
      sourceVariableId: edge.sourceVariableId === fromId ? toId : edge.sourceVariableId,
      targetVariableId: edge.targetVariableId === fromId ? toId : edge.targetVariableId,
    })),
  };
  return syncAllObjects(renamed);
}

function applyDisplayName(project: ProjectDocument, variableId: string, nextName: string): ProjectDocument {
  return syncAllObjects({
    ...project,
    objects: project.objects.map((object) => {
      if (!isCalculationObject(object)) return object;
      return {
        ...object,
        inputs: object.inputs.map((item) => (item.id === variableId ? { ...item, name: nextName } : item)),
        calculations: object.calculations.map((item) =>
          item.id === variableId ? { ...item, name: nextName } : item,
        ),
      };
    }),
  });
}

function withIdentityPatch<T extends { id: string; name: string }>(current: T, patch: Partial<T>): T {
  const next = { ...current, ...patch };
  if (patch.id && (!current.name || current.name === current.id) && patch.name === undefined) {
    next.name = patch.id;
  }
  return next;
}

function sourceQuantityFields(
  source: { quantity?: string | null; unit?: string | null },
  catalog: QuantitySpec[],
): { quantity: string | null; unit: string | null } {
  const quantity = source.quantity ?? null;
  return { quantity, unit: source.unit ?? siUnitFor(quantity, catalog) };
}

function inheritMappedQuantity(
  project: ProjectDocument,
  sourceObjectId: string,
  sourceVariableId: string,
  quantity: string | null,
  unit: string | null,
): ProjectDocument {
  const visited = new Set<string>();
  const queue: Array<{ objectId: string; variableId: string }> = [
    { objectId: sourceObjectId, variableId: sourceVariableId },
  ];
  let next = project;
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const key = `${current.objectId}::${current.variableId}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const edge of next.edges) {
      if (edge.enabled === false) continue;
      if (edge.sourceObjectId !== current.objectId || edge.sourceVariableId !== current.variableId) continue;
      next = patchObject(next, edge.targetObjectId, (object) => ({
        ...object,
        inputs: object.inputs.map((item) =>
          item.id === edge.targetVariableId ? { ...item, quantity, unit } : item,
        ),
      }));
      next = syncProjectObject(next, edge.targetObjectId);
      queue.push({ objectId: edge.targetObjectId, variableId: edge.targetVariableId });
    }
  }
  return next;
}

function detachMappedInput(
  project: ProjectDocument,
  objectId: string,
  inputId: string,
): { project: ProjectDocument; newId: string } {
  const freshId = nextGlobalPrefixedId(project, "IN");
  const next = patchObject(project, objectId, (object) => {
    const rewritten = rewriteFormulas(object, inputId, freshId);
    return {
      ...rewritten,
      inputs: rewritten.inputs.map((item) =>
        item.id === inputId
          ? { ...item, id: freshId, name: freshId, status: item.value == null ? "idle" : "ok", error: null }
          : item,
      ),
    };
  });
  return { project: next, newId: freshId };
}

function sourcePortTaken(
  project: ProjectDocument,
  sourceObjectId: string,
  sourceVariableId: string,
): boolean {
  return project.edges.some(
    (edge) =>
      isValueFlowEdge(edge) &&
      edge.sourceObjectId === sourceObjectId &&
      edge.sourceVariableId === sourceVariableId,
  );
}

function targetPortTaken(
  project: ProjectDocument,
  targetObjectId: string,
  targetVariableId: string,
): boolean {
  return project.edges.some(
    (edge) =>
      isValueFlowEdge(edge) &&
      edge.targetObjectId === targetObjectId &&
      edge.targetVariableId === targetVariableId,
  );
}

export function applyWorkspaceEdit(
  project: ProjectDocument,
  edit: WorkspaceEdit,
  catalog: QuantitySpec[],
): EditResult {
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
    case "addObject": {
      const id = nextObjectId(project);
      const index = project.objects.length;
      const object: CalculationObject = {
        kind: "calculation",
        id,
        name: nextObjectName(project),
        position: { x: 80 + index * 980, y: 88 },
        inputs: [],
        calculations: [],
        outputs: [],
        links: [],
      };
      return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
    }
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
    case "renameObject":
      return applyWorkspaceEdit(
        project,
        { type: "updateObject", objectId: edit.objectId, patch: { name: edit.name } },
        catalog,
      );
    case "updateObject": {
      const current = project.objects.find((item) => item.id === edit.objectId);
      if (!current) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const nextId = edit.patch.id ?? current.id;
      const nextName = (edit.patch.name ?? current.name).trim();
      if (!nextName) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      if (edit.patch.id && !OBJECT_ID_RE.test(edit.patch.id)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (objectIdentityTaken(project, { id: edit.patch.id, name: edit.patch.name }, current.id)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = project;
      if (nextId !== current.id) next = rekeyObject(next, current.id, nextId);
      next = {
        ...next,
        objects: next.objects.map((object) => (object.id === nextId ? { ...object, name: nextName } : object)),
      };
      const shouldEvaluate = isCalculationObject(current) && nextId !== current.id;
      return {
        project: next,
        dirtyObjectIds: shouldEvaluate ? [nextId] : [],
        shouldEvaluate,
      };
    }
    case "addInput": {
      const current = project.objects.find((item) => item.id === edit.objectId);
      if (!current || !isCalculationObject(current)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const id = nextGlobalPrefixedId(project, "IN");
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            inputs: [...object.inputs, { id, name: id, value: null, quantity: null, unit: null }],
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "removeInput":
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            inputs: object.inputs.filter((_, index) => index !== edit.index),
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "updateInput": {
      const host = project.objects.find((item) => item.id === edit.objectId);
      if (!host || !isCalculationObject(host)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const current = host.inputs[edit.index];
      if (!current) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const enabledMapped = project.edges.some(
        (edge) =>
          edge.enabled !== false &&
          isValueFlowEdge(edge) &&
          edge.targetObjectId === edit.objectId &&
          edge.targetVariableId === current.id,
      );
      if (enabledMapped && (edit.patch.id || edit.patch.name)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const patch = withSiUnit(withIdentityPatch(current, edit.patch as Partial<InputVariable>), catalog);
      if (patch.id !== current.id && identityTaken(project, { id: patch.id }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (patch.name !== current.name && identityTaken(project, { name: patch.name }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = patchObject(project, edit.objectId, (object) => ({
        ...object,
        inputs: object.inputs.map((item, index) => (index === edit.index ? { ...item, ...patch } : item)),
      }));
      if (patch.id !== current.id) {
        next = rekeyGlobalVariable(next, current.id, patch.id, patch.name);
      } else if (patch.name !== current.name) {
        next = applyDisplayName(next, current.id, patch.name);
      }
      if (patch.quantity !== current.quantity || patch.unit !== current.unit) {
        next = inheritMappedQuantity(
          next,
          edit.objectId,
          patch.id,
          patch.quantity ?? null,
          patch.unit ?? null,
        );
      }
      return {
        project: syncProjectObject(next, edit.objectId),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "addCalculation": {
      const current = project.objects.find((item) => item.id === edit.objectId);
      if (!current || !isCalculationObject(current)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const id = nextGlobalPrefixedId(project, "CALC");
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            calculations: [
              ...object.calculations,
              { id, name: id, formula: "", quantity: null, unit: null },
            ],
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "removeCalculation":
      return {
        project: syncProjectObject(
          patchObject(project, edit.objectId, (object) => ({
            ...object,
            calculations: object.calculations.filter((_, index) => index !== edit.index),
          })),
          edit.objectId,
        ),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "updateCalculation": {
      const host = project.objects.find((item) => item.id === edit.objectId);
      if (!host || !isCalculationObject(host)) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const current = host.calculations[edit.index];
      if (!current) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const patch = withSiUnit(withIdentityPatch(current, edit.patch as Partial<FormulaVariable>), catalog);
      if (patch.id !== current.id && identityTaken(project, { id: patch.id }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (patch.name !== current.name && identityTaken(project, { name: patch.name }, { objectId: edit.objectId, id: current.id })) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = patchObject(project, edit.objectId, (object) => ({
        ...object,
        calculations: object.calculations.map((item, index) => (index === edit.index ? { ...item, ...patch } : item)),
      }));
      if (patch.id !== current.id) {
        next = rekeyGlobalVariable(next, current.id, patch.id, patch.name);
      } else if (patch.name !== current.name) {
        next = applyDisplayName(next, current.id, patch.name);
      }
      if (patch.quantity !== current.quantity || patch.unit !== current.unit) {
        next = inheritMappedQuantity(
          next,
          edit.objectId,
          patch.id,
          patch.quantity ?? null,
          patch.unit ?? null,
        );
      }
      return {
        project: syncProjectObject(next, edit.objectId),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    }
    case "addOutput":
    case "removeOutput":
    case "updateOutput":
      return {
        project: syncProjectObject(project, edit.objectId),
        dirtyObjectIds: [edit.objectId],
        shouldEvaluate: true,
      };
    case "addLink":
      return addCalculationLink(project, edit.objectId);
    case "removeLink":
      return removeCalculationLink(project, edit.objectId, edit.index);
    case "updateLink":
      return updateCalculationLink(project, edit.objectId, edit.index, edit.patch);
    case "connectLink":
      return connectObjectLink(project, edit.objectId, edit.linkId, edit.targetObjectId, edit.targetPortId ?? null);
    case "connectMapping": {
      const sourceObject = project.objects.find((item) => item.id === edit.sourceObjectId);
      const targetObject = project.objects.find((item) => item.id === edit.targetObjectId);
      if (!sourceObject || !targetObject || edit.sourceObjectId === edit.targetObjectId) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const relationType: RelationType =
        edit.relationType ??
        (isLayoutObject(sourceObject) || isLayoutObject(targetObject) ? "association" : "value_flow");
      if (relationType !== "value_flow") {
        if (!_endpointExists(sourceObject, edit.sourceVariableId, "source") || !_endpointExists(targetObject, edit.targetVariableId, "target")) {
          return { project, dirtyObjectIds: [], shouldEvaluate: false };
        }
        const duplicate = project.edges.some(
          (edge) =>
            edge.sourceObjectId === edit.sourceObjectId &&
            edge.sourceVariableId === edit.sourceVariableId &&
            edge.targetObjectId === edit.targetObjectId &&
            edge.targetVariableId === edit.targetVariableId,
        );
        if (duplicate) return { project, dirtyObjectIds: [], shouldEvaluate: false };
        return {
          project: {
            ...project,
            edges: [
              ...project.edges,
              {
                id: `edge-${edit.sourceObjectId}-${edit.sourceVariableId}-${edit.targetObjectId}-${edit.targetVariableId}`,
                sourceObjectId: edit.sourceObjectId,
                sourceVariableId: edit.sourceVariableId,
                targetObjectId: edit.targetObjectId,
                targetVariableId: edit.targetVariableId,
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
      if (!isCalculationObject(sourceObject) || !isCalculationObject(targetObject)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const source = sourceVariable(sourceObject, edit.sourceVariableId);
      const target = targetObject.inputs.find((item) => item.id === edit.targetVariableId);
      if (!source || !target) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      if (targetObject.calculations.some((item) => item.id === source.id)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (sourcePortTaken(project, edit.sourceObjectId, edit.sourceVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      if (targetPortTaken(project, edit.targetObjectId, edit.targetVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const inherited = sourceQuantityFields(source, catalog);
      const oldId = target.id;
      let next = patchObject(project, edit.targetObjectId, (object) => {
        const rewritten = rewriteFormulas(object, oldId, source.id);
        return {
          ...rewritten,
          inputs: rewritten.inputs.map((item) =>
            item.id === oldId
              ? {
                  ...item,
                  id: source.id,
                  name: source.name,
                  quantity: inherited.quantity,
                  unit: inherited.unit,
                }
              : item,
          ),
        };
      });
      next = {
        ...next,
        edges: [
          ...next.edges,
          {
            id: `edge-${edit.sourceObjectId}-${source.id}-${edit.targetObjectId}-${source.id}`,
            sourceObjectId: edit.sourceObjectId,
            sourceVariableId: source.id,
            targetObjectId: edit.targetObjectId,
            targetVariableId: source.id,
            enabled: true,
            collapsed: false,
            relationType: "value_flow",
          },
        ],
      };
      return {
        project: syncProjectObject(next, edit.targetObjectId),
        dirtyObjectIds: [edit.sourceObjectId, edit.targetObjectId],
        shouldEvaluate: true,
      };
    }
    case "connectBySearch": {
      if (edit.sourceObjectId === edit.targetObjectId) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const targetObject = project.objects.find((item) => item.id === edit.targetObjectId);
      const sourceObject = project.objects.find((item) => item.id === edit.sourceObjectId);
      const relationType: RelationType =
        edit.relationType ??
        ((sourceObject && isLayoutObject(sourceObject)) ||
        (targetObject && isLayoutObject(targetObject))
          ? "association"
          : "value_flow");
      if (relationType === "value_flow" && sourcePortTaken(project, edit.sourceObjectId, edit.sourceVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = project;
      let targetVariableId = edit.targetVariableId;
      if (!targetVariableId) {
        if (!targetObject || isLayoutObject(targetObject)) {
          return { project, dirtyObjectIds: [], shouldEvaluate: false };
        }
        next = applyWorkspaceEdit(next, { type: "addInput", objectId: edit.targetObjectId }, catalog).project;
        const created = next.objects.find((item) => item.id === edit.targetObjectId);
        targetVariableId = created && isCalculationObject(created) ? created.inputs.at(-1)?.id : undefined;
      }
      if (!targetVariableId) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      return applyWorkspaceEdit(
        next,
        {
          type: "connectMapping",
          sourceObjectId: edit.sourceObjectId,
          sourceVariableId: edit.sourceVariableId,
          targetObjectId: edit.targetObjectId,
          targetVariableId,
          relationType,
        },
        catalog,
      );
    }
    case "toggleEdge": {
      const edge = project.edges.find((item) => item.id === edit.edgeId);
      if (!edge) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      if (!isValueFlowEdge(edge)) {
        return {
          project: {
            ...project,
            edges: project.edges.map((item) =>
              item.id === edge.id ? { ...item, enabled: item.enabled === false } : item,
            ),
          },
          dirtyObjectIds: [],
          shouldEvaluate: false,
        };
      }
      if (edge.enabled !== false) {
        const detached = detachMappedInput(project, edge.targetObjectId, edge.targetVariableId);
        const next = {
          ...detached.project,
          edges: detached.project.edges.map((item) =>
            item.id === edge.id ? { ...item, enabled: false, targetVariableId: detached.newId } : item,
          ),
        };
        return {
          project: syncProjectObject(next, edge.targetObjectId),
          dirtyObjectIds: [edge.sourceObjectId, edge.targetObjectId],
          shouldEvaluate: true,
        };
      }
      const sourceObject = project.objects.find((item) => item.id === edge.sourceObjectId);
      const source =
        sourceObject && isCalculationObject(sourceObject)
          ? sourceVariable(sourceObject, edge.sourceVariableId)
          : null;
      if (!source) return { project, dirtyObjectIds: [], shouldEvaluate: false };
      const oldId = edge.targetVariableId;
      const inherited = sourceQuantityFields(source, catalog);
      let next = patchObject(project, edge.targetObjectId, (object) => {
        const rewritten = rewriteFormulas(object, oldId, source.id);
        return {
          ...rewritten,
          inputs: rewritten.inputs.map((item) =>
            item.id === oldId
              ? { ...item, id: source.id, name: source.name, quantity: inherited.quantity, unit: inherited.unit }
              : item,
          ),
        };
      });
      next = {
        ...next,
        edges: next.edges.map((item) =>
          item.id === edge.id ? { ...item, enabled: true, targetVariableId: source.id } : item,
        ),
      };
      return {
        project: syncProjectObject(next, edge.targetObjectId),
        dirtyObjectIds: [edge.sourceObjectId, edge.targetObjectId],
        shouldEvaluate: true,
      };
    }
    case "toggleEdgeCollapsed": {
      if (!project.edges.some((item) => item.id === edit.edgeId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      return {
        project: {
          ...project,
          edges: project.edges.map((item) =>
            item.id === edit.edgeId ? { ...item, collapsed: item.collapsed !== true } : item,
          ),
        },
        dirtyObjectIds: [],
        shouldEvaluate: false,
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
    case "addEquipment":
      return addWorksheetEquipment(project, edit.symbolId);
    case "addPoint":
      return addWorksheetPoint(project);
    case "updateEquipment":
      return updateWorksheetEquipment(project, edit.objectId, edit.patch);
    case "updatePointEnd":
      return updateWorksheetPointEnd(project, edit.pointId, edit.end, edit.patch);
    case "duplicateObjects":
      return duplicateWorksheetObjects(project, edit.objectIds);
    case "rotateEquipment":
      return rotateWorksheetEquipment(project, edit.objectIds, edit.delta ?? 90);
    case "alignObjects":
      return alignWorksheetObjects(project, edit.objectIds, edit.mode);
    case "updatePoint":
      return updateWorksheetPoint(project, edit.objectId, edit.patch);
    case "setEquipmentPorts":
      return setEquipmentPorts(project, edit.objectId, edit.inCount, edit.outCount);
    case "setObjectLinkSide":
      return setObjectLinkSide(project, edit.objectId, edit.side);
    case "connectPointEnd":
      return connectPointEnd(
        project,
        edit.pointId,
        edit.end,
        edit.targetObjectId,
        edit.targetPortId,
        edit.reversed,
      );
    case "togglePointLink":
      return togglePointLink(project, edit.pointId, edit.end);
    case "connectArrangement":
      return connectArrangement(project, edit);
  }
}

function _endpointExists(
  object: ProjectDocument["objects"][number],
  portId: string,
  role: "source" | "target",
): boolean {
  if (isLayoutObject(object)) {
    return layoutPortExists(object, portId);
  }
  if (role === "source") {
    return (
      object.outputs.some((item) => item.id === portId) ||
      (object.links ?? []).some((item) => item.id === portId)
    );
  }
  return object.inputs.some((item) => item.id === portId);
}

function noEval(project: ProjectDocument): EditResult {
  return { project, dirtyObjectIds: [], shouldEvaluate: false };
}

function addWorksheetEquipment(project: ProjectDocument, symbolId?: string): EditResult {
  const id = nextPrefixedObjectId(project, "EQ");
  const nextSymbol = symbolId?.trim() || "generic-equipment";
  const ports = symbolPortDefaults(nextSymbol);
  const object: EquipmentObject = {
    kind: "equipment",
    id,
    name: nextEquipmentName(project, nextSymbol),
    position: nextLayoutPosition(project),
    symbolId: nextSymbol,
    inCount: ports.inCount,
    outCount: ports.outCount,
    rotation: 0,
  };
  return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
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
    width: patch.width !== undefined ? evenGridSize(patch.width) : current.width,
    height: patch.height !== undefined ? evenGridSize(patch.height) : current.height,
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
  const usedObjectNames = new Set(project.objects.map((item) => item.name));
  const usedVars = new Set(allVariableIds(project));
  const usedVarNames = new Set(
    project.objects.flatMap((item) => {
      if (!isCalculationObject(item)) return [];
      return [...item.inputs, ...item.calculations, ...item.outputs, ...(item.links ?? [])].map((row) => row.name);
    }),
  );
  const idMap = new Map<string, string>();
  for (const item of selected) {
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

function addWorksheetPoint(project: ProjectDocument): EditResult {
  const id = nextPrefixedObjectId(project, "PT");
  const object = normalizePointObject({
    id,
    name: id,
    position: nextLayoutPosition(project),
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
  const updated: EquipmentObject = { ...equipment, inCount: nextIn, outCount: nextOut };
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

function setObjectLinkSide(
  project: ProjectDocument,
  objectId: string,
  side: "top" | "bottom",
): EditResult {
  if (side !== "top" && side !== "bottom") return noEval(project);
  if (!project.objects.some((item) => item.id === objectId)) return noEval(project);
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

function connectPointEnd(
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

function addCalculationLink(project: ProjectDocument, objectId: string): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const id = nextGlobalPrefixedId(project, "LINK");
  const link: CalculationLink = { id, name: id, targetObjectId: null, targetPortId: null };
  return {
    project: patchObject(project, objectId, (current) => ({
      ...current,
      links: [...(current.links ?? []), link],
    })),
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function removeCalculationLink(project: ProjectDocument, objectId: string, index: number): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const removed = (object.links ?? [])[index];
  const next = patchObject(project, objectId, (current) => ({
    ...current,
    links: (current.links ?? []).filter((_, itemIndex) => itemIndex !== index),
  }));
  return {
    project: {
      ...next,
      edges: next.edges.filter(
        (edge) =>
          !(
            edge.sourceObjectId === objectId &&
            removed &&
            edge.sourceVariableId === removed.id &&
            !isValueFlowEdge(edge)
          ),
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function updateCalculationLink(
  project: ProjectDocument,
  objectId: string,
  index: number,
  patch: Partial<CalculationLink>,
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const current = (object.links ?? [])[index];
  if (!current) return noEval(project);
  const nextId = patch.id ?? current.id;
  const nextName = (patch.name ?? current.name).trim() || nextId;
  if (!VARIABLE_ID_RE.test(nextId)) return noEval(project);
  if (nextId !== current.id && (object.links ?? []).some((item) => item.id === nextId)) return noEval(project);
  const next = patchObject(project, objectId, (item) => ({
    ...item,
    links: (item.links ?? []).map((link, itemIndex) =>
      itemIndex === index ? { ...link, id: nextId, name: nextName } : link,
    ),
  }));
  return {
    project: {
      ...next,
      edges: next.edges.map((edge) =>
        edge.sourceObjectId === objectId && edge.sourceVariableId === current.id
          ? { ...edge, sourceVariableId: nextId }
          : edge,
      ),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function connectObjectLink(
  project: ProjectDocument,
  objectId: string,
  linkId: string | undefined,
  targetObjectId: string | null,
  targetPortId: string | null,
): EditResult {
  let next = project;
  let resolvedId = linkId;
  const object = next.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  if (targetObjectId && !canConnectObjectLink(next, objectId, targetObjectId, resolvedId)) {
    return noEval(project);
  }
  if (!resolvedId) {
    const empty = (object.links ?? []).find((item) => !item.targetObjectId);
    if (empty) {
      resolvedId = empty.id;
    } else {
      next = addCalculationLink(next, objectId).project;
      const created = next.objects.find((item) => item.id === objectId);
      resolvedId =
        created && isCalculationObject(created) ? created.links?.at(-1)?.id : undefined;
    }
  }
  if (!resolvedId) return noEval(project);
  return connectCalculationLink(next, objectId, resolvedId, targetObjectId, targetPortId);
}

function connectCalculationLink(
  project: ProjectDocument,
  objectId: string,
  linkId: string,
  targetObjectId: string | null,
  _targetPortId: string | null,
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isCalculationObject(object)) return noEval(project);
  const link = (object.links ?? []).find((item) => item.id === linkId);
  if (!link) return noEval(project);
  if (targetObjectId) {
    const host = project.objects.find((item) => item.id === targetObjectId);
    if (!host || !isLayoutObject(host)) return noEval(project);
    if (!canConnectObjectLink(project, objectId, targetObjectId, linkId)) return noEval(project);
  }
  const nextPort = targetObjectId ? OBJECT_LINK_HANDLE : null;
  const next = patchObject(project, objectId, (item) => ({
    ...item,
    links: (item.links ?? []).map((itemLink) =>
      itemLink.id === linkId ? { ...itemLink, targetObjectId, targetPortId: nextPort } : itemLink,
    ),
  }));
  const without = next.edges.filter(
    (edge) => !(edge.sourceObjectId === objectId && edge.sourceVariableId === linkId && !isValueFlowEdge(edge)),
  );
  if (!targetObjectId) {
    return { project: { ...next, edges: without }, dirtyObjectIds: [], shouldEvaluate: false };
  }
  return {
    project: {
      ...next,
      edges: [
        ...without,
        {
          id: `edge-${objectId}-${linkId}-${targetObjectId}-${nextPort}`,
          sourceObjectId: objectId,
          sourceVariableId: linkId,
          targetObjectId,
          targetVariableId: nextPort ?? targetObjectId,
          enabled: true,
          collapsed: false,
          relationType: "association",
        },
      ],
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function withSiUnit<T extends { quantity?: string | null; unit?: string | null }>(
  patch: T,
  catalog: QuantitySpec[],
): T {
  if (!("quantity" in patch)) return patch;
  return { ...patch, unit: siUnitFor(patch.quantity, catalog) };
}
