import type {
  ArrangementObject,
  CalculationObject,
  FormulaVariable,
  InputVariable,
  OutputBinding,
  ProjectDocument,
  RelationType,
} from "../types/contract";
import { blankProject } from "../example/blankProject";
import { prototypeProject } from "../example/prototypeProject";
import { siUnitFor, type QuantitySpec } from "./quantities";
import {
  displayName,
  identityTaken,
  nextGlobalPrefixedId,
  sourceVariable,
} from "./variables";
import {
  arrangementElementIds,
  clampConnectionCount,
  defaultElementView,
  emptyArrangementDomain,
  hasEquipmentPort,
  isArrangementObject,
  isCalculationObject,
  isValueFlowEdge,
  normalizeArrangementPoint,
  parsePointConnectionEnd,
  pointViewSize,
} from "./worksheet";

export const VARIABLE_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const OBJECT_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export type WorkspaceEdit =
  | { type: "addObject" }
  | { type: "addArrangement" }
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
  | { type: "addEquipment"; objectId: string }
  | { type: "addPoint"; objectId: string }
  | {
      type: "updatePoint";
      objectId: string;
      pointId: string;
      patch: { id?: string; name?: string; connectionCount?: number };
    }
  | { type: "setEquipmentPorts"; objectId: string; equipmentId: string; inCount?: number; outCount?: number }
  | {
      type: "connectPointEnd";
      objectId: string;
      pointId: string;
      end: string;
      equipmentId: string | null;
      portId: string | null;
    }
  | { type: "moveElement"; objectId: string; elementId: string; x: number; y: number }
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

function nextArrangementName(project: ProjectDocument): string {
  const used = new Set(project.objects.map((item) => item.name.trim()));
  let n = 1;
  while (used.has(`Arrangement ${n}`)) n += 1;
  return `Arrangement ${n}`;
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
    objects: project.objects.map((object) => (object.id === fromId ? { ...object, id: toId } : object)),
    edges: project.edges.map((edge) => ({
      ...edge,
      sourceObjectId: edge.sourceObjectId === fromId ? toId : edge.sourceObjectId,
      targetObjectId: edge.targetObjectId === fromId ? toId : edge.targetObjectId,
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

function patchArrangement(
  project: ProjectDocument,
  objectId: string,
  mutate: (object: ArrangementObject) => ArrangementObject,
): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map((object) => {
      if (object.id !== objectId || !isArrangementObject(object)) return object;
      return mutate(object);
    }),
  };
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
      };
      return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
    }
    case "addArrangement": {
      const id = nextObjectId(project);
      const index = project.objects.length;
      const object = defaultArrangement(id, nextArrangementName(project), {
        x: 80,
        y: 88 + index * 40,
      });
      return { project: { ...project, objects: [...project.objects, object] }, dirtyObjectIds: [], shouldEvaluate: false };
    }
    case "deleteObject":
      return {
        project: {
          ...project,
          objects: project.objects.filter((object) => object.id !== edit.objectId),
          edges: project.edges.filter(
            (edge) => edge.sourceObjectId !== edit.objectId && edge.targetObjectId !== edit.objectId,
          ),
        },
        dirtyObjectIds: [],
        shouldEvaluate: true,
      };
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
      next = patchObject(next, nextId, (object) => ({ ...object, name: nextName }));
      return {
        project: next,
        dirtyObjectIds: nextId === current.id ? [] : [nextId],
        shouldEvaluate: nextId !== current.id,
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
    case "connectMapping": {
      const sourceObject = project.objects.find((item) => item.id === edit.sourceObjectId);
      const targetObject = project.objects.find((item) => item.id === edit.targetObjectId);
      if (!sourceObject || !targetObject || edit.sourceObjectId === edit.targetObjectId) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      const relationType: RelationType =
        edit.relationType ??
        (isArrangementObject(sourceObject) || isArrangementObject(targetObject) ? "association" : "value_flow");
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
        ((sourceObject && isArrangementObject(sourceObject)) ||
        (targetObject && isArrangementObject(targetObject))
          ? "association"
          : "value_flow");
      if (relationType === "value_flow" && sourcePortTaken(project, edit.sourceObjectId, edit.sourceVariableId)) {
        return { project, dirtyObjectIds: [], shouldEvaluate: false };
      }
      let next = project;
      let targetVariableId = edit.targetVariableId;
      if (!targetVariableId) {
        if (!targetObject || isArrangementObject(targetObject)) {
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
      const dropping = project.edges.filter((edge) => removed.has(edge.id));
      let next = project;
      for (const edge of dropping) {
        if (edge.enabled !== false && isValueFlowEdge(edge)) {
          next = detachMappedInput(next, edge.targetObjectId, edge.targetVariableId).project;
        }
      }
      next = { ...next, edges: next.edges.filter((edge) => !removed.has(edge.id)) };
      next = syncAllObjects(next);
      return {
        project: next,
        dirtyObjectIds: dropping.filter(isValueFlowEdge).map((edge) => edge.targetObjectId),
        shouldEvaluate: dropping.some(isValueFlowEdge),
      };
    }
    case "addEquipment":
      return addArrangementEquipment(project, edit.objectId);
    case "addPoint":
      return addArrangementPoint(project, edit.objectId);
    case "updatePoint":
      return updateArrangementPoint(project, edit.objectId, edit.pointId, edit.patch);
    case "setEquipmentPorts":
      return setEquipmentPorts(project, edit.objectId, edit.equipmentId, edit.inCount, edit.outCount);
    case "connectPointEnd":
      return connectPointEnd(project, edit.objectId, edit.pointId, edit.end, edit.equipmentId, edit.portId);
    case "moveElement":
      return moveArrangementElement(project, edit.objectId, edit.elementId, edit.x, edit.y);
  }
}

function _endpointExists(
  object: ProjectDocument["objects"][number],
  portId: string,
  role: "source" | "target",
): boolean {
  if (isArrangementObject(object)) {
    return object.domain.points.some((point) => point.id === portId);
  }
  if (role === "source") {
    return object.outputs.some((item) => item.id === portId);
  }
  return object.inputs.some((item) => item.id === portId);
}

function nextArrangementElementId(object: ArrangementObject, prefix: string): string {
  const used = arrangementElementIds(object);
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

function defaultArrangement(id: string, name: string, position: { x: number; y: number }): ArrangementObject {
  const eq1 = defaultElementView(48, 80);
  const eq2 = defaultElementView(320, 80);
  return {
    kind: "arrangement",
    id,
    name,
    position,
    domain: {
      ...emptyArrangementDomain(),
      equipment: [
        { id: "EQ_1", name: "Equipment 1", symbolId: "generic-equipment", inCount: 1, outCount: 1 },
        { id: "EQ_2", name: "Equipment 2", symbolId: "generic-equipment", inCount: 1, outCount: 1 },
      ],
    },
    view: {
      width: 720,
      height: 400,
      rotation: 0,
      zIndex: 0,
      elements: {
        EQ_1: eq1,
        EQ_2: eq2,
      },
    },
  };
}

function noEval(project: ProjectDocument): EditResult {
  return { project, dirtyObjectIds: [], shouldEvaluate: false };
}

function addArrangementEquipment(project: ProjectDocument, objectId: string): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isArrangementObject(object)) return noEval(project);
  const id = nextArrangementElementId(object, "EQ");
  const count = object.domain.equipment.length;
  const view = defaultElementView(48 + count * 160, 72, 112, 72);
  return {
    project: patchArrangement(project, objectId, (current) => ({
      ...current,
      domain: {
        ...current.domain,
        equipment: [
          ...current.domain.equipment,
          { id, name: id, symbolId: "generic-equipment", inCount: 1, outCount: 1 },
        ],
      },
      view: {
        ...current.view,
        elements: { ...current.view.elements, [id]: view },
      },
    })),
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function addArrangementPoint(project: ProjectDocument, objectId: string): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isArrangementObject(object)) return noEval(project);
  const id = nextArrangementElementId(object, "PT");
  const first = object.domain.equipment[0] ? object.view.elements[object.domain.equipment[0].id] : undefined;
  const second = object.domain.equipment[1] ? object.view.elements[object.domain.equipment[1].id] : undefined;
  const size = pointViewSize(2);
  const midX = first && second ? (first.x + first.width + second.x) / 2 - size.width / 2 : object.view.width / 2 - size.width / 2;
  const midY = first ? first.y + first.height / 2 - size.height / 2 : object.view.height / 2 - size.height / 2;
  const view = defaultElementView(midX, midY, size.width, size.height);
  return {
    project: patchArrangement(project, objectId, (current) => ({
      ...current,
      domain: {
        ...current.domain,
        points: [...current.domain.points, normalizeArrangementPoint({ id, name: id, connectionCount: 2 })],
      },
      view: {
        ...current.view,
        elements: { ...current.view.elements, [id]: view },
      },
    })),
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function updateArrangementPoint(
  project: ProjectDocument,
  objectId: string,
  pointId: string,
  patch: { id?: string; name?: string; connectionCount?: number },
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isArrangementObject(object)) return noEval(project);
  const current = object.domain.points.find((item) => item.id === pointId);
  if (!current) return noEval(project);
  const nextId = patch.id ?? current.id;
  const nextName = (patch.name ?? current.name).trim() || nextId;
  if (!VARIABLE_ID_RE.test(nextId)) return noEval(project);
  if (nextId !== current.id && arrangementElementIds(object).has(nextId)) return noEval(project);
  const nextCount = clampConnectionCount(patch.connectionCount, current.connectionCount);
  const nextPoint = normalizeArrangementPoint({
    ...current,
    id: nextId,
    name: nextName,
    connectionCount: nextCount,
  });
  const nextSize = pointViewSize(nextCount);
  const next = patchArrangement(project, objectId, (item) => {
    const elements = { ...item.view.elements };
    if (nextId !== pointId && elements[pointId]) {
      elements[nextId] = elements[pointId]!;
      delete elements[pointId];
    }
    const previous = elements[nextId];
    if (previous && patch.connectionCount != null) {
      elements[nextId] = { ...previous, width: nextSize.width, height: nextSize.height };
    }
    return {
      ...item,
      domain: {
        ...item.domain,
        points: item.domain.points.map((point) => (point.id === pointId ? nextPoint : point)),
      },
      view: { ...item.view, elements },
    };
  });
  return {
    project: {
      ...next,
      edges: next.edges.map((edge) => ({
        ...edge,
        sourceVariableId:
          edge.sourceObjectId === objectId && edge.sourceVariableId === pointId ? nextId : edge.sourceVariableId,
        targetVariableId:
          edge.targetObjectId === objectId && edge.targetVariableId === pointId ? nextId : edge.targetVariableId,
      })),
    },
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function clampPortCount(value: number | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

function setEquipmentPorts(
  project: ProjectDocument,
  objectId: string,
  equipmentId: string,
  inCount: number | undefined,
  outCount: number | undefined,
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isArrangementObject(object)) return noEval(project);
  const equipment = object.domain.equipment.find((item) => item.id === equipmentId);
  if (!equipment) return noEval(project);
  const nextIn = clampPortCount(inCount, equipment.inCount);
  const nextOut = clampPortCount(outCount, equipment.outCount);
  return {
    project: patchArrangement(project, objectId, (current) => {
      const updated = current.domain.equipment.map((item) =>
        item.id === equipmentId ? { ...item, inCount: nextIn, outCount: nextOut } : item,
      );
      const byId = new Map(updated.map((item) => [item.id, item]));
      return {
        ...current,
        domain: {
          equipment: updated,
          points: current.domain.points.map((point) =>
            normalizeArrangementPoint({
              ...point,
              connections: point.connections.map((end) => {
                if (!end) return null;
                const host = byId.get(end.equipmentId);
                if (host && hasEquipmentPort(host, end.portId)) return end;
                return end.equipmentId === equipmentId ? null : end;
              }),
            }),
          ),
        },
      };
    }),
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function connectPointEnd(
  project: ProjectDocument,
  objectId: string,
  pointId: string,
  end: string,
  equipmentId: string | null,
  portId: string | null,
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isArrangementObject(object)) return noEval(project);
  const point = object.domain.points.find((item) => item.id === pointId);
  if (!point) return noEval(project);
  const index = parsePointConnectionEnd(end);
  if (index == null || index >= point.connectionCount) return noEval(project);
  let nextEnd: { equipmentId: string; portId: string } | null = null;
  if (equipmentId && portId) {
    const host = object.domain.equipment.find((item) => item.id === equipmentId);
    if (!host || !hasEquipmentPort(host, portId)) return noEval(project);
    nextEnd = { equipmentId, portId };
  }
  return {
    project: patchArrangement(project, objectId, (current) => ({
      ...current,
      domain: {
        ...current.domain,
        points: current.domain.points.map((item) => {
          if (item.id !== pointId) return item;
          const connections = [...item.connections];
          connections[index] = nextEnd;
          return normalizeArrangementPoint({ ...item, connections });
        }),
      },
    })),
    dirtyObjectIds: [],
    shouldEvaluate: false,
  };
}

function normalizeLoadedProject(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    objects: project.objects.map((object) => {
      if (!isArrangementObject(object)) return object;
      return {
        ...object,
        domain: {
          ...object.domain,
          points: object.domain.points.map((point) => normalizeArrangementPoint(point)),
        },
      };
    }),
  };
}

function moveArrangementElement(
  project: ProjectDocument,
  objectId: string,
  elementId: string,
  x: number,
  y: number,
): EditResult {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || !isArrangementObject(object)) return noEval(project);
  const previous = object.view.elements[elementId];
  if (!previous) return noEval(project);
  return {
    project: patchArrangement(project, objectId, (current) => ({
      ...current,
      view: {
        ...current.view,
        elements: { ...current.view.elements, [elementId]: { ...previous, x, y } },
      },
    })),
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
